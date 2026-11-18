import pytest

from gitmon_api import card_quality as quality


def check(name, weight, earned, *, dimension="source", refs=()):
    return quality.Check(name, dimension, weight, earned, refs, "Check supported evidence.")


@pytest.mark.parametrize("stars, forks, expected, key", [
    (0, 100, 0, "N"), (9, 0, 9, "N"), (10, 0, 10, "R"),
    (80, 10, 100, "SR"), (80, 40, 100, "SR"), (800, 100, 1000, "UR"),
    (10_000, 0, 10_000, "SE"), (100_000, 0, 100_000, "PSE"),
])
def test_rarity_uses_star_plus_capped_fork_bonus(stars, forks, expected, key):
    assert quality.rarity(stars, forks, private=False) == {
        "key": key, "name": quality.rarity(stars, forks, private=False)["name"],
        "color": quality.rarity(stars, forks, private=False)["color"], "recognition": expected, "status": "confirmed",
    }


def test_rarity_does_not_mix_missing_private_and_zero():
    assert quality.rarity(100_000, 99, private=True)["recognition"] is None
    assert quality.rarity(100_000, 99, private=True)["status"] == "unrated"
    assert quality.rarity(10, None, private=False)["status"] == "pending"
    assert quality.rarity(0, 0, private=False)["status"] == "confirmed"
    assert [quality.community(n) for n in (0, 10, 100, 1_000, 10_000, 99_999, 100_000, 300_000)] == [0, 20, 40, 60, 80, 99, 100, 100]


@pytest.mark.parametrize("basic, bonus, community, key", [
    (61, 0, 0, "iron"), (62, 0, 0, "bronze"), (71, 0, 0, "bronze"), (72, 0, 0, "silver"),
    (75, 0, 0, "silver"), (76, 0, 0, "gold"), (80, 0, 0, "gold"), (81, 0, 0, "platinum"),
    (100, 0, 0, "platinum"), (40, 30, 100, "bronze"), (82, 0, 31, "emerald"),
    (82, 0, 32, "diamond"), (90, 25, 70, "king"), (90, 26, 69, "diamond"), (89, 30, 100, "diamond"),
])
def test_new_ranking_lines_require_source_gates(basic, bonus, community, key):
    test = min(20, bonus)
    result = quality.rate([check("source", 100, basic), check("tests", 20, test, dimension="test"),
                           check("docs", 10, bonus - test, dimension="docs")], (community, community))
    assert result["key"] == key
    assert result["status"] == "confirmed"
    assert result["scoreMin"] == result["scoreMax"] == basic + min(bonus, 3 * basic // 10) + community


def test_unknown_items_create_intervals_and_agent_cannot_override_verified_evidence():
    items = [check("known", 90, 75, refs=("main.py",)), check("state", 10, None, refs=("main.py",)),
             check("docs", 10, None, dimension="docs")]
    pending = quality.rate(items, (0, 0), {"docs": True, "known": True, "unexpected": True})
    assert pending["status"] == "pending"
    assert (pending["minRank"], pending["maxRank"]) == (2, 4)
    assert (pending["sourceMin"], pending["sourceMax"]) == (75, 85)
    assert (pending["scoreMin"], pending["scoreMax"]) == (75, 95)
    confirmed = quality.rate(items, (0, 0), {"state": True})
    assert confirmed["key"] == "platinum"
    assert (confirmed["scoreMin"], confirmed["scoreMax"]) == (85, 95)


def test_absent_code_is_inapplicable_only_when_coverage_is_confirmed():
    assert quality.rate(quality.checks({"has_code": False, "complete": True}), (0, 0))["status"] == "not_applicable"
    for evidence in ({}, {"has_code": False, "complete": False}):
        result = quality.rate(quality.checks(evidence), (0, 100))
        assert result["status"] == "pending"
        assert result["scoreMin"] == 0 and result["scoreMax"] == 230


def test_comments_missing_excerpts_and_unrelated_handlers_do_not_earn_score():
    evidence = {
        "complete": False,
        "sources_complete": True,
        "sources": {"main.py": "def main():\n    return open('data')\n\ndef unrelated():\n    try:\n        return 1\n    except OSError:\n        return 0\n"},
        "readme": "python nonexistent.py --check",
        "tests": {"test_main.py": "def test_main():\n    # assert main()\n    assert True\n"},
    }
    items = {item.id: item for item in quality.checks(evidence)}
    for name in ("source_errors", "source_resources", "test_entry", "test_core", "docs_command"):
        assert items[name].earned is None


def test_supported_evidence_earns_points_and_absent_tests_are_zero():
    evidence = {
        "complete": True,
        "sources_complete": True,
        "has_tests": False,
        "sources": {"main.py": "def main() -> str:\n    try:\n        with open('data') as handle:\n            return ''\n    except OSError:\n        return ''\n"},
        "readme": "```sh\npython main.py --format text\n```",
        "readme_path": "README.md",
    }
    items = {item.id: item for item in quality.checks(evidence)}
    assert sum(i.maximum for i in items.values() if i.dimension == "source") == 100
    assert items["source_errors"].earned == 15
    assert items["source_resources"].earned == 10
    assert items["test_core"].earned == 0
    assert items["docs_command"].earned == 6
    assert items["docs_details"].earned == 4
    assert items["docs_details"].refs == ("README.md", "main.py")
