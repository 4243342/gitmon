"""养成结算：XP 曲线、升级、进化、沉睡。"""

from __future__ import annotations

from conftest import make_snapshot

from gitmon_api import growth


def test_xp_curve_is_superlinear() -> None:
    assert growth.xp_to_next(1) == 100
    assert growth.xp_to_next(10) > growth.xp_to_next(9)
    assert growth.xp_to_next(999) > growth.xp_to_next(998)


def test_apply_xp_levels_up_and_carries_remainder() -> None:
    level, exp, gained = growth.apply_xp(1, 0, 500)
    assert gained == 2
    assert level == 3
    assert exp == 500 - growth.xp_to_next(1) - growth.xp_to_next(2)


def test_apply_xp_caps_at_max_level() -> None:
    level, exp, _ = growth.apply_xp(998, 0, 10 ** 9)
    assert level == 999
    assert exp <= growth.xp_to_next(999)


def test_settle_awards_capped_xp(good_snapshot) -> None:
    pet = {
        "level": 10,
        "exp": 0,
        "metrics": {
            "commits_total": 100,
            "issues_closed": 10,
            "prs_merged": 5,
            "releases_total": 1,
            "stars": 100,
            "forks": 10,
        },
        "evolution_stage": 1,
        "bond": 0,
    }
    snapshot = make_snapshot(
        "github.com/acme/widget",
        commits_total=400,      # +300 commits → 上限 20 XP
        issues_closed=20,       # +10 → 50 XP
        prs_merged=8,           # +3 → 30 XP
        releases_total=2,       # +1 → 50 XP
        stars=150,              # +50 → 50 XP
        forks=12,               # +2 → 2 XP
    )
    result = growth.settle(pet, snapshot)
    assert result["xp_gained"] == 20 + 50 + 30 + 50 + 50 + 2
    assert result["level"] >= 10
    assert result["exp"] > 0
    assert result["status"] == "active"
    assert result["bond"] == 1
    event_types = {event["type"] for event in result["events"]}
    assert event_types == {"commit", "issue_closed", "pr_merged", "release", "star", "fork"}


def test_settle_no_delta_no_xp(good_snapshot) -> None:
    pet = {
        "level": 5, "exp": 10, "evolution_stage": 1, "bond": 40,
        "metrics": good_snapshot.metrics(),
    }
    result = growth.settle(pet, good_snapshot)
    assert result["xp_gained"] == 0
    assert result["level"] == 5
    assert result["events"] == []


def test_settle_sleeps_when_stale(weak_snapshot) -> None:
    pet = {"level": 3, "exp": 0, "evolution_stage": 1, "bond": 10,
           "metrics": {"commits_total": 14, "stars": 3, "issues_closed": 0,
                       "prs_merged": 0, "releases_total": 0, "forks": 0}}
    result = growth.settle(pet, weak_snapshot)
    assert result["status"] == "sleeping"
    assert result["bond"] < 10


def test_settle_never_downgrades_stage(good_snapshot) -> None:
    # Lv.700 对应第 7 阶（人形态），结算不会把阶段降下来
    pet = {"level": 700, "exp": 0, "evolution_stage": 7,
           "metrics": good_snapshot.metrics(), "bond": 50}
    result = growth.settle(pet, good_snapshot)
    assert result["evolution_stage"] >= 7
