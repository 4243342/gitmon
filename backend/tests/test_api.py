"""API 端到端：用假扫描器跑完整链路（孵化 → 图鉴 → 同步 → 渲染）。"""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from conftest import make_snapshot
from fastapi.testclient import TestClient

from gitmon_api import auth, config, services
from gitmon_api.errors import RepoNotFound
from gitmon_api.main import create_app
from gitmon_api.scanner.http import HttpClient

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@pytest.fixture()
def scan_calls() -> dict[str, int]:
    return {"count": 0}


@pytest.fixture()
def client(tmp_dir, monkeypatch, scan_calls):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    monkeypatch.setattr(settings, "cache_ttl", 21600)
    settings.ensure_dirs()

    def fake_scan(ref, since=None, token=None):
        scan_calls["count"] += 1
        scan_calls["token"] = token or ""
        return make_snapshot(f"{ref.platform}.com/{ref.full_name}")

    monkeypatch.setattr(services, "_scan", fake_scan)
    app = create_app(start_queue=True)
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    payload = client.get("/api/health").json()
    assert payload["ok"] is True
    assert payload["version"] == "0.2.0"
    assert set(payload["tokens"]) == {"github", "gitee"}


def test_meta_lists_varieties(client: TestClient) -> None:
    payload = client.get("/api/meta").json()
    assert len(payload["elements"]) == 9
    assert len(payload["species"]) == 7
    assert {q["key"] for q in payload["qualities"]} == {"N", "R", "SR", "SSR"}


def test_hatch_sync_and_cache(client: TestClient, scan_calls) -> None:
    response = client.post("/api/hatch/sync", json={"repo": "https://github.com/acme/widget"})
    assert response.status_code == 200
    pet = response.json()
    assert pet["fullName"] == "acme/widget"
    assert pet["platform"] == "github"
    assert pet["element"]["key"] == "thunder"
    assert pet["species"]["key"] == "beast"
    assert pet["quality"]["key"] in {"N", "R", "SR", "SSR"}
    assert 1 <= pet["level"] <= 999
    assert len(pet["stats"]) == 6
    assert pet["spriteUrl"].endswith("/sprite.png")
    assert scan_calls["count"] == 1

    again = client.post("/api/hatch/sync", json={"repo": "acme/widget"}).json()
    assert again["id"] == pet["id"]
    assert scan_calls["count"] == 1  # 6 小时缓存内不重复扫

    refreshed = client.post("/api/hatch/sync", json={"repo": "acme/widget", "refresh": True}).json()
    assert refreshed["id"] == pet["id"]
    assert refreshed["element"]["key"] == pet["element"]["key"]  # 品种锁定，不换脸
    assert scan_calls["count"] == 2


def test_hatch_rejects_bad_input(client: TestClient) -> None:
    response = client.post("/api/hatch", json={"repo": "nonsense"})
    assert response.status_code == 400
    assert "error" in response.json()


def test_job_flow(client: TestClient) -> None:
    created = client.post("/api/hatch", json={"repo": "gitee.com/mirrors/vue"})
    assert created.status_code == 202
    job_id = created.json()["jobId"]

    deadline = time.time() + 10
    payload = {}
    while time.time() < deadline:
        payload = client.get(f"/api/jobs/{job_id}").json()
        if payload["status"] in {"done", "failed"}:
            break
        time.sleep(0.05)
    assert payload["status"] == "done", payload
    assert payload["pet"]["platform"] == "gitee"


def test_unknown_job_404(client: TestClient) -> None:
    assert client.get("/api/jobs/nope").status_code == 404


