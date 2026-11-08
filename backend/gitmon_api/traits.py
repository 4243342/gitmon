"""根基与性格词条：精灵的"底子"和"脾气"。

设计文档 §6.3 / §6.4。两条设计原则：

1. **词条是判出来的，不是抽出来的** —— 每个词条都有明确触发条件与理由文案，
   玩家补测试、拆提交、写文档之后，负面词条会自己消失。可解释、可修复。
2. **AI 只压根基，不直接压品质** —— 品质看"结果好不好"，根基看"底子稳不稳"。
   AI 率高的仓库通常配置齐全、品质不低，但改起来容易塌，这才是"根基不稳"。

纯函数，零 IO。
"""

from __future__ import annotations

from typing import Any

from .scanner.snapshot import RepoSnapshot

# ---------------------------------------------------------------- 根基

FOUNDATION_WEIGHTS = {
    "tests": 0.30,        # 测试承重
    "granularity": 0.20,  # 提交粒度（小步提交 = 稳）
    "history": 0.15,      # 时间沉淀
    "docs": 0.20,         # 设计与文档
    "authenticity": 0.15,  # 真实性（1 - AI 味）
}

FOUNDATION_TIERS: list[tuple[int, str, str]] = [
    (80, "solid", "稳固"),
    (60, "fair", "尚可"),
    (40, "loose", "松动"),
    (0, "unstable", "根基不稳"),
]

# AI 味的上限压制：AI 率高的仓库不允许评"稳固"
AI_RATE_CAPS = [(80, 38.0), (60, 55.0)]


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def lines_per_commit(snapshot: RepoSnapshot) -> float:
    loc = float(snapshot.tree.get("loc") or 0)
    commits = int(snapshot.commits_total or 0)
    if commits <= 0:
        return 600.0
    return loc / commits


def foundation_score(snapshot: RepoSnapshot, ai_rate: float | None = None) -> tuple[float, dict[str, float]]:
    """根基 0–100。ai_rate 为 None 表示没跑离线检测，按中性值计。"""
    tree = snapshot.tree
    flags = tree.get("flags") or {}

    tests = _clamp01(snapshot.test_ratio / 0.25)
    per_commit = lines_per_commit(snapshot)
    # 80 行/提交是理想节奏；600 行以上视为"一次糊完"，颗粒度为 0
    granularity = _clamp01(1.0 - (per_commit - 80.0) / 520.0)
    history = _clamp01(snapshot.age_months / 60.0)
    docs = (
        0.6 * _clamp01(snapshot.readme_chars / 4000.0)
        + 0.2 * (1.0 if snapshot.license else 0.0)
        + 0.2 * (1.0 if flags.get("has_docs_dir") else 0.0)
    )
    authenticity = 0.65 if ai_rate is None else _clamp01(1.0 - float(ai_rate) / 100.0)

    dims = {
        "tests": round(tests * 100, 1),
        "granularity": round(granularity * 100, 1),
        "history": round(history * 100, 1),
        "docs": round(docs * 100, 1),
        "authenticity": round(authenticity * 100, 1),
    }
    score = sum(dims[key] * weight for key, weight in FOUNDATION_WEIGHTS.items())

    if ai_rate is not None:
        for floor, cap in AI_RATE_CAPS:
            if float(ai_rate) >= floor:
                score = min(score, cap)
                break
    return round(score, 1), dims


def foundation_tier(score: float) -> dict[str, Any]:
    for floor, key, name in FOUNDATION_TIERS:
        if score >= floor:
            return {"key": key, "name": name, "min": floor}
    return {"key": "unstable", "name": "根基不稳", "min": 0}


# ---------------------------------------------------------------- 词条

ALL_STATS = ("攻击", "防御", "速度", "特攻", "特防", "HP")


def _trait(key: str, name: str, kind: str, desc: str, reason: str, effect: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": key,
        "name": name,
        "kind": kind,  # positive / negative
        "desc": desc,
        "reason": reason,
        "effect": effect,
    }


