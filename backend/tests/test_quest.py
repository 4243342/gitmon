"""任务模式（点星活动）：三态判定、归因核对、幂等发奖、限额与冷却。

验真的可信度全靠这几条撑着，所以每条规则都单独一个用例：
星数没涨不能发奖、没归因只能给部分、同一任务不能重复发钱、额度不能超、
冷却期内不能重复出题、复审次数用完必须作废。

关于归属键：``X-Gitmon-User`` 头会被 ``[^A-Za-z0-9_-]`` 清洗，冒号留不住，
所以走请求头的用例一律用不含冒号的归属键；``user:github:xxx`` 那种登录态归属
只在直接调用业务函数时用（见 ``test_board_excludes_repo_owned_by_player_login``）。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, inventory, quest
from gitmon_api.db import db, save_pet
from gitmon_api.main import create_app
from gitmon_api.repo import RepoRef

OWNER = "tester-device"
OTHER = "other-device"
TARGET = RepoRef("github", "acme", "widget")
# 玩家自己的 GitHub 账号（登录态归属里的 login 段）
PLAYER_LOGIN = "tester"


@pytest.fixture(autouse=True)
def isolated_db(tmp_dir, monkeypatch):
    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-quest.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    db.init()


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    settings.ensure_dirs()
    app = create_app(start_queue=False)
    with TestClient(app) as test_client:
        yield test_client


def _headers(owner: str = OWNER, token: str = "") -> dict[str, str]:
    headers = {"X-Gitmon-User": owner}
    if token:
        # 前端本地那枚 GitHub 令牌（游客 / 本机登录）：归因核对要用它
        headers["X-GitHub-Token"] = token
    return headers


def _seed_pet(owner_key: str, ref: RepoRef = TARGET, *, stars: int = 100) -> None:
    """塞一只精灵进图鉴：任务板的候选池从 pets 表里取。"""
    now = "2026-11-10T00:00:00+00:00"
    pet = {
        "id": f"{owner_key}-{ref.cache_key}".replace("/", "-"),
        "platform": ref.platform,
        "owner": ref.owner,
        "repo": ref.repo,
        "full_name": ref.full_name,
        "owner_key": owner_key,
        "seed": 1,
        "sprite_seed": 2,
        "element_key": "ember",
        "element_secondary": None,
        "species_key": "beast",
        "quality": "R",
        "quality_score": 50.0,
        "engineering_score": 50.0,
        "level": 5,
        "exp": 0,
        "evolution_stage": 1,
        "stats": [],
        "skills": [],
        "hp": 10,
        "bond": 0,
        "status": "active",
        "foundation": 0.0,
        "traits": [],
        "metrics": {"stars": stars},
        "notes": [],
        "degraded": 0,
        "description": "一个测试仓库",
        "battles": 0,
        "wins": 0,
        "client_state": {},
        "sprite_path": "",
        "created_at": now,
        "synced_at": now,
    }
    with db.connect() as conn:
        save_pet(conn, pet)


def _fake_meta(stars: int):
    """伪造 fetch_repo_meta：返回固定星数，避免联网。"""
    return lambda ref, token=None, **kw: {"stargazers_count": stars, "full_name": ref.full_name}


def _fake_starred(value: bool | None):
    """伪造 check_starred：value 为 True / False / None。"""
    return lambda ref, token, **kw: value


# ---------------------------------------------------------------- 候选池


def test_board_lists_other_players_repos(client) -> None:
    _seed_pet(OTHER)
    data = client.get("/api/quest/board", headers=_headers()).json()
    goal = data["goals"][0]
    assert goal["key"] == "star"
    assert [t["petKey"] for t in goal["targets"]] == ["github-acme/widget"]


def test_board_excludes_own_repos(client) -> None:
    _seed_pet(OWNER)
    data = client.get("/api/quest/board", headers=_headers()).json()
    assert data["goals"][0]["targets"] == []


def test_board_excludes_repo_owned_by_player_login() -> None:
    """作者就是玩家本人的仓库 → 自己给自己点星没意义，不该出现在板上。

    这里直接调业务函数：``user:github:xxx`` 是登录态归属，
    走请求头会被清洗掉冒号，测不到这一层。
    """
    _seed_pet(OTHER, RepoRef("github", PLAYER_LOGIN, "my-repo"))
    _seed_pet(OTHER, RepoRef("github", "acme", "widget"))
    goal = quest.GOALS["star"]
    with db.connect() as conn:
        targets = quest._candidates(conn, f"user:github:{PLAYER_LOGIN}", goal)
    assert [t["fullName"] for t in targets] == ["acme/widget"]


def test_board_reports_quota(client) -> None:
    _seed_pet(OTHER)
    goal = client.get("/api/quest/board", headers=_headers()).json()["goals"][0]
    assert goal["quota"]["dailyLimit"] == 3
    assert goal["quota"]["issuedToday"] == 0
    assert goal["quota"]["cooldownDays"] == 30


# ---------------------------------------------------------------- 领取


def test_issue_records_star_baseline(client, monkeypatch) -> None:
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-acme/widget"},
        headers=_headers(),
    )
    assert res.status_code == 200
    run = res.json()["run"]
    assert run["status"] == "fixing"
    assert run["attempts"] == 0
    assert run["payload"]["starsBefore"] == 100
    assert run["payload"]["htmlUrl"] == "https://github.com/acme/widget"


def test_issue_rejects_repo_outside_pool(client, monkeypatch) -> None:
    """没进过图鉴的仓库不能领 —— 否则就是随便找个热门仓库刷奖励。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-vuejs/core"},
        headers=_headers(),
    )
    assert res.status_code == 409
    assert "任务列表" in res.json()["error"]


