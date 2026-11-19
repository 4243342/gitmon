"""云卡评级。按仓库版本复用 Agent 对具体证据的复核结果。"""

from __future__ import annotations

import json
import re
from threading import Lock
from typing import Any

from . import card_quality, card_quality_agent, gpi_quality
from .db import db
from .scanner.snapshot import RepoSnapshot

_RULES_VERSION = 1
_REVIEW_LOCKS = tuple(Lock() for _ in range(32))
_REVISION = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}", re.I)
_CACHE_WHERE = "WHERE platform=? AND repo_id=? AND revision=? AND rules_version=?"


def pending() -> dict[str, Any]:
    return {
        "rarity": card_quality.rarity(None, None, private=False),
        "qualityRating": card_quality.rate(card_quality.checks({}), (0, 100)),
    }


def _review(snapshot: RepoSnapshot, checks: list[card_quality.Check]) -> dict[str, bool]:
    evidence = snapshot.quality_evidence
    revision = evidence.get("revision", "")
    if not isinstance(revision, str) or not _REVISION.fullmatch(revision):
        return {}
    key = (snapshot.ref.platform, snapshot.repo_id, revision.lower(), _RULES_VERSION)
    # Serialize same-version reviews in this process and reserve the request in SQLite.
    # The reservation ensures that concurrent workers cannot repeat a paid request.
    with _REVIEW_LOCKS[hash(key) % len(_REVIEW_LOCKS)]:
        with db.connect() as conn:
            row = conn.execute(f"SELECT verdicts FROM card_quality_reviews {_CACHE_WHERE}", key).fetchone()
        if row is not None:
            return json.loads(row["verdicts"])
        plan = card_quality_agent.prepare(evidence, checks, private=snapshot.private)
        if plan is None:
            return {}
        with db.connect() as conn:
            claimed = conn.execute(
                "INSERT INTO card_quality_reviews (platform, repo_id, revision, rules_version) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(platform, repo_id, revision, rules_version) DO NOTHING", key,
            ).rowcount
        if not claimed:
            with db.connect() as conn:
                row = conn.execute(f"SELECT verdicts FROM card_quality_reviews {_CACHE_WHERE}", key).fetchone()
            return json.loads(row["verdicts"]) if row is not None else {}
        verdicts = card_quality_agent.review(plan)
        with db.connect() as conn:
            conn.execute(f"UPDATE card_quality_reviews SET verdicts=? {_CACHE_WHERE}",
                         (json.dumps(verdicts, separators=(",", ":")), *key))
        return verdicts


def evaluate(snapshot: RepoSnapshot) -> dict[str, Any]:
    stars = snapshot.stars if snapshot.recognition_counts_known else None
    forks = snapshot.forks if snapshot.recognition_counts_known else None
    rarity = card_quality.rarity(stars, forks, private=snapshot.private)
    community = (0, 0) if snapshot.private else (0, 100)
    if rarity["recognition"] is not None:
        score = card_quality.community(rarity["recognition"])
        community = (score, score)
    checks = card_quality.checks(snapshot.quality_evidence)
    rating = card_quality.rate(checks, community)
    if (rating["status"] == "pending" and rating["minRank"] is not None
            and rating["minRank"] != rating["maxRank"]):
        verdicts = _review(snapshot, checks)
        if verdicts:
            rating = card_quality.rate(checks, community, verdicts)
    potential = gpi_quality.evaluate(snapshot, checks)
    return {"rarity": rarity, "qualityRating": rating, "potential": potential}
