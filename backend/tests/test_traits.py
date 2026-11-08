"""根基与性格词条：公式边界、触发条件、数值叠算。"""

from __future__ import annotations

from conftest import make_snapshot

from gitmon_api import engine, traits


def test_good_foundation_beats_weak(good_snapshot, weak_snapshot) -> None:
    good, good_dims = traits.foundation_score(good_snapshot)
    weak, weak_dims = traits.foundation_score(weak_snapshot)
    assert good > weak
    assert good_dims["tests"] > weak_dims["tests"]
    assert good >= 60


def test_ai_rate_caps_foundation(good_snapshot) -> None:
    clean, _ = traits.foundation_score(good_snapshot, ai_rate=10)
    dirty, _ = traits.foundation_score(good_snapshot, ai_rate=85)
    assert clean > dirty
    assert dirty <= 38


def test_ai_rate_is_neutral_when_unknown(good_snapshot) -> None:
    unknown, dims = traits.foundation_score(good_snapshot, ai_rate=None)
    assert dims["authenticity"] == 65.0
    assert unknown > 0


def test_unstable_foundation_trait_triggers_at_50(weak_snapshot) -> None:
    weak_snapshot.tree = {**weak_snapshot.tree, "ai_rate": 62.0}
    spec = engine.judge(weak_snapshot)
    names = [t["name"] for t in spec["traits"]]
    assert "根基不稳" in names
    assert "生成体" not in names
    assert spec["ai_rate"] == 62.0
    assert spec["xp_multiplier"] > 1.0


def test_generated_body_replaces_unstable(weak_snapshot) -> None:
    weak_snapshot.tree = {**weak_snapshot.tree, "ai_rate": 88.0}
    spec = engine.judge(weak_snapshot)
    names = [t["name"] for t in spec["traits"]]
    assert "生成体" in names
    assert "根基不稳" not in names
    assert spec["milestone_bonus"] >= 2


def test_clean_repo_has_no_ai_trait(good_snapshot) -> None:
    good_snapshot.tree = {**good_snapshot.tree, "ai_rate": 12.0}
    spec = engine.judge(good_snapshot)
    assert all(t["key"] not in {"unstable_foundation", "generated_body"} for t in spec["traits"])
    assert spec["xp_multiplier"] == 1.0


def test_negative_traits_come_first_and_are_capped(good_snapshot) -> None:
    good_snapshot.tree = {**good_snapshot.tree, "ai_rate": 90.0}
    good_snapshot.pushed_at = "2024-01-01T00:00:00Z"  # 触发沉睡症
    spec = engine.judge(good_snapshot)
    kinds = [t["kind"] for t in spec["traits"]]
    assert len(spec["traits"]) <= 4
    assert kinds[0] == "negative"
    assert kinds == sorted(kinds, key=lambda k: 0 if k == "negative" else 1)


def test_apply_to_stats_is_clamped() -> None:
    stats = [{"name": "攻击", "value": 10, "grade": "D"}, {"name": "防御", "value": 98, "grade": "S"}]
    modified = traits.apply_to_stats(stats, [
        {"key": "x", "name": "x", "kind": "negative", "desc": "", "reason": "", "effect": {"攻击": -40}},
        {"key": "y", "name": "y", "kind": "positive", "desc": "", "reason": "", "effect": {"防御": 40}},
    ])
    assert modified[0]["value"] == 5
    assert modified[1]["value"] == 100


def test_stat_pct_and_flat_stack() -> None:
    stats = [{"name": name, "value": 50, "grade": "C"} for name in traits.ALL_STATS]
    modified = traits.apply_to_stats(stats, [
        {"key": "a", "name": "a", "kind": "negative", "desc": "", "reason": "", "effect": {"statsPct": -10, "防御": -5}},
    ])
    values = {item["name"]: item["value"] for item in modified}
    assert values["防御"] == 40  # 50*0.9 - 5
    assert values["攻击"] == 45
    assert all(item["grade"] in {"S", "A", "B", "C", "D"} for item in modified)


def test_naked_trait_needs_ten_code_files() -> None:
    small = make_snapshot("github.com/acme/tiny", tree={
        "code_files": 3, "test_files": 0, "loc": 300, "lang_share": {"Python": 1.0},
        "primary_language": "Python", "flags": {},
    })
    assert all(t["key"] != "naked" for t in traits.derive_traits(small))

    big = make_snapshot("github.com/acme/big", tree={
        "code_files": 40, "test_files": 0, "loc": 9000, "lang_share": {"Python": 1.0},
        "primary_language": "Python", "flags": {},
    })
    assert any(t["key"] == "naked" for t in traits.derive_traits(big))


def test_foundation_tier_boundaries() -> None:
    assert traits.foundation_tier(85)["name"] == "稳固"
    assert traits.foundation_tier(70)["name"] == "尚可"
    assert traits.foundation_tier(45)["name"] == "松动"
    assert traits.foundation_tier(20)["name"] == "根基不稳"


def test_traits_are_deterministic(good_snapshot) -> None:
    good_snapshot.tree = {**good_snapshot.tree, "ai_rate": 70.0}
    first = engine.judge(good_snapshot)["traits"]
    again = engine.judge(good_snapshot)["traits"]
    assert first == again
