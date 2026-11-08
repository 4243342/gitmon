"""API 端到端：用假扫描器跑完整链路（孵化 → 图鉴 → 同步 → 渲染）。"""

from __future__ import annotations

import time

import pytest
from conftest import make_snapshot
from fastapi.testclient import TestClient

from gitmon_api import config, services
from gitmon_api.main import create_app

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
