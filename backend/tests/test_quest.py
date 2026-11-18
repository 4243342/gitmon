"""任务模式（点星活动）：目标固定、三态判定、归因核对、幂等发奖、限额与冷却。

验真的可信度全靠这几条撑着，所以每条规则都单独一个用例：
星数没涨不能发奖、没归因只能给部分、同一任务不能重复发钱、额度不能超、
冷却期内不能重复出题、复审次数用完必须作废。

**目标固定**：活动任务只有一个，目标就是项目自己的仓库（配置项
``GITMON_QUEST_TARGET``），玩家没有得挑。所以下面所有用例都用
``TARGET`` 指向配置里的那一个仓库；传别的仓库一律拒。

关于归属键：``X-Gitmon-User`` 头会被 ``[^A-Za-z0-9_-]`` 清洗，冒号留不住，
所以走请求头的用例一律用不含冒号的归属键。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, inventory, quest
from gitmon_api.db import db
from gitmon_api.main import create_app
from gitmon_api.repo import RepoRef

OWNER = "tester-device"
OTHER = "other-device"
# 活动任务的固定目标（与 config.settings.quest_target 默认值一致）
TARGET = RepoRef("github", "4243342", "gitmon")
TARGET_KEY = "github-4243342/gitmon"


@pytest.fixture(autouse=True)
def isolated_db(tmp_dir, monkeypatch):
    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-quest.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    db.init()
    # 目标固定成测试里的那一个，避免用例依赖真实部署配置
    monkeypatch.setattr(config.settings, "quest_target", "4243342/gitmon", raising=False)


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


def _fake_meta(stars: int):
    """伪造 fetch_repo_meta：返回固定星数，避免联网。"""
    return lambda ref, token=None, **kw: {"stargazers_count": stars, "full_name": ref.full_name}


def _fake_starred(value: bool | None):
    """伪造 check_starred：value 为 True / False / None。"""
    return lambda ref, token, **kw: value


def _issue_body() -> dict[str, str]:
    return {"goal_key": "star", "target": TARGET_KEY}


# ---------------------------------------------------------------- 任务板


def test_board_has_one_goal_with_fixed_target(client) -> None:
    """任务板只有一条活动任务，目标固定就是那一个仓库。"""
    data = client.get("/api/quest/board", headers=_headers()).json()
    assert len(data["goals"]) == 1
    goal = data["goals"][0]
    assert goal["key"] == "star"
    # 目标只有一个，不是一堆候选
    assert "targets" not in goal
    assert goal["target"]["petKey"] == TARGET_KEY
    assert goal["target"]["fullName"] == "4243342/gitmon"
    assert goal["target"]["htmlUrl"] == "https://github.com/4243342/gitmon"
    assert goal["target"]["fixed"] is True


def test_board_reports_quota(client) -> None:
    goal = client.get("/api/quest/board", headers=_headers()).json()["goals"][0]
    assert goal["quota"]["dailyLimit"] == 1
    assert goal["quota"]["slotsLimit"] == 1
    assert goal["quota"]["issuedToday"] == 0
    assert goal["quota"]["cooldownDays"] == 30


def test_target_is_same_for_every_player(client) -> None:
    """目标不随玩家变 —— 换个人领，看到的还是同一个仓库。"""
    a = client.get("/api/quest/board", headers=_headers(OWNER)).json()["goals"][0]["target"]
    b = client.get("/api/quest/board", headers=_headers(OTHER)).json()["goals"][0]["target"]
    assert a["petKey"] == b["petKey"]


# ---------------------------------------------------------------- 领取


def test_issue_records_star_baseline(client, monkeypatch) -> None:
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers())
    assert res.status_code == 200
    run = res.json()["run"]
    assert run["status"] == "fixing"
    assert run["attempts"] == 0
    assert run["payload"]["starsBefore"] == 100
    assert run["payload"]["htmlUrl"] == "https://github.com/4243342/gitmon"


def test_issue_rejects_other_repo(client, monkeypatch) -> None:
    """目标固定：前端传了别的仓库要拒，不能静默换成配置里的那个。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    res = client.post(
        "/api/quest/issue",
        json={"goal_key": "star", "target": "github-vuejs/core"},
        headers=_headers(),
    )
    assert res.status_code == 409
    assert "固定" in res.json()["error"]