def test_cloud_collection_restarts_for_existing_account(client, monkeypatch) -> None:
    from gitmon_api import api
    from gitmon_api.db import db

    user = auth.upsert_user(provider="github", login="reset", name="Reset", avatar="", email="",
                            token="ghp_reset", scopes="", source="token")
    client.cookies.set(auth.SESSION_COOKIE, auth.create_session(user["id"]))

    def scan(ref, *, token, allow_private, purpose, quality):
        assert quality
        return make_snapshot(f"github.com/{ref.full_name}", repo_id="1234")

    def hatch():
        started = client.post("/api/cloud/previews", json={"repo": "reset/widget"})
        assert started.status_code == 202
        path = f"/api/cloud/previews/{started.json()['jobId']}"
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = client.get(path).json()
            if job["status"] == "done":
                return path
            assert job["status"] != "failed", job
            time.sleep(0.02)
        pytest.fail("cloud preview did not finish")

    monkeypatch.setattr(services, "_scan", scan)
    with monkeypatch.context() as old_release:
        old_release.setattr(api, "_cloud_owner", lambda user: f"cloud:{user['id']}")
        old_preview = hatch()
        old_pet = client.post(f"{old_preview}/collect").json()
        with db.connect() as conn:
            conn.execute("UPDATE pets SET exp=75, bond=12 WHERE id=?", (old_pet["id"],))
        assert client.get("/api/cloud/pets").json()["items"][0]["exp"] == 75

    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/cloud/pets").json()["items"] == []
    assert client.get(old_preview).status_code == 404
    assert client.post(f"{old_preview}/collect").status_code == 404
    assert client.get(old_pet["spriteUrl"]).status_code == 404
    assert client.post(f"/api/cloud/pets/{old_pet['id']}/refresh").status_code == 404

    new_preview = hatch()
    assert client.get("/api/cloud/pets").json()["items"] == []
    new_pet = client.post(f"{new_preview}/collect").json()
    assert new_pet["id"] != old_pet["id"] and new_pet["repoId"] == old_pet["repoId"]
    assert new_pet["exp"] == new_pet["bond"] == 0
    assert new_pet["species"] == old_pet["species"] and new_pet["spriteSeed"] == old_pet["spriteSeed"]
    assert client.get("/api/cloud/pets").json()["items"] == [new_pet]
    with db.connect() as conn:
        conn.execute("UPDATE pets SET card_ratings='{}' WHERE id=?", (new_pet["id"],))
        prior = conn.execute("SELECT exp, bond FROM pets WHERE id=?", (old_pet["id"],)).fetchone()
        assert tuple(prior) == (75, 12)
    legacy = client.get("/api/cloud/pets").json()["items"][0]
    assert legacy["rarity"]["status"] == legacy["qualityRating"]["status"] == "pending"
    assert legacy["spriteUrl"] == new_pet["spriteUrl"]
    assert legacy["cardArt"] is None and legacy["cardElement"] == legacy["element"]


