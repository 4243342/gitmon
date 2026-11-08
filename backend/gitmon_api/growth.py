"""养成结算：XP、升级、进化、沉睡。

规则来自设计文档 §5.3 / §7.1，全部是纯函数，输入旧状态 + 新快照，输出新状态。
"""

from __future__ import annotations

from typing import Any

from .engine import evolution_stage
from .scanner.snapshot import RepoSnapshot

MAX_LEVEL = 999

# XP 规则：event → (单个 XP, 单次结算上限)
XP_RULES: dict[str, tuple[int, int]] = {
    "commit": (2, 20),
    "issue_closed": (5, 50),
    "pr_merged": (10, 60),
    "release": (50, 150),
    "star": (1, 120),
    "fork": (1, 60),
}


def xp_to_next(level: int) -> int:
    """next_level_exp = 100 × level^1.5 —— 高等级每一级都是真功夫。"""
    level = max(1, min(MAX_LEVEL, int(level)))
    return int(100 * (level ** 1.5))


def apply_xp(level: int, exp: int, gained: int) -> tuple[int, int, int]:
    """返回 (新等级, 剩余经验, 提升的级数)。等级封顶 Lv.999。"""
    level = max(1, min(MAX_LEVEL, int(level)))
    exp = max(0, int(exp)) + max(0, int(gained))
    levels = 0
    while level < MAX_LEVEL:
        need = xp_to_next(level)
        if exp < need:
            break
        exp -= need
        level += 1
        levels += 1
    if level >= MAX_LEVEL:
        exp = min(exp, xp_to_next(MAX_LEVEL))
    return level, exp, levels


def status_for(snapshot: RepoSnapshot) -> str:
    return "sleeping" if snapshot.days_since_push > 30 else "active"


def settle(pet: dict[str, Any], snapshot: RepoSnapshot) -> dict[str, Any]:
    """按仓库指标增量结算一次 XP，返回要塞回数据库的字段与事件流水。"""
    previous = pet.get("metrics") or {}
    current = snapshot.metrics()

    # 提交数：扫描时若带了 since（上次同步时间），用它精确数增量；
    # 否则退回累计值相减（首次孵化、或平台不支持 since 查询时）。
    if snapshot.commits_since >= 0:
        commit_delta = snapshot.commits_since
    else:
        commit_delta = max(0, int(current["commits_total"]) - int(previous.get("commits_total") or 0))

    deltas = {
        "commit": commit_delta,
        "issue_closed": max(0, int(current["issues_closed"]) - int(previous.get("issues_closed") or 0)),
        "pr_merged": max(0, int(current["prs_merged"]) - int(previous.get("prs_merged") or 0)),
        "release": max(0, int(current["releases_total"]) - int(previous.get("releases_total") or 0)),
        "star": max(0, int(current["stars"]) - int(previous.get("stars") or 0)),
        "fork": max(0, int(current["forks"]) - int(previous.get("forks") or 0)),
    }

    events: list[dict[str, Any]] = []
    total_xp = 0
    for event_type, count in deltas.items():
        if count <= 0:
            continue
        unit, cap = XP_RULES[event_type]
        xp = min(cap, count * unit)
        total_xp += xp
        events.append({"type": event_type, "count": count, "xp": xp})

    level, exp, levels_gained = apply_xp(int(pet["level"]), int(pet.get("exp") or 0), total_xp)
    status = status_for(snapshot)

    bond = int(pet.get("bond") or 0)
    if status == "active":
        bond = min(100, bond + 1)
    else:
        bond = max(0, bond - 2)

    stage = evolution_stage(level, snapshot)
    stage = max(stage, int(pet.get("evolution_stage") or 1))  # 进化不可逆

    return {
        "level": level,
        "exp": exp,
        "levels_gained": levels_gained,
        "xp_gained": total_xp,
        "events": events,
        "status": status,
        "bond": bond,
        "evolution_stage": stage,
        "metrics": current,
        "evolved": stage > int(pet.get("evolution_stage") or 1),
    }
