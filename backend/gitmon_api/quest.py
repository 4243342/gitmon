"""任务模式：领取 → 复审 → 发奖。

任务定义是**数据驱动**的（设计文档 docs/QUEST.md §10）：加一种任务只需要在 ``GOALS``
里加一条配置，接口与状态机完全复用。

当前上线的活动任务只有一个：``star`` —— **给本项目自己的仓库点一颗星**。

目标仓库是**固定的**（配置项 ``GITMON_QUEST_TARGET``，默认 ``4243342/gitmon``），
玩家没有得挑。为什么不做成「从社区里挑一个别人的仓库」：

- 活动的号召力来自「**就是这一个**」。一旦列出一堆候选，玩家会当成自助选菜，
  任务就退化成普通日常，喊不动人。
- 目标固定还让验真更简单也更硬：只有「这个仓库的星涨了」才算数，
  没有「换一个也能过」的退路。

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
from .config import settings
from .db import db
from .repo import RepoRef, ref_from_parts
from .scanner import check_starred, fetch_repo_meta

# ---------------------------------------------------------------- 任务定义


GOALS: dict[str, dict[str, Any]] = {
    "star": {
        "key": "star",
        "title": "给这个项目点一颗星",
        "brief": (
            "去 GitHub 给本项目的仓库点一颗 ★。"
            "你点的这颗星会直接算进社区认可分 —— 项目越被看见，"
            "站里的精灵就长得越好。"
        ),
        "accept": [
            "先点「领取」，锁定任务并记下它当前的星数",
            "去仓库页点右上角的 ★ Star",
            "回来点「我点好了」，后端重新拉一次星数核对",
        ],
        "verify_level": "L12",
        # 复审次数上限：前 5 次可复审，第 6 次返回 429 并把任务置为 expired
        "max_attempts": 5,
        # 每日可领数量：目标只有一个，一天最多领一次
        "daily_limit": 1,
        # 同时压着的任务数：目标唯一，同时也只能有一个
        "slots_limit": 1,
        # 同一个仓库的冷却期（天）：领过之后要等这么久才能再领
        "cooldown_days": 30,
        "reward": {
            "passed": {"stardust": 40, "trait_shard": 1},
            "partial": {"stardust": 16},
        },
    },
}


def _quest_target_ref() -> RepoRef:
    """活动任务的目标仓库（固定的，来自配置）。

    配置格式 ``owner/repo``（默认 GitHub）或 ``gitee/owner/repo``（指 Gitee）。
    """
    raw = (settings.quest_target or "").strip()
    if not raw:
        raise QuestError("活动任务还没配置目标仓库", status_code=500, hint="请设置 GITMON_QUEST_TARGET")
    if "/" not in raw:
        raise QuestError("活动任务的目标仓库配置不对", status_code=500, hint="应该是 owner/repo")
    head, _, rest = raw.partition("/")
    if head.lower() in ("github", "gitee") and "/" in rest:
        platform = head.lower()
        owner, _, repo = rest.partition("/")
    else:
        platform = "github"
        owner, repo = head, rest
    try:
        return ref_from_parts(platform, owner, repo)
    except Exception:
        raise QuestError("活动任务的目标仓库配置不对", status_code=500, hint="应该是 owner/repo") from None



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


# ---------------------------------------------------------------- 目标


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


def _target_view(conn: Any, goal: dict[str, Any]) -> dict[str, Any]:
    """活动任务的目标：固定的那一个仓库。

    只展示，不参与判定（判定看的是领取后重新拉的星数）。
    """
    ref = _quest_target_ref()
    key = _pet_key(ref.platform, ref.full_name)
    cache = _star_cache(conn, [ref.cache_key]).get(ref.cache_key, {})
    return {
        "petKey": key,
        "platform": ref.platform,
        "fullName": ref.full_name,
        "owner": ref.owner,
        "repo": ref.repo,
        "htmlUrl": ref.html_url,
        "stars": cache.get("stars"),
        "starsAt": cache.get("at"),
        # 固定目标：界面上直接说明这是「本项目的仓库」，不给玩家「换一个」的错觉
        "fixed": True,
    }


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
            # 进行中：还没判定的任务都算（failed 之后 status 仍是 fixing，
            # 因为玩家可能去点完星再回来复审 —— 它确实还占着这个目标）。
            slots = conn.execute(
                "SELECT COUNT(*) AS n FROM quest_runs WHERE owner_key = ? AND goal_key = ? "
                "AND status = 'fixing'",
                (owner_key, key),
            ).fetchone()
            active = int(slots["n"] or 0)
            runs = conn.execute(
                "SELECT * FROM quest_runs WHERE owner_key = ? AND goal_key = ? AND status = 'fixing' "
                "ORDER BY issued_at DESC LIMIT 20",
                (owner_key, key),
            ).fetchall()
            target = _target_view(conn, goal)
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
                    "slotsLimit": int(goal.get("slots_limit") or 1),
                    "slotsUsed": active,
                    "cooldownDays": int(goal.get("cooldown_days") or 0),
                },
                # 目标固定，只有这一个
                "target": target,
                "runs": [_run_view(_row_to_run(row), goal) for row in runs],
            }
        )
    return {"goals": out, "time": int(_now())}


# ---------------------------------------------------------------- 领取


def issue(owner_key: str, goal_key: str, target: str = "", tokens: Any = None) -> dict[str, Any]:
    """领取任务：锁定目标，记下它当前的星数作为基线。

    目标固定，``target`` 只作为前端回传的校验用 —— 传错或留空都按配置的目标走，
    不给「换个仓库也能领」留口子。
    """
    goal = _goal(goal_key)
    ref = _quest_target_ref()
    pet_key = _pet_key(ref.platform, ref.full_name)

    # 前端传了目标但跟配置的不一致 → 直接报错，别静默忽略（静默忽略会让人以为领到了别的仓库）
    given = (target or "").strip()
    if given:
        try:
            given_ref = _parse_target(given)
        except QuestError:
            given_ref = None
        if given_ref is None or _pet_key(given_ref.platform, given_ref.full_name) != pet_key:
            raise QuestError(
                "这个任务的目标是固定的，不能换",
                status_code=409,
                hint="活动任务只认配置里指定的那一个仓库",
            )

    with db.connect() as conn:
        # 每日额度先判：同一天重复领是最常见的误操作，报「额度用完了」最贴切。
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
        # 冷却期后判：跨天再来时报冷却（比「额度」更能说清为什么）。
        # 条件里的 status='fixing' 表示「手上还有没复审完的同一目标任务」——
        # 目标唯一，所以这种状态下不允许再开一个。
        cooldown_days = int(goal.get("cooldown_days") or 0)
        cutoff = _now() - cooldown_days * 86400
        cooled = conn.execute(
            "SELECT id, status, issued_at FROM quest_runs WHERE owner_key = ? AND pet_key = ? "
            "AND goal_key = ? AND (issued_at > ? OR status = 'fixing')",
            (owner_key, pet_key, goal_key, cutoff),
        ).fetchone()
        if cooled is not None:
            # 两条条件可能同时成立（任务还没复审 + 冷却也没过）。
            # 报更根本的那条：冷却期更长，先说冷却，玩家才知道要等多久；
            # 「还没复审」只是附注。
            if cooldown_days > 0 and float(cooled["issued_at"] or 0) > cutoff:
                raise QuestError(
                    f"这个任务刚做过，{cooldown_days} 天内不能再领",
                    status_code=409,
                    hint="冷却期过了再来 —— 同一颗星不该反复领",
                )
            raise QuestError(
                "这个任务还没复审完，先把它点掉",
                status_code=409,
                hint="去点星然后回来点「我点好了」；过期了才能重开",
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
