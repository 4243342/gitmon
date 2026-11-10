"""任务模式：领取 → 复审 → 发奖。

任务定义是**数据驱动**的（设计文档 docs/QUEST.md §10）：加一种任务只需要在 ``GOALS``
里加一条配置，接口与状态机完全复用。

当前上线的活动任务只有一个：``star`` —— 给社区里别人的仓库点一颗星。

验真分两层（docs/QUEST.md §5）：

- **L1 结构核对**：领取时记下目标仓库的 ``stargazers_count``，复审时重新拉一次，
  看它是不是真的涨了。涨了说明「确实有人点了星」。
- **L2 归因核对**：能拿到玩家自己的 GitHub / Gitee 令牌时，查「这个账号有没有收藏过
  它」，确认是**本人**点的（避免蹭别人的星混过去）。

三态判定：

============  ==========================================  ==========
结果          条件                                         奖励
============  ==========================================  ==========
``passed``    L1 通过且 L2 确认是本人点的                   全额
``partial``   L1 通过但 L2 不足（没令牌 / 令牌说没收藏过）   40%，可继续复审
``failed``    L1 不通过（星数没涨）                         无
============  ==========================================  ==========

``partial`` 之所以还发 40%：星数确实涨了是事实，只是「是本人点的」这一层没钉死。
想拿全额就去登录 GitHub（或在设置里粘贴一枚 GitHub 令牌），再复审一次即可补齐差额。
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from . import inventory
from .db import db
from .repo import RepoRef, ref_from_parts
from .scanner import check_starred, fetch_repo_meta

# ---------------------------------------------------------------- 任务定义


GOALS: dict[str, dict[str, Any]] = {
    "star": {
        "key": "star",
        "title": "给作者的仓库点一颗星",
        "brief": (
            "挑一只社区里别人的精灵，去 GitHub 给它的仓库点一颗星。"
            "星数涨了就算你做到了 —— 你点的这颗星会让那只精灵的社区认可分变高。"
        ),
        "accept": [
            "先点「领取」，锁定目标并记下它当前的星数",
            "去仓库页点右上角的 ★ Star",
            "回来点「我点好了」，后端重新拉一次星数核对",
        ],
        "verify_level": "L12",
        # 复审次数上限：前 5 次可复审，第 6 次返回 429 并把任务置为 expired
        "max_attempts": 5,
        # 每日可领数量
        "daily_limit": 3,
        # 同一个仓库的冷却期（天）：避免反复领同一个仓库刷奖励
        "cooldown_days": 30,
        "reward": {
            "passed": {"stardust": 40, "trait_shard": 1},
            "partial": {"stardust": 16},
        },
    },
}

# 候选目标一次取多少条备选（前端再按可用性过滤）
CANDIDATE_POOL = 60


class QuestError(Exception):
    """任务操作失败。"""

    def __init__(self, message: str, *, status_code: int = 400, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.hint = hint


# ---------------------------------------------------------------- 小工具


def _loads(raw: Any, fallback: Any) -> Any:
    if raw in (None, ""):
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def _dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"))


def _now() -> float:
    return time.time()


def _today_range(now: float | None = None) -> tuple[float, float]:
    """今天（本地自然日）的纪元秒区间 [起, 止)。

    为什么不在 SQL 里写 ``date(issued_at, 'unixepoch', 'localtime') = date('now', 'localtime')``：

    1. ``date('now', 'unixepoch')`` 恒为 NULL —— 'now' 是 UTC 字符串，unixepoch 修饰符只认纪元秒，
       拿它当"今天"会得到 NULL，比较永远不成立，每日额度直接失效。
    2. 带 'localtime' 的 date() 在 SQLite 里是非确定性函数，写进索引后 INSERT 会报
       "non-deterministic use of date() in an index"，唯一索引根本建不出来。

    所以边界在 Python 里算：取本地时间的零点，转成纪元秒，再转回纪元秒。
    """
    ts = time.time() if now is None else now
    lt = time.localtime(ts)
    start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))
    end = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + 1, 0, 0, 0, 0, 0, -1))
    return start, end


def _goal(goal_key: str) -> dict[str, Any]:
    goal = GOALS.get(goal_key)
    if goal is None:
        raise QuestError(f"没有这种任务：{goal_key}", status_code=404, hint="任务板里能领的才叫任务")
    return goal


def _owner_login(owner_key: str) -> tuple[str, str]:
    """从归属标识里还原平台与用户名：``user:github:someone`` → ("github", "someone")。"""
    if not owner_key.startswith("user:"):
        return "", ""
    parts = owner_key.split(":", 2)
    if len(parts) != 3:
        return "", ""
    return parts[1], parts[2]


def _pet_key(platform: str, full_name: str) -> str:
    return f"{platform}-{full_name}"


def _platform_token(tokens: Any, platform: str) -> str:
    """从令牌桶里取该平台该用的那一枚。

    令牌桶形如 ``{"github": "ghp_xxx", "gitee": "..."}``；传字符串时按单枚处理
    （老调用方式与测试都走这条路）。
    """
    if isinstance(tokens, dict):
        return str(tokens.get(platform) or "")
    return str(tokens or "")


def _parse_target(raw: str) -> RepoRef:
    """把前端回传的目标串解析成仓库引用。

    接受 ``github-owner/repo``（任务板发的口径）、``owner/repo``、以及完整仓库地址。
    """
    text = (raw or "").strip()
    if not text:
        raise QuestError("没有指定目标仓库", status_code=400)
    if "-" in text.split("/", 1)[0] and not text.startswith("http"):
        # "github-owner/repo" 口径：平台段在第一个短横线之前
        platform, _, rest = text.partition("-")
        if platform in ("github", "gitee") and "/" in rest:
            return ref_from_parts(platform, *rest.split("/", 1))
    if text.startswith("http"):
        from .repo import parse_repo

        return parse_repo(text)
    if "/" in text:
        return ref_from_parts("github", *text.split("/", 1))
    raise QuestError("目标仓库格式不对", status_code=400, hint="应该是 owner/repo")


def _row_to_run(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["payload"] = _loads(item.get("payload"), {})
    item["evidence"] = _loads(item.get("evidence"), [])
    item["reward"] = _loads(item.get("reward"), {})
    item["attempts"] = int(item.get("attempts") or 0)
    return item


# ---------------------------------------------------------------- 目标池


def _star_cache(conn: Any, keys: list[str]) -> dict[str, dict[str, Any]]:
    """从快照缓存里取上次扫描到的星数（只用于展示，不参与判定）。"""
    if not keys:
        return {}
    out: dict[str, dict[str, Any]] = {}
    chunk = 40
    for start in range(0, len(keys), chunk):
        part = keys[start : start + chunk]
        marks = ",".join("?" for _ in part)
        rows = conn.execute(
            f"SELECT cache_key, payload, fetched_at FROM snapshots WHERE cache_key IN ({marks})",
            part,
        ).fetchall()
        for row in rows:
            payload = _loads(row["payload"], {})
            out[row["cache_key"]] = {"stars": payload.get("stars"), "at": float(row["fetched_at"] or 0)}
    return out


def _candidates(conn: Any, owner_key: str, goal: dict[str, Any]) -> list[dict[str, Any]]:
    """候选目标：社区里别人孵化过的仓库（去重后取最活跃的一批）。

    排除三种：玩家自己名下的、作者就是玩家本人的、玩家在冷却期内领过的。
    """
    provider, login = _owner_login(owner_key)
    login_lower = login.lower()

    rows = conn.execute(
        "SELECT p.platform, p.full_name, MAX(p.owner) AS owner, MAX(p.repo) AS repo, "
        "  MAX(p.description) AS description, MAX(p.quality) AS quality, MAX(p.level) AS level, "
        "  COUNT(DISTINCT p.owner_key) AS hatchers "
        "FROM pets p WHERE p.owner_key != ? "
        "GROUP BY p.platform, p.full_name "
        "ORDER BY hatchers DESC, level DESC LIMIT ?",
        (owner_key, CANDIDATE_POOL),
    ).fetchall()

    # 冷却期内玩家已经领过的目标：冷却结束后它会重新回到候选池。
    # 还在进行中（fixing）的任务无论多久都占着这个仓库，不许重复领。
    cutoff = _now() - int(goal.get("cooldown_days") or 0) * 86400
    blocked = {
        row["pet_key"]
        for row in conn.execute(
            "SELECT pet_key FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
            "AND (issued_at > ? OR status = 'fixing')",
            (owner_key, goal["key"], cutoff),
        ).fetchall()
    }

    keys = [f"{row['platform']}/{row['full_name']}".lower() for row in rows]
    cached = _star_cache(conn, keys)

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        platform = row["platform"]
        full_name = row["full_name"]
        key = _pet_key(platform, full_name)
        if key in seen:
            continue
        seen.add(key)
        # 作者是玩家本人 → 自己给自己点星没意义
        if login_lower and (row["owner"] or "").lower() == login_lower:
            continue
        if key in blocked:
            continue
        ref = ref_from_parts(platform, *full_name.split("/", 1))
        cache = cached.get(ref.cache_key, {})
        out.append(
            {
                "petKey": key,
                "platform": platform,
                "fullName": full_name,
                "owner": row["owner"],
                "repo": row["repo"],
                "htmlUrl": ref.html_url,
                "description": row["description"] or "",
                "quality": row["quality"] or "",
                "hatchers": int(row["hatchers"] or 0),
                "stars": cache.get("stars"),
                "starsAt": cache.get("at"),
            }
        )
    return out


# ---------------------------------------------------------------- 奖励


def _grant_for_tier(goal: dict[str, Any], tier: str) -> dict[str, int]:
    return {k: int(v) for k, v in (goal.get("reward", {}).get(tier) or {}).items()}


def _grant_reward(run: dict[str, Any], goal: dict[str, Any], tier: str, owner_key: str) -> dict[str, int]:
    """按档位补发奖励（只补差额），发奖走 inventory.grant，source_key 保证幂等。

    同一档位重复复审不会重复发：差额算出来是 0。``partial`` 升到 ``passed`` 时补差价。
    """
    target = _grant_for_tier(goal, tier)
    granted = {k: int(v) for k, v in (run.get("reward") or {}).items()}
    for item_key, want in target.items():
        have = granted.get(item_key, 0)
        if want <= have:
            continue
        inventory.grant(
            owner_key,
            item_key,
            want - have,
            source_key=f"quest:{run['id']}:{item_key}:{tier}",
            reason=f"任务「{goal['title']}」{'通过' if tier == 'passed' else '部分通过'}",
        )
        granted[item_key] = want
    run["reward"] = granted
    return granted


# ---------------------------------------------------------------- 视图


def _run_view(run: dict[str, Any], goal: dict[str, Any]) -> dict[str, Any]:
    payload = run.get("payload") or {}
    attempts = int(run.get("attempts") or 0)
    status = run.get("status") or "fixing"
    last = (run.get("evidence") or [])[-1] if run.get("evidence") else None
    return {
        "id": run["id"],
        "goalKey": run["goal_key"],
        "goalTitle": goal["title"],
        "petKey": run["pet_key"],
        "status": status,
        "result": (last or {}).get("result"),
        "missing": (last or {}).get("missing", ""),
        "attempts": attempts,
        "maxAttempts": int(goal.get("max_attempts") or 5),
        "canVerify": status == "fixing" and attempts < int(goal.get("max_attempts") or 5),
        "issuedAt": float(run.get("issued_at") or 0),
        "verifyAt": run.get("verify_at"),
        "payload": payload,
        "evidence": run.get("evidence") or [],
        "reward": run.get("reward") or {},
    }


# ---------------------------------------------------------------- 任务板


def board(owner_key: str) -> dict[str, Any]:
    """任务板：今天能领什么、我手上有几个、额度还剩多少。"""
    out: list[dict[str, Any]] = []
    for key, goal in GOALS.items():
        with db.connect() as conn:
            today = conn.execute(
                "SELECT COUNT(*) AS n FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
                "AND issued_at >= ? AND issued_at < ?",
                (owner_key, key, *_today_range()),
            ).fetchone()
            issued_today = int(today["n"] or 0)
            # 待办名额：已领取但还没复审过的任务占位，复审过的不再挡着领新任务
            slots = conn.execute(
                "SELECT COUNT(*) AS n FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
                "AND status = 'fixing' AND attempts = 0",
                (owner_key, key),
            ).fetchone()
            active = int(slots["n"] or 0)
            runs = conn.execute(
                "SELECT * FROM quest_runs WHERE owner_key = ? AND goal_key = ? AND status = 'fixing' "
                "ORDER BY issued_at DESC LIMIT 20",
                (owner_key, key),
            ).fetchall()
            targets = _candidates(conn, owner_key, goal)
        out.append(
            {
                "key": key,
                "title": goal["title"],
                "brief": goal["brief"],
                "accept": list(goal.get("accept") or []),
                "verifyLevel": goal.get("verify_level", "L1"),
                "reward": goal.get("reward", {}),
                "quota": {
                    "dailyLimit": int(goal.get("daily_limit") or 0),
                    "issuedToday": issued_today,
                    "slotsLimit": 3,
                    "slotsUsed": active,
                    "cooldownDays": int(goal.get("cooldown_days") or 0),
                },
                "targets": targets,
                "runs": [_run_view(_row_to_run(row), goal) for row in runs],
            }
        )
    return {"goals": out, "time": int(_now())}


# ---------------------------------------------------------------- 领取


def issue(owner_key: str, goal_key: str, target: str, tokens: Any = None) -> dict[str, Any]:
    """领取任务：锁定目标，记下它当前的星数作为基线。"""
    goal = _goal(goal_key)
    ref = _parse_target(target)
    pet_key = _pet_key(ref.platform, ref.full_name)

    with db.connect() as conn:
        # 冷却期先判：同一个仓库 N 天内不重复出题。
        # 放在候选池检查之前 —— 冷却中的仓库本来就不在池子里，
        # 先查池子会把「冷却中」误报成「不在任务列表」，玩家看不到真正的原因。
        cutoff = _now() - int(goal.get("cooldown_days") or 0) * 86400
        cooled = conn.execute(
            "SELECT id FROM quest_runs WHERE owner_key = ? AND pet_key = ? AND goal_key = ? "
            "AND (issued_at > ? OR status = 'fixing')",
            (owner_key, pet_key, goal_key, cutoff),
        ).fetchone()
        if cooled is not None:
            raise QuestError(
                "这个仓库刚做过任务，先去点别的",
                status_code=409,
                hint=f"同一个仓库 {goal.get('cooldown_days')} 天内只出一次题",
            )
        # 目标必须来自候选池：只允许给「社区里别人的仓库」点星
        pool = {item["petKey"] for item in _candidates(conn, owner_key, goal)}
        if pet_key not in pool:
            raise QuestError(
                "这个仓库现在不在任务列表里",
                status_code=409,
                hint="换一个目标，或者刷新任务板看看",
            )
        # 每日额度
        issued_today = int(
            conn.execute(
                "SELECT COUNT(*) AS n FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
                "AND issued_at >= ? AND issued_at < ?",
                (owner_key, goal_key, *_today_range()),
            ).fetchone()["n"]
            or 0
        )
        if issued_today >= int(goal.get("daily_limit") or 0):
            raise QuestError(
                f"今天的额度用完了（{issued_today}/{goal.get('daily_limit')}）",
                status_code=429,
                hint="明天再来，或者先把手上的任务复审掉",
            )
        # 待办名额：已领取但还没复审过的任务占位
        slots = int(
            conn.execute(
                "SELECT COUNT(*) AS n FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
                "AND status = 'fixing' AND attempts = 0",
                (owner_key, goal_key),
            ).fetchone()["n"]
            or 0
        )
        if slots >= 3:
            raise QuestError(
                "手上已经有 3 个没复审的任务了",
                status_code=429,
                hint="先去复审一个，或者等它作废",
            )

    # 基线星数：现拉一次，不用 6 小时缓存 —— 缓存里的星数是旧的，拿它当基线会误判
    stars_before = fetch_repo_meta(ref, _platform_token(tokens, ref.platform)).get("stargazers_count")

    payload = {
        "platform": ref.platform,
        "fullName": ref.full_name,
        "owner": ref.owner,
        "repo": ref.repo,
        "htmlUrl": ref.html_url,
        "starsBefore": stars_before,
        "starsObservedAt": _now(),
        "brief": goal["brief"],
        "accept": list(goal.get("accept") or []),
    }

    run_id = uuid.uuid4().hex[:16]
    try:
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO quest_runs (id, owner_key, pet_key, goal_key, verify_level, payload, "
                "issued_at, attempts, status, evidence, reward, verify_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'fixing', '[]', '{}', NULL)",
                (
                    run_id,
                    owner_key,
                    pet_key,
                    goal_key,
                    goal.get("verify_level", "L1"),
                    _dumps(payload),
                    _now(),
                ),
            )
            row = conn.execute("SELECT * FROM quest_runs WHERE id = ?", (run_id,)).fetchone()
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise QuestError("这个任务刚被别人领走了", status_code=409, hint="换一个目标试试") from None
        raise

    return {"run": _run_view(_row_to_run(row), goal), "goal": goal["key"]}


# ---------------------------------------------------------------- 复审


def verify(owner_key: str, run_id: str, tokens: Any = None) -> dict[str, Any]:
    """复审：重新拉星数，和领取时的基线比对；令牌在手时再核对一次归因。"""
    run_id = (run_id or "").strip()[:64]
    if not run_id:
        raise QuestError("缺少任务 ID", status_code=400)

    with db.connect() as conn:
        row = conn.execute(
            "SELECT * FROM quest_runs WHERE id = ? AND owner_key = ?", (run_id, owner_key)
        ).fetchone()
    if row is None:
        raise QuestError("任务不存在", status_code=404)

    run = _row_to_run(row)
    goal = _goal(run["goal_key"])

    # 已经通过：重复提交不重复发奖，直接把原结果返回
    if run["status"] == "passed":
        return {"run": _run_view(run, goal), "result": "passed", "duplicate": True}

    if run["status"] == "expired":
        raise QuestError("这个任务已经作废了", status_code=429, hint="复审次数用完，重新领一个吧")

    max_attempts = int(goal.get("max_attempts") or 5)
    attempts = int(run.get("attempts") or 0)
    if attempts >= max_attempts:
        # 第 6 次复审：任务作废
        with db.connect() as conn:
            conn.execute(
                "UPDATE quest_runs SET status = 'expired', verify_at = ? WHERE id = ?",
                (_now(), run_id),
            )
        raise QuestError(
            f"复审次数用完了（上限 {max_attempts} 次）",
            status_code=429,
            hint="任务已作废，重新领一个吧",
        )

    payload = run.get("payload") or {}
    ref = ref_from_parts(payload.get("platform", "github"), payload.get("owner", ""), payload.get("repo", ""))
    before = payload.get("starsBefore")
    token = _platform_token(tokens, ref.platform)

    meta = fetch_repo_meta(ref, token)
    after = meta.get("stargazers_count")
    delta = None
    if isinstance(before, int) and isinstance(after, int):
        delta = after - before

    # L2 归因：只有玩家自己的令牌能当证据，服务端兜底令牌代表的是站点账号，不能用
    attributed: bool | None = None
    if token:
        attributed = check_starred(ref, token)

    if not isinstance(after, int):
        result = "failed"
        missing = "没读到仓库的星数，可能是仓库改名了或者接口限流了，稍后再试一次"
    elif delta is None or delta <= 0:
        result = "failed"
        missing = (
            f"星数还是 {after}（领取时是 {before}）—— 还没点星？"
            "去仓库页点右上角的 ★，等一会儿再回来复审"
        )
    elif attributed is True:
        result = "passed"
        missing = ""
    elif attributed is False:
        result = "partial"
        missing = (
            f"星数涨了 {delta}，但这个账号在平台上没有收藏过它 —— "
            "换用你实际点星的账号登录，或在设置里粘贴那个账号的 GitHub 令牌再复审"
        )
    else:
        result = "partial"
        missing = (
            f"星数涨了 {delta}，但没能核对到「是不是你点的」 —— "
            "登录 GitHub（或在设置里粘贴一枚 GitHub 令牌）再复审一次就能拿全额"
        )

    evidence = list(run.get("evidence") or [])
    evidence.append(
        {
            "at": _now(),
            "result": result,
            "field": "stargazers_count",
            "before": before,
            "after": after,
            "delta": delta,
            "attributed": attributed,
            "missing": missing,
        }
    )

    status = "passed" if result == "passed" else "fixing"
    if result in ("passed", "partial"):
        _grant_reward(run, goal, result, owner_key)

    with db.connect() as conn:
        conn.execute(
            "UPDATE quest_runs SET attempts = ?, status = ?, evidence = ?, reward = ?, verify_at = ? WHERE id = ?",
            (
                attempts + 1,
                status,
                _dumps(evidence),
                _dumps(run.get("reward") or {}),
                _now(),
                run_id,
            ),
        )
        row = conn.execute("SELECT * FROM quest_runs WHERE id = ?", (run_id,)).fetchone()

    view = _run_view(_row_to_run(row), goal)
    return {
        "run": view,
        "result": result,
        "missing": missing,
        "delta": delta,
        "attributed": attributed,
        "reward": view.get("reward") or {},
    }


# ---------------------------------------------------------------- 历史


def history(owner_key: str, limit: int = 30) -> dict[str, Any]:
    """历史记录 + 通过率统计。"""
    limit = max(1, min(int(limit), 100))
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM quest_runs WHERE owner_key = ? ORDER BY issued_at DESC LIMIT ?",
            (owner_key, limit),
        ).fetchall()
    runs = [_row_to_run(row) for row in rows]

    tally = {"passed": 0, "partial": 0, "failed": 0}
    for run in runs:
        evidence = run.get("evidence") or []
        if not evidence:
            continue
        result = evidence[-1].get("result")
        if result in tally:
            tally[result] += 1
    done = sum(tally.values())
    return {
        "items": [
            {
                "id": run["id"],
                "goalKey": run["goal_key"],
                "goalTitle": GOALS.get(run["goal_key"], {}).get("title", run["goal_key"]),
                "petKey": run["pet_key"],
                "repo": (run.get("payload") or {}).get("fullName", ""),
                "status": run["status"],
                "result": ((run.get("evidence") or [{}])[-1] or {}).get("result"),
                "attempts": run.get("attempts"),
                "reward": run.get("reward") or {},
                "issuedAt": run.get("issued_at"),
                "verifyAt": run.get("verify_at"),
            }
            for run in runs
        ],
        "stats": {
            "total": len(runs),
            "done": done,
            "passRate": round(tally["passed"] / done * 100, 1) if done else 0.0,
            **tally,
        },
    }