def test_issue_respects_daily_limit(client, monkeypatch) -> None:
    for i in range(4):
        _seed_pet(OTHER, RepoRef("github", "acme", f"repo{i}"))
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    for i in range(3):
        res = client.post(
            "/api/quest/issue",
            json={"goal_key": "star", "target": f"github-acme/repo{i}"},
            headers=_headers(),
        )
        assert res.status_code == 200
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-acme/repo3"},
        headers=_headers(),
    )
    assert res.status_code == 429
    assert "额度" in res.json()["error"]


def test_issue_blocks_same_repo_during_cooldown(client, monkeypatch) -> None:
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    body = {"goal_key": "star", "target": "github-acme/widget"}
    assert client.post("/api/quest/issue", json=body, headers=_headers()).status_code == 200
    res = client.post("/api/quest/issue", json=body, headers=_headers())
    assert res.status_code == 409
    assert "30 天" in res.json()["hint"]


def test_issue_caps_pending_tasks_at_three(client, monkeypatch) -> None:
    """手上最多压 3 个没复审的任务。

    每日额度放开到 99，才轮得到「待办名额」这条规则生效。
    """
    for i in range(4):
        _seed_pet(OTHER, RepoRef("github", "acme", f"repo{i}"))
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    monkeypatch.setitem(quest.GOALS["star"], "daily_limit", 99)
    for i in range(3):
        assert client.post(
            "/api/quest/issue",
            json={"goal_key": "star", "target": f"github-acme/repo{i}"},
            headers=_headers(),
        ).status_code == 200
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-acme/repo3"},
        headers=_headers(),
    )
    assert res.status_code == 429
    assert "没复审" in res.json()["error"]


def test_issue_frees_slot_after_verify(client, monkeypatch) -> None:
    """复审过的任务不再占待办名额。"""
    for i in range(4):
        _seed_pet(OTHER, RepoRef("github", "acme", f"repo{i}"))
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    monkeypatch.setitem(quest.GOALS["star"], "daily_limit", 99)
    for i in range(3):
        client.post(
            "/api/quest/issue",
            json={"goal_key": "star", "target": f"github-acme/repo{i}"},
            headers=_headers(),
        )
    # 复审第一个（星数没涨 → failed，但它已经被复审过，不再占名额）
    board = client.get("/api/quest/board", headers=_headers()).json()
    run_id = board["goals"][0]["runs"][0]["id"]
    client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-acme/repo3"},
        headers=_headers(),
    )
    assert res.status_code == 200


# ---------------------------------------------------------------- 三态判定


def _issue(client, token: str = "") -> str:
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-acme/widget"},
        headers=_headers(token=token),
    )
    assert res.status_code == 200
    return res.json()["run"]["id"]


def test_verify_fails_when_stars_unchanged(client, monkeypatch) -> None:
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    assert res.status_code == 200
    body = res.json()
    assert body["result"] == "failed"
    assert body["delta"] == 0
    assert "★" in body["missing"]
    assert inventory.balances(OWNER)["stardust"] == 0