def test_issue_accepts_empty_target(client, monkeypatch) -> None:
    """前端不传目标也行 —— 后端按配置的目标走。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    res = client.post(
        "/api/quest/issue", json={"goal_key": "star"}, headers=_headers()
    )
    assert res.status_code == 200
    assert res.json()["run"]["payload"]["fullName"] == "4243342/gitmon"


def test_issue_respects_daily_limit(client, monkeypatch) -> None:
    """同一天重复领 → 报「额度用完」（当天这条闸门先判）。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    assert client.post("/api/quest/issue", json=_issue_body(), headers=_headers()).status_code == 200
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers())
    assert res.status_code == 429
    assert "额度" in res.json()["error"]


def test_issue_blocks_same_target_during_cooldown(client, monkeypatch) -> None:
    """跨天再来 → 报冷却（30 天内不能再领）。

    每日额度只管当天，冷却期管跨天 —— 两条闸门各管各的场景，
    不会因为冷却更长就把额度那条变成永远轮不到的死规则。
    """
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    assert client.post("/api/quest/issue", json=_issue_body(), headers=_headers()).status_code == 200
    # 把已领的那条挪到昨天，模拟「隔天再来」
    with db.connect() as conn:
        conn.execute(
            "UPDATE quest_runs SET issued_at = issued_at - 86400 WHERE owner_key = ?",
            (OWNER,),
        )
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers())
    assert res.status_code == 409
    assert "30 天" in res.json()["error"]


def test_issue_blocked_while_task_still_open(client, monkeypatch) -> None:
    """手上还有没判定的任务时，不允许再开一个 —— 目标唯一。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    monkeypatch.setitem(quest.GOALS["star"], "daily_limit", 99)
    monkeypatch.setitem(quest.GOALS["star"], "cooldown_days", 0)
    assert client.post("/api/quest/issue", json=_issue_body(), headers=_headers()).status_code == 200
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers())
    assert res.status_code == 409
    assert "复审" in res.json()["error"]


def test_failed_task_keeps_target_busy(client, monkeypatch) -> None:
    """复审判 failed 后，目标仍算「占用」—— 玩家可能去点完星再回来复审。

    所以冷却到期、额度放开也不能再开第二个：同一个目标不该有两个任务。
    """
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    monkeypatch.setitem(quest.GOALS["star"], "daily_limit", 99)
    monkeypatch.setitem(quest.GOALS["star"], "cooldown_days", 0)
    assert client.post("/api/quest/issue", json=_issue_body(), headers=_headers()).status_code == 200
    board = client.get("/api/quest/board", headers=_headers()).json()
    run_id = board["goals"][0]["runs"][0]["id"]
    # 星数没涨 → failed，但任务还在手上
    client.post("/api/quest/verify", json={"id": run_id}, headers=_headers())
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers())
    assert res.status_code == 409


# ---------------------------------------------------------------- 三态判定


def _issue(client, token: str = "") -> str:
    res = client.post("/api/quest/issue", json=_issue_body(), headers=_headers(token=token))
    assert res.status_code == 200
    return res.json()["run"]["id"]


def test_verify_fails_when_stars_unchanged(client, monkeypatch) -> None:
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
    """别人的任务不能复审（也不能借复审去看别人的记录）。"""
    monkeypatch.setattr(quest, "fetch_repo_meta", _fake_meta(100))
    run_id = _issue(client)
    res = client.post("/api/quest/verify", json={"id": run_id}, headers=_headers("intruder-device"))
    assert res.status_code == 404


# ---------------------------------------------------------------- 历史


def test_history_reports_pass_rate(client, monkeypatch) -> None:
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
    assert data["items"][0]["repo"] == "4243342/gitmon"


# ---------------------------------------------------------------- 目标解析


def test_quest_target_parses_owner_repo() -> None:
    ref = quest._quest_target_ref()
    assert ref.platform == "github"
    assert ref.full_name == "4243342/gitmon"


def test_quest_target_parses_platform_prefix(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "quest_target", "gitee/acme/widget", raising=False)
    ref = quest._quest_target_ref()
    assert ref.platform == "gitee"
    assert ref.full_name == "acme/widget"


def test_quest_target_rejects_bad_config(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "quest_target", "not-a-repo", raising=False)
    with pytest.raises(quest.QuestError):
        quest._quest_target_ref()


# ---------------------------------------------------------------- 底层能力


def test_check_starred_returns_none_without_token() -> None:
    from gitmon_api.scanner import check_starred

    assert check_starred(TARGET, None) is None


def test_check_starred_rejects_cross_platform_token() -> None:
    """Gitee 令牌不能发给 GitHub —— 平台隔离在这里也要生效。"""
    from gitmon_api.scanner import check_starred

    # "deadbeef" 是 Gitee 形态的令牌，GitHub 端不认它
    assert check_starred(TARGET, "deadbeef") is None