def derive_traits(
    snapshot: RepoSnapshot,
    *,
    ai_rate: float | None = None,
    element_secondary: str | None = None,
    limit: int = 4,
) -> list[dict[str, Any]]:
    """按信号判定词条。负面优先，最多 limit 条。"""
    tree = snapshot.tree
    flags = tree.get("flags") or {}
    code_files = int(tree.get("code_files") or 0)
    deps = len(snapshot.dependencies or [])
    per_commit = lines_per_commit(snapshot)
    traits: list[dict[str, Any]] = []

    # ---------------- 负面：AI 味 ----------------
    if ai_rate is not None and float(ai_rate) >= 75:
        traits.append(_trait(
            "generated_body", "生成体", "negative",
            "骨架是补全出来的：结构完整、注释齐整，但没人真正走过每一步。",
            f"AI 味 {float(ai_rate):.0f}/100（几乎全生成）",
            {"statsPct": -12, "expPct": 25, "milestone": 2},
        ))
    elif ai_rate is not None and float(ai_rate) >= 50:
        traits.append(_trait(
            "unstable_foundation", "根基不稳", "negative",
            "跑得起来，但底座是浮的：一改就塌，一压就裂。",
            f"AI 味 {float(ai_rate):.0f}/100（以生成稿为主）",
            {"statsPct": -8, "expPct": 15, "milestone": 1},
        ))

    # ---------------- 负面：工程信号 ----------------
    if code_files >= 10 and snapshot.test_ratio < 0.03:
        traits.append(_trait(
            "naked", "裸奔无测试", "negative", "没有任何安全网，敢动一下都算勇气。",
            f"测试文件占比 {snapshot.test_ratio * 100:.0f}%",
            {"防御": -15},
        ))
    if per_commit > 600 and int(snapshot.commits_total or 0) >= 5:
        traits.append(_trait(
            "giant_commits", "巨提交史", "negative", "历史上习惯一次糊完，回滚成本比开发成本还高。",
            f"平均 {per_commit:.0f} 行/提交",
            {"速度": -8},
        ))
    if snapshot.days_since_push > 180:
        traits.append(_trait(
            "sleeping", "沉睡症", "negative", "很久没有动静，肌肉已经开始萎缩。",
            f"{snapshot.days_since_push} 天未推送",
            {"速度": -20, "HP": -10},
        ))
    if snapshot.contributors <= 1 and int(snapshot.prs_merged or 0) == 0 and snapshot.open_issues >= 20:
        traits.append(_trait(
            "island", "孤岛项目", "negative", "只有一个人，issue 堆成了山，没人复核也没人接力。",
            "单人维护且无合并 PR",
            {"特攻": -8},
        ))
    if snapshot.archived or snapshot.is_fork:
        traits.append(_trait(
            "half_done", "半途而废", "negative", "被归档或只是别人的影子，故事停在了半页。",
            "仓库已归档" if snapshot.archived else "Fork 而来，非原创主体",
            {"HP": -12, "攻击": -8},
        ))
    if deps > 60:
        traits.append(_trait(
            "fat_deps", "依赖臃肿", "negative", "身上挂满了别人的零件，动一处牵连全身。",
            f"{deps} 个直接依赖",
            {"HP": -8},
        ))

    # ---------------- 正面：工程信号 ----------------
    if snapshot.test_ratio >= 0.25:
        traits.append(_trait(
            "test_monk", "测试苦行僧", "positive", "先写测试再写实现，改代码时心里有底。",
            f"测试文件占比 {snapshot.test_ratio * 100:.0f}%",
            {"防御": 12},
        ))
    if snapshot.readme_chars >= 3000 and flags.get("has_docs_dir"):
        traits.append(_trait(
            "doc_neat", "文档洁癖", "positive", "文档和代码一起长，读的人不用猜。",
            f"README {snapshot.readme_chars} 字 + docs 目录",
            {"特防": 10},
        ))
    if snapshot.commits_90d >= 60:
        traits.append(_trait(
            "grinder", "卷王", "positive", "近三个月几乎天天在推，节奏压得住。",
            f"近 90 天 {snapshot.commits_90d} 次提交",
            {"攻击": 10},
        ))
    if int(snapshot.commits_total or 0) >= 100 and per_commit <= 120 and snapshot.releases_last_year >= 2:
        traits.append(_trait(
            "steady", "稳如老狗", "positive", "小步提交、按时发版，出问题也能精准回滚。",
            f"平均 {per_commit:.0f} 行/提交，去年 {snapshot.releases_last_year} 次发版",
            {"防御": 6, "HP": 5},
        ))
    if snapshot.contributors >= 10 and snapshot.issue_close_ratio >= 0.7:
        traits.append(_trait(
            "evangelist", "开源传教士", "positive", "有人提、有人改、有人收尾，社区自己在转。",
            f"{snapshot.contributors} 位贡献者，issue 关闭率 {snapshot.issue_close_ratio * 100:.0f}%",
            {"HP": 8},
        ))
    if snapshot.contributors == 1 and snapshot.stars >= 50:
        traits.append(_trait(
            "lone_wolf", "独行侠", "positive", "一个人也能打出名声，只是没人帮你守夜。",
            f"单人维护，{snapshot.stars} star",
            {"特攻": 8, "特防": -4},
        ))
    if snapshot.age_months >= 60:
        traits.append(_trait(
            "veteran", "十年老店", "positive", "活得够久，什么坑都踩过一遍了。",
            f"仓库已有 {snapshot.age_months} 个月",
            {"HP": 10},
        ))
    if element_secondary:
        traits.append(_trait(
            "dual", "双修", "positive", "两套技术栈都压得住，招式切换更顺。",
            "双属性精灵",
            {"特攻": 6},
        ))

    # 负面优先、同级按声明顺序，最多 limit 条
    traits.sort(key=lambda item: 0 if item["kind"] == "negative" else 1)
    return traits[:limit]


def apply_to_stats(stats: list[dict[str, Any]], traits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把词条效果叠到六维上。数值夹在 5–100。"""
    global_pct = sum(float(t["effect"].get("statsPct") or 0) for t in traits)
    flat: dict[str, float] = {}
    for trait in traits:
        for key, value in trait["effect"].items():
            if key in ALL_STATS:
                flat[key] = flat.get(key, 0.0) + float(value)

    adjusted: list[dict[str, Any]] = []
    for stat in stats:
        name = stat["name"]
        value = float(stat["value"])
        value *= 1.0 + global_pct / 100.0
        value += flat.get(name, 0.0)
        final = int(round(max(5.0, min(100.0, value))))
        grade = "S" if final >= 90 else "A" if final >= 75 else "B" if final >= 60 else "C" if final >= 40 else "D"
        adjusted.append({**stat, "value": final, "grade": grade})
    return adjusted


def xp_multiplier(traits: list[dict[str, Any]]) -> float:
    """负面词条让升级更慢：每级所需经验按比例上浮。"""
    pct = sum(float(t["effect"].get("expPct") or 0) for t in traits)
    return round(1.0 + max(-50.0, pct) / 100.0, 3)


def milestone_bonus(traits: list[dict[str, Any]]) -> int:
    """负面词条抬高进化门槛：需要多完成几个里程碑。"""
    return int(sum(int(t["effect"].get("milestone") or 0) for t in traits))


def summary(traits: list[dict[str, Any]]) -> str:
    """一句话性格，用于卡片副标题。"""
    if not traits:
        return "性格未定"
    return " · ".join(t["name"] for t in traits)
