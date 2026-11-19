"""Quality-only GPI contract tests. No network or external static-analysis tools."""
from conftest import make_snapshot
from gitmon_api import gpi_quality
from gitmon_api.card_quality import Check


def evidence(source=80, tests=70, docs=80):
    return [
        Check("source", "source", 100, source, ("src/main.py",), "Verified source contract"),
        Check("test", "test", 100, tests, ("tests/test_main.py",), "Verified test contract"),
        Check("docs", "docs", 100, docs, ("README.md",), "Documented command"),
    ]


def test_weights_are_70_30_and_quality_levels_remain_six():
    assert sum(gpi_quality.WEIGHTS.values()) == 100
    assert sum(gpi_quality.WEIGHTS[key] for key in
               ("evolution", "reliability", "architecture", "innovation")) == 70
    assert sum(gpi_quality.WEIGHTS[key] for key in
               ("demand", "ecosystem", "sustainability")) == 30
    assert [key for _, key in gpi_quality.KEYS] == ["PSE", "SE", "UR", "SR", "R", "N"]


def test_metadata_alone_does_not_confirm_quality():
    snap = make_snapshot(stars=1_000_000, forks=100_000, contributors=2_000)
    rating = gpi_quality.evaluate(snap, [])
    assert rating["key"] == "pending"
    assert rating["status"] == "pending"
    assert rating["confidence"] < 0.25
    assert len(rating["dimensions"]) == 7


def test_verified_source_and_test_evidence_give_deterministic_result():
    snapshot = make_snapshot()
    original = snapshot.stars, list(snapshot.commits_52w)
    first = gpi_quality.evaluate(snapshot, evidence())
    second = gpi_quality.evaluate(snapshot, evidence())
    assert first == second
    assert first["status"] == "confirmed"
    assert first["key"] in {"N", "R", "SR", "UR", "SE", "PSE"}
    assert first["version"] == "gpi-heuristic-v1"
    assert snapshot.stars == original[0] and snapshot.commits_52w == original[1]
    assert 0 <= first["score"] <= 100
    assert 0 < first["confidence"] < 1


def test_unverified_source_does_not_become_a_pass():
    snap = make_snapshot()
    unknown = [Check("source", "source", 100, None, ("src/main.py",), "Not reviewed")]
    rating = gpi_quality.evaluate(snap, unknown)
    assert rating["status"] == "pending"
    assert rating["dimensions"][2]["score"] == 50


def test_large_star_increase_only_affects_weak_adoption_proxy():
    lo = gpi_quality.evaluate(make_snapshot(stars=10, forks=3), evidence())
    hi = gpi_quality.evaluate(make_snapshot(stars=100_000, forks=3), evidence())
    assert lo["key"] in gpi_quality.NAMES
    assert hi["key"] in gpi_quality.NAMES
    assert abs(hi["score"] - lo["score"]) < 2.0


def test_incomplete_weeks_dont_invent_180_day_acceleration():
    snap = make_snapshot(commits_52w=[9] * 5)
    result = gpi_quality.evaluate(snap, evidence())
    assert result["dimensions"][0]["confidence"] < .3
    assert "future prediction not calibrated" in " ".join(result["limitations"])