def test_verify_partial_without_token(client, monkeypatch) -> None:
    """没令牌 → 星涨了也只能给部分奖励（没法证明是本人点的）。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(None))
    res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    body = res.json()
    assert body["result"] == "partial"
    assert body["attributed"] is None
    assert body["reward"]["stardust"] == 16
    assert inventory.balances(OWNER)["stardust"] == 16


def test_verify_passed_when_attribution_confirmed(client, monkeypatch) -> None:
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client, token="ghp_playertoken")
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(True))
    res = client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    body = res.json()
    assert body["result"] == "passed"
    assert body["attributed"] is True
    assert body["reward"]["stardust"] == 40
    assert body["reward"]["trait_shard"] == 1
    assert inventory.balances(OWNER)["stardust"] == 40
    assert inventory.balances(OWNER)["trait_shard"] == 1


def test_verify_partial_when_attribution_denied(client, monkeypatch) -> None:
    """令牌说「这个账号没收藏过它」→ 星涨了也不是你点的，只给部分。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client, token="ghp_playertoken")
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(False))
    res = client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    body = res.json()
    assert body["result"] == "partial"
    assert body["attributed"] is False
    assert body["reward"]["stardust"] == 16
    assert "没有收藏过" in body["missing"]


def test_verify_upgrades_partial_to_passed_and_pays_difference(client, monkeypatch) -> None:
    """先拿到部分奖励，补上令牌再复审 → 补齐差额，而不是重发一遍。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(None))
    client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    assert inventory.balances(OWNER)["stardust"] == 16

    monkeypatch.setattr(quest, "check_starred", _fake_starred(True))
    res = client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    assert res.json()["result"] == "passed"
    assert inventory.balances(OWNER)["stardust"] == 40
    assert inventory.balances(OWNER)["trait_shard"] == 1


def test_verify_does_not_double_pay_on_repeat(client, monkeypatch) -> None:
    """通过后重复提交不重复发奖。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client, token="ghp_playertoken")
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(True))
    client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    res = client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    assert res.json()["duplicate"] is True
    assert inventory.balances(OWNER)["stardust"] == 40


def test_verify_expires_after_five_attempts(client, monkeypatch) -> None:
    """复审上限 5 次：第 6 次返回 429，任务转 expired。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    for _ in range(5):
        res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
        assert res.status_code == 200
        assert res.json()["result"] == "failed"
    res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    assert res.status_code == 429
    with db.connect() as conn:
        row = conn.execute("SELECT status FROM quest_runs WHERE id=?", (run_id,)).fetchone()
    assert row["status"] == "expired"


def test_verify_unknown_run_returns_404(client) -> None:
    res = client.post("/api/quest/verify", json={"id": "deadbeef00"}, headers=_headers())
    assert res.status_code == 404


def test_verify_is_scoped_to_owner(client, monkeypatch) -> None:
    """别人的任务不能复审（也不能借复审去看别人的目标）。"""
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers("intruder-device"))
    assert res.status_code == 404


# ---------------------------------------------------------------- 历史


def test_history_reports_pass_rate(client, monkeypatch) -> None:
    _seed_pet(OTHER)
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client, token="ghp_playertoken")
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(101))
    monkeypatch.setattr(quest, "check_starred", _fake_starred(True))
    client.post(
        "/api/quest/verify", json={"id": run_id}, headers=_headers(token="ghp_playertoken")
    )
    data = client.get("/api/quest/history", headers=_headers()).json()
    assert data["stats"]["total"] == 1
    assert data["stats"]["passed"] == 1
    assert data["stats"]["passRate"] == 100.0
    assert data["items"][0]["repo"] == "acme/widget"


# ---------------------------------------------------------------- 底层能力


def test_check_starred_returns_none_without_token() -> None:
    from gitmon_api.scanner import check_starred

    assert check_starred(TARGET, None) is None


def test_check_starred_rejects_cross_platform_token() -> None:
    """Gitee 令牌不能发给 GitHub —— 平台隔离在这里也要生效。"""
    from gitmon_api.scanner import check_starred

    # "deadbeef" 是 Gitee 形态的令牌，GitHub 端不认它
    assert check_starred(TARGET, "deadbeef") is None