def test_cloud_card_faces_match_all_lineage_assets() -> None:
    from gitmon_api import cloud, purpose

    assets = Path(__file__).resolve().parents[2] / "src" / "assets" / "creatures"
    paths = set()
    for origin in purpose.ELEMENTS.values():
        lineage = origin["key"].removeprefix("purpose_")
        ranks = ("iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "king")
        for number, rank in enumerate(ranks, start=1):
            face = cloud._card_face(origin, {"status": "confirmed", "key": rank})
            assert face["cardElement"]["name"] == ("神" if rank == "king" else origin["name"])
            assert face["cardArt"] == f"{lineage}/{number:02d}-{rank}.png"
            paths.add(assets / face["cardArt"])
        for rating in ({}, {"status": "pending", "key": "king"}, {"status": "not_applicable"}):
            assert cloud._card_face(origin, rating) == {"cardElement": origin, "cardArt": None}
    assert len(paths) == 48 and paths == set(assets.glob("*/*.png"))
    king = cloud._card_face(purpose.PENDING, {"status": "confirmed", "key": "king"})
    assert king["cardArt"] is None and king["cardElement"]["name"] == "神"


def test_cloud_hatch_claim_and_refresh(client, monkeypatch, weak_snapshot) -> None:
    def session(login: str) -> str:
        user = auth.upsert_user(provider="github", login=login, name=login, avatar="", email="",
                                token=f"ghp_{login}", scopes="repo", source="oauth")
        return auth.create_session(user["id"])

    def as_session(sid: str) -> None:
        client.cookies.set(auth.SESSION_COOKIE, sid)

    repo_name = "acme/widget"
    repo_id = "13579"
    weakened = False

    def scan(ref, *, token, allow_private, purpose, quality):
        assert quality
        if ref.platform == "gitee":
            assert token == "" and not allow_private
        else:
            assert token in {"ghp_alice", "ghp_bob"} and allow_private
        url = f"https://{ref.platform}.com/{repo_name}"
        if weakened:
            snapshot = make_snapshot(url, tree=weak_snapshot.tree,
                                     deps=weak_snapshot.dependencies, language="Python",
                                     stars=0, contributors=1, commits_52w=[0] * 52, readme_chars=0)
        else:
            snapshot = make_snapshot(url)
        snapshot.fetched_at = time.time()
        snapshot.repo_id = repo_id
        snapshot.private = ref.platform == "github"
        if purpose(snapshot) and not weakened:
            snapshot.purpose_evidence = {
                "readme": "Identity and access management for applications. Sign in with OpenID Connect.",
                "artifacts": {"cmd/auth-server": "Identity provider for user authentication and authorization"},
                "sources": {"server/authentication/oidc.go": "Implements OpenID Connect and access control."},
            }
        return snapshot

    def preview(repo: str) -> tuple[str, dict]:
        created = client.post("/api/cloud/previews", json={"repo": repo})
        assert created.status_code == 202
        job_id = created.json()["jobId"]
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = client.get(f"/api/cloud/previews/{job_id}").json()
            if job["status"] == "done":
                return job_id, job["pet"]
            assert job["status"] != "failed", job
            time.sleep(0.02)
        pytest.fail("cloud preview did not finish")

    monkeypatch.setattr(services, "_scan", scan)
    assert client.get("/api/cloud/pets", headers={"X-Gitmon-User": "alice"}).status_code == 401
    alice, second_device, bob = session("alice"), session("alice"), session("bob")
    as_session(alice)
    job_id, pet = preview("https://github.com/ACME/Widget")
    assert pet["fullName"] == "acme/widget" and pet["repoId"] == "13579"
    assert pet["element"]["key"] == "purpose_dark" and pet["attributeSource"] == "rules"
    assert pet["battleElement"]["key"] == "thunder"
    assert pet["rarity"]["status"] == "unrated"
    assert pet["qualityRating"]["status"] == "pending"
    assert client.get("/api/cloud/pets").json()["items"] == []
    assert client.get(f"/api/jobs/{job_id}").status_code == 404
    preview_sprite = client.get(pet["spriteUrl"]).content
    assert preview_sprite.startswith(PNG_SIGNATURE)

    claim_path = f"/api/cloud/previews/{job_id}/collect"
    as_session(bob)
    assert client.post(claim_path).status_code == 404
    assert client.get(pet["spriteUrl"]).status_code == 404
    as_session(alice)
    saved = client.post(claim_path).json()
    assert saved["id"] == client.post(claim_path).json()["id"] == pet["id"]

    as_session(second_device)
    assert client.get("/api/cloud/pets").json()["items"] == [saved]
    assert client.get(saved["spriteUrl"]).content == preview_sprite
    assert client.get(f"/api/pets/{saved['id']}").status_code == 404
    as_session(bob)
    assert client.get("/api/cloud/pets").json()["items"] == []
    assert client.get(saved["spriteUrl"]).status_code == 404
    assert client.post(f"/api/cloud/pets/{saved['id']}/refresh").status_code == 404

    weakened = True
    repo_name = "acme/renamed"
    _, bob_preview = preview("https://github.com/acme/renamed")
    assert bob_preview["id"] != saved["id"]
    assert bob_preview["species"] == saved["species"]
    stage = saved["evolutionStage"]
    assert client.get(f"{bob_preview['spriteUrl'].split('?')[0]}?stage={stage}").content == preview_sprite

    as_session(alice)
    refreshed = client.post(f"/api/cloud/pets/{saved['id']}/refresh").json()
    assert refreshed["fullName"] == "acme/renamed"
    assert refreshed["id"] == saved["id"]
    for field in ("element", "elementSecondary", "species", "spriteSeed", "evolutionStage"):
        assert refreshed[field] == saved[field]
    assert refreshed["qualityScore"] != saved["qualityScore"]
    assert refreshed["stats"] != saved["stats"]
    assert client.get(refreshed["spriteUrl"]).content == preview_sprite
    assert client.get("/api/cloud/pets").json()["items"] == [refreshed]

    _, gitee = preview("https://gitee.com/acme/renamed")
    assert gitee["repoId"] == refreshed["repoId"]
    assert gitee["seed"] != refreshed["seed"]
    assert gitee["id"] != refreshed["id"]
    assert gitee["attributeStatus"] == "pending"
    assert gitee["rarity"]["key"] == "N"
    repo_id = "24680"  # 原路径被另一个仓库占用，不能覆盖先前收下的精灵。
    assert client.post(f"/api/cloud/pets/{saved['id']}/refresh").status_code == 404
    assert client.get("/api/cloud/pets").json()["items"] == [refreshed]


@pytest.mark.parametrize("platform", ["github", "gitee"])
def test_account_box_shares_single_hatch_and_collects_explicitly(client, monkeypatch, platform) -> None:
    from gitmon_api import card_quality_agent, card_ratings, purpose_agent

    token = "ghp_alice" if platform == "github" else "gitee-alice"
    repo_ids = {"widget": "201", "tool": "202", "missing": "203"}
    url = f"https://{platform}.com"

    def login(name: str) -> str:
        user = auth.upsert_user(provider=platform, login=name, name=name, avatar="", email="",
                                token=token, scopes="", source="token")
        return auth.create_session(user["id"])

    def as_session(sid: str) -> None:
        client.cookies.set(auth.SESSION_COOKIE, sid)

    def list_repos(_http, endpoint, *, params, headers=None, platform="github"):
        assert endpoint.endswith("/user/repos") and params["affiliation"] == "owner"
        if platform == "github":
            assert endpoint == "https://api.github.com/user/repos"
            assert headers["Authorization"] == f"Bearer {token}"
        else:
            assert endpoint == "https://gitee.com/api/v5/user/repos"
            assert params["access_token"] == token
        return [
            *({"id": repo_id, "full_name": f"alice/{name}", "size": 10} for name, repo_id in repo_ids.items()),
            {"id": 301, "full_name": "alice/fork", "size": 10, "fork": True},
            {"id": 302, "full_name": "alice/empty", "size": 0},
            {"id": 303, "full_name": "other/shared", "size": 30},
        ]

    scanned = set()
    agent_calls = []
    allow_confirmation = False

    def scan(ref, *, token: str, allow_private: bool, purpose, quality):
        assert quality
        assert ref.html_url.startswith(url) and allow_private
        assert token == ("ghp_alice" if ref.platform == "github" else "gitee-alice")
        assert ref.repo in repo_ids
        if ref.repo == "missing":
            raise RepoNotFound("仓库不可访问")
        snapshot = make_snapshot(f"{url}/alice/{ref.repo}", repo_id=repo_ids[ref.repo], private=True)
        if ref.repo in scanned:
            snapshot.tree.update(primary_language="Python", lang_share={"Python": 1.0})
        scanned.add(ref.repo)
        snapshot.fetched_at = time.time()
        if purpose(snapshot):
            snapshot.purpose_evidence = {"description": ref.repo}
        if ref.repo == "widget":
            snapshot.quality_evidence = {"complete": True, "has_code": False}
        return snapshot

    def classify(evidence, *, private):
        assert private
        agent_calls.append(evidence["description"])
        return "purpose_fire" if allow_confirmation and evidence["description"] == "widget" else None

    def await_preview(path: str, payload: dict | None = None) -> tuple[str, dict]:
        started = client.post(path, json=payload)
        assert started.status_code == 202
        job_id = started.json()["jobId"]
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            view = client.get(f"{path}/{job_id}").json()
            if view["status"] == "done":
                return job_id, view
            assert view["status"] != "failed", view
            time.sleep(0.02)
        pytest.fail("cloud job timed out")

    monkeypatch.setattr(HttpClient, "get_json", list_repos)
    monkeypatch.setattr(services, "_scan", scan)
    monkeypatch.setattr(purpose_agent, "classify", classify)
    monkeypatch.setattr(card_quality_agent, "review", lambda _: pytest.fail("Quality review needs evidence that crosses tiers"))
    assert client.post("/api/cloud/boxes").status_code == 401
    alice, bob = login("alice"), login("bob")
    as_session(alice)
    single_job, single = await_preview("/api/cloud/previews", {"repo": f"{url}/alice/widget"})
    assert single["pet"]["attributeStatus"] == "pending"
    assert single["pet"]["element"]["key"] == "purpose_pending"
    allow_confirmation = True
    box_id, result = await_preview("/api/cloud/boxes")
    box = result["box"]
    assert result["progress"]["done"] == result["progress"]["total"] == 3
    assert box["owner"]["owner"] == "alice" and box["owner"]["platform"] == platform
    assert box["skipped"] == 3 and [failure["name"] for failure in box["failed"]] == ["missing"]
    pets = {pet["repo"]: pet for pet in box["pets"]}
    assert pets.keys() == {"widget", "tool"}
    widget = pets["widget"]
    assert widget["element"]["key"] == "purpose_fire" and widget["attributeSource"] == "agent"
    assert pets["tool"]["attributeStatus"] == "pending"
    assert sorted(agent_calls) == ["tool", "widget", "widget"]
    single_pet = client.get(f"/api/cloud/previews/{single_job}").json()["pet"]
    for key in ("id", "element", "elementSecondary", "battleElement", "species", "spriteSeed",
                "evolutionStage", "rarity", "qualityRating", "cardArt", "cardElement"):
        assert widget[key] == single_pet[key]
    assert widget["qualityRating"]["status"] == "not_applicable"
    assert widget["cardArt"] is None and widget["cardElement"] == widget["element"]
    sprite = client.get(single_pet["spriteUrl"]).content
    assert sprite.startswith(PNG_SIGNATURE) and client.get(widget["spriteUrl"]).content == sprite
    assert client.get("/api/cloud/pets").json()["items"] == []

    box_path = f"/api/cloud/boxes/{box_id}"
    individual = f"{box_path}/pets/{widget['id']}/collect"
    as_session(bob)
    assert client.get(box_path).status_code == 404
    assert client.get(widget["spriteUrl"]).status_code == 404
    assert client.post(individual).status_code == 404
    assert client.post(f"{box_path}/collect").status_code == 404
    as_session(alice)
    assert client.get(f"/api/jobs/{box_id}").status_code == 404
    assert client.post(f"{box_path}/pets/unknown/collect").status_code == 404
    claimed = client.post(individual).json()
    assert claimed["id"] == widget["id"]
    assert client.get(claimed["spriteUrl"]).content == sprite
    assert client.post(f"/api/cloud/previews/{single_job}/collect").json() == claimed
    assert client.get("/api/cloud/pets").json()["items"] == [claimed]

    all_claimed = client.post(f"{box_path}/collect").json()["items"]
    assert len(all_claimed) == 2
    assert client.post(f"{box_path}/collect").json()["items"] == all_claimed
    assert {pet["id"] for pet in client.get("/api/cloud/pets").json()["items"]} == {p["id"] for p in pets.values()}
    refreshed = client.post(f"/api/cloud/pets/{widget['id']}/refresh").json()
    assert refreshed["element"] == widget["element"]
    assert agent_calls.count("widget") == 2  # 已确认的 ID 不再进入 agent 复核

    # A new confirmed quality picks the same portrait on previews, claim and collection.
    tier = "diamond"
    monkeypatch.setattr(card_ratings, "evaluate", lambda _: {
        "rarity": widget["rarity"], "qualityRating": {"status": "confirmed", "key": tier},
    })
    single_job, single = await_preview("/api/cloud/previews", {"repo": f"{url}/alice/widget"})
    _, result = await_preview("/api/cloud/boxes")
    box_widget = next(p for p in result["box"]["pets"] if p["repo"] == "widget")
    claimed = client.post(f"/api/cloud/previews/{single_job}/collect").json()
    listed = next(p for p in client.get("/api/cloud/pets").json()["items"] if p["repo"] == "widget")
    for view in (single["pet"], box_widget, claimed, listed):
        assert view["cardArt"] == "fire/07-diamond.png"
        assert view["cardElement"] == view["element"] == widget["element"]
        assert view["battleElement"] == widget["battleElement"]
        assert client.get(view["spriteUrl"]).content == sprite
    tier = "king"
    king = client.post(f"/api/cloud/pets/{widget['id']}/refresh").json()
    assert king["cardArt"] == "fire/08-king.png" and king["cardElement"]["name"] == "神"
    assert king["element"] == widget["element"] and king["battleElement"] == widget["battleElement"]
    assert king["spriteUrl"] == listed["spriteUrl"]


def test_collection_is_per_user(client: TestClient) -> None:
    alice = {"X-Gitmon-User": "alice"}
    client.post("/api/hatch/sync", json={"repo": "acme/widget"}, headers=alice)
    client.post("/api/hatch/sync", json={"repo": "acme/other"})

    alice_list = client.get("/api/pets", headers=alice).json()
    public_list = client.get("/api/pets").json()
    assert alice_list["count"] == 1
    assert alice_list["items"][0]["fullName"] == "acme/widget"
    assert public_list["count"] == 1
    assert public_list["items"][0]["fullName"] == "acme/other"


def test_sync_awards_xp(client: TestClient, monkeypatch) -> None:
    pet = client.post("/api/hatch/sync", json={"repo": "acme/widget"}).json()

    monkeypatch.setattr(
        services, "_scan",
        lambda ref, since=None, token=None: make_snapshot(
            f"{ref.platform}.com/{ref.full_name}",
            commits_total=9000, stars=8000, releases_total=30, issues_closed=900, prs_merged=800,
            releases_last_year=8,
        ),
    )
    result = client.post(f"/api/pets/{pet['id']}/sync")
    assert result.status_code == 200
    payload = result.json()
    assert payload["sync"]["xpGained"] > 0
    assert payload["level"] >= pet["level"]
    assert payload["expToNext"] > 0
    assert payload["metrics"]["commits_total"] == 9000


def test_growth_log_recorded(client: TestClient) -> None:
    pet = client.post("/api/hatch/sync", json={"repo": "acme/log"}).json()
    log = client.get(f"/api/pets/{pet['id']}/growth").json()
    assert log["items"]
    assert log["items"][0]["event"] == "hatch"


def test_sprite_endpoint(client: TestClient) -> None:
    pet = client.post("/api/hatch/sync", json={"repo": "acme/art"}).json()
    response = client.get(f"/api/pets/{pet['id']}/sprite.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(PNG_SIGNATURE)
    assert "max-age" in response.headers["cache-control"]


def test_badge_and_card_svg(client: TestClient) -> None:
    badge = client.get("/badge/github/acme/widget.svg")
    assert badge.status_code == 200
    assert badge.headers["content-type"].startswith("image/svg+xml")
    assert badge.text.startswith("<svg")
    assert "widget" in badge.text
    assert "max-age" in badge.headers["cache-control"]

    card = client.get("/card/github/acme/widget.svg")
    assert card.status_code == 200
    assert "Lv." in card.text


def test_badge_invalid_repo_renders_placeholder(client: TestClient) -> None:
    response = client.get("/badge/github/acme/../evil.svg")
    assert response.status_code in {200, 404}
    if response.status_code == 200:
        assert "<svg" in response.text


def test_pet_detail_and_delete(client: TestClient) -> None:
    pet = client.post("/api/hatch/sync", json={"repo": "acme/temp"}).json()
    detail = client.get(f"/api/pets/{pet['id']}").json()
    assert detail["id"] == pet["id"]
    assert detail["growthLog"]

    assert client.delete(f"/api/pets/{pet['id']}").status_code == 204
    assert client.get(f"/api/pets/{pet['id']}").status_code == 404


def test_leaderboard(client: TestClient) -> None:
    client.post("/api/hatch/sync", json={"repo": "acme/small"})
    client.post("/api/hatch/sync", json={"repo": "acme/big"})
    # 同一仓库被不同用户孵化过，榜单只保留最高等级的一只
    client.post("/api/hatch/sync", json={"repo": "acme/big"}, headers={"X-Gitmon-User": "other"})
    payload = client.get("/api/leaderboard").json()
    names = [item["fullName"] for item in payload["items"]]
    assert len(names) == len(set(names))
    levels = [item["level"] for item in payload["items"]]
    assert levels == sorted(levels, reverse=True)


def test_static_frontend_mounted_once_dist_exists(tmp_dir, monkeypatch) -> None:
    dist = tmp_dir / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>gitmon</body></html>", encoding="utf-8")
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir / "data")
    monkeypatch.setattr(settings, "static_dir", dist)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    settings.ensure_dirs()
    app = create_app(start_queue=False)
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "gitmon" in response.text
        assert client.get("/api/health").status_code == 200
