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
        momentum = _signal(50 + 25 * (after - before) / max(10, before + after), .35)

    dims = {
        "evolution": _blend([
            _signal(100 * merged / max(1, closed), .55 if closed else 0),
            momentum or _signal(PRIOR, 0),
        ]),
        "reliability": _blend([
            _signal(*test),
            _signal(65 if flags.get("has_workflows") else 35, .3 if tree else 0),
            _signal(65 if snapshot.releases_last_year else PRIOR, .25 if snapshot.releases_total else 0),
        ]),
        "architecture": _blend([_signal(*source)]),
        # Genuine novelty needs independent evidence; don't infer it from commit volume.
        "innovation": _blend([]),
        "demand": _blend([
            _signal(min(70, 40 + 6 * math.log1p(max(0, snapshot.stars))), .25 if snapshot.recognition_counts_known else 0),
        ]),
        "ecosystem": _blend([
            _signal(min(75, 40 + 7 * math.log1p(max(0, snapshot.contributors))), .3 if snapshot.contributors else 0),
            _signal(min(70, 40 + 5 * math.log1p(max(0, snapshot.forks))), .2 if snapshot.recognition_counts_known else 0),
        ]),
        "sustainability": _blend([
            _signal(70 if days < 30 else (50 if days < 180 else 25), .4 if snapshot.pushed_at else 0),
            _signal(min(75, 40 + snapshot.active_months * 2), .35 if len(weeks) >= 26 else 0),
            _signal(65 if snapshot.releases_last_year else 45, .2 if snapshot.releases_total else 0),
            _signal(*docs),
        ]),
    }
    score = round(sum(WEIGHTS[key] * dims[key][0] for key in WEIGHTS) / 100, 2)
    confidence = round(sum(WEIGHTS[key] * dims[key][1] for key in WEIGHTS) / 100, 3)
    # Do not fabricate high-confidence ratings from metadata-only snapshots.
    status = "pending" if confidence < .25 or source[1] < .30 else "confirmed"
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
