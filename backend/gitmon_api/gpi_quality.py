"""GPI quality-only heuristic. No claim of validated future prediction.

Reuse the already collected RepoSnapshot and card_quality.Check evidence. Unknown
signals shrink toward a neutral prior instead of becoming fabricated failures.
The historical / commercial inputs are proxies, not measured adoption or revenue.
"""
from __future__ import annotations

import math
from typing import Any

WEIGHTS = {"evolution": 22, "reliability": 18, "architecture": 16,
           "innovation": 14, "demand": 15, "ecosystem": 10, "sustainability": 5}
KEYS = ((97, "PSE"), (90, "SE"), (80, "UR"), (60, "SR"), (40, "R"), (0, "N"))
NAMES = {"N": "普卡", "R": "稀有", "SR": "面闪", "UR": "金闪", "SE": "银碎", "PSE": "镜碎"}
COLORS = {"N": "#a2a8b2", "R": "#74b9ed", "SR": "#c696ff",
          "UR": "#ffce65", "SE": "#c6eafa", "PSE": "#f2aaff"}
PRIOR = 50.0


def _bounded(n: Any, low: float = 0, high: float = 100) -> float:
    try:
        value = float(n)
        return min(high, max(low, value)) if math.isfinite(value) else low
    except (ValueError, TypeError, OverflowError):
        return low


def _ratio(items: list[Any], dimension: str) -> tuple[float, float]:
    selected = [item for item in items if item.dimension == dimension]
    maximum = sum(item.maximum for item in selected)
    observed = [item for item in selected if item.earned is not None]
    coverage = sum(item.maximum for item in observed) / maximum if maximum else 0
    earned = sum(item.earned for item in observed)
    measured = 100 * earned / sum(item.maximum for item in observed) if observed else PRIOR
    return _bounded(measured), coverage


def _signal(value: float, confidence: float) -> tuple[float, float]:
    return _bounded(value), _bounded(confidence, 0, 1)


def _blend(signals: list[tuple[float, float]]) -> tuple[float, float]:
    if not signals:
        return PRIOR, 0
    score = sum(PRIOR + confidence * (value - PRIOR) for value, confidence in signals) / len(signals)
    certainty = sum(confidence for _, confidence in signals) / len(signals)
    return round(_bounded(score), 2), round(certainty, 3)


# 罕见度完全由 GPI 综合分决定（与星标无关）。
# GPI 是七维证据加权分，实际可达区间比"品质分"窄（中位 50 上下、优秀 60-75），
# 所以分档线按 GPI 的实际分布单独设，而不是沿用 0/40/60/80/90/97。
RARITY_BANDS = (
    (85, "PSE", "镜碎", "#f2aaff"),
    (75, "SE", "银碎", "#c6eafa"),
    (65, "UR", "金闪", "#ffce65"),
    (55, "SR", "面闪", "#c696ff"),
    (40, "R", "稀有", "#74b9ed"),
    (0, "N", "普卡", "#a2a8b2"),
)


def rarity(spec: dict[str, Any]) -> dict[str, Any]:
    """六档罕见度只由 GPI 综合分决定，与星标多少无关。"""
    status = spec.get("status", "pending")
    score = spec.get("score")
    if status != "confirmed" or not isinstance(score, (int, float)):
        return {"key": "pending", "name": "待评估", "color": "#9ca6b8",
                "status": "pending", "recognition": None, "source": "gpi"}
    _, key, name, color = next((band for band in RARITY_BANDS if score >= band[0]), RARITY_BANDS[-1])
    return {"key": key, "name": name, "color": color,
            "status": "confirmed", "recognition": None, "source": "gpi", "score": score}


def evaluate(snapshot: Any, checks: list[Any]) -> dict[str, Any]:
    """Return seven-dimensional evidence-weighted quality from existing data."""
    tree = snapshot.tree or {}
    flags = tree.get("flags") or {}
    weeks = snapshot.commits_52w or []
    merged = max(0, snapshot.prs_merged)
    closed = max(0, snapshot.prs_closed)
    days = snapshot.days_since_push
    source = _ratio(checks, "source")
    test = _ratio(checks, "test")
    docs = _ratio(checks, "docs")

    momentum = None
    if len(weeks) >= 26:
        middle = len(weeks) // 2
        before, after = sum(weeks[:middle]), sum(weeks[middle:])
        # Activity is only a weak proxy; cap its contribution. No commits != no innovation.
        momentum = _signal(50 + 25 * (after - before) / max(10, before + after), .4)

    dims = {
        "evolution": _blend([
            _signal(100 * merged / max(1, closed), .75 if closed else 0),
            momentum or _signal(PRIOR, 0),
        ]),
        "reliability": _blend([
            _signal(*test),
            _signal(85 if flags.get("has_workflows") else 35, .6 if tree else 0),
            _signal(78 if snapshot.releases_last_year else PRIOR, .4 if snapshot.releases_total else 0),
        ]),
        "architecture": _blend([_signal(*source)]),
        # Genuine novelty needs independent evidence; don't infer it from commit volume.
        "innovation": _blend([]),
        "demand": _blend([
            _signal(min(90, 40 + 6 * math.log1p(max(0, snapshot.stars))), .55 if snapshot.recognition_counts_known and not snapshot.private else 0),
        ]),
        "ecosystem": _blend([
            _signal(min(85, 40 + 7 * math.log1p(max(0, snapshot.contributors))), .55 if snapshot.contributors else 0),
            _signal(min(80, 40 + 5 * math.log1p(max(0, snapshot.forks))), .45 if snapshot.recognition_counts_known and not snapshot.private else 0),
        ]),
        "sustainability": _blend([
            _signal(85 if days < 30 else (60 if days < 180 else 30), .6 if snapshot.pushed_at else 0),
            _signal(min(85, 40 + snapshot.active_months * 2), .5 if len(weeks) >= 26 else 0),
            _signal(78 if snapshot.releases_last_year else 45, .4 if snapshot.releases_total else 0),
            _signal(*docs),
        ]),
    }
    score = round(sum(WEIGHTS[key] * dims[key][0] for key in WEIGHTS) / 100, 2)
    confidence = round(sum(WEIGHTS[key] * dims[key][1] for key in WEIGHTS) / 100, 3)
    # 没有源码证据（覆盖率 0）或置信度过低时才挂"待评估"。
    # 覆盖率偏低本身已经体现在各维度的置信度里，不该让有真实源码检查的项目
    # 因为只抽查了部分文件就永远无法评级。
    status = "pending" if confidence < .25 or source[1] <= 0 else "confirmed"
    key = next(key for minimum, key in KEYS if score >= minimum) if status == "confirmed" else "pending"
    return {
        "version": "gpi-heuristic-v1", "score": score, "confidence": confidence,
        "status": status, "key": key,
        "name": NAMES.get(key, "待评估"),
        "color": COLORS.get(key, "#9ca6b8"),
        "dimensions": [{"key": name, "weight": weight, "score": dims[name][0],
                        "confidence": dims[name][1]} for name, weight in WEIGHTS.items()],
        "limitations": ["180/365-day future prediction not calibrated",
                        "real adoption and revenue not observed",
                        "unknown source/test checks use neutral prior"],
    }
