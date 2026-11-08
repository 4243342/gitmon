"""判定引擎：确定性、品种、品质、工程量与等级。"""

from __future__ import annotations

from conftest import make_snapshot

from gitmon_api import engine
from gitmon_api.repo import parse_repo


def test_same_repo_same_creature(good_snapshot) -> None:
    first = engine.judge(good_snapshot)
    second = engine.judge(make_snapshot("github.com/acme/widget"))
    for key in ("seed", "sprite_seed", "element_key", "species_key", "level", "quality", "stats", "skills"):
        assert first[key] == second[key]


def test_different_repo_different_seed() -> None:
    a = engine.judge(make_snapshot("github.com/acme/one"))
    b = engine.judge(make_snapshot("github.com/acme/two"))
    assert a["sprite_seed"] != b["sprite_seed"]


def test_element_from_primary_language() -> None:
    python_repo = make_snapshot("github.com/acme/py", language="Python", tree={
        "lang_share": {"Python": 0.95}, "primary_language": "Python", "code_files": 10,
        "test_files": 1, "ci_files": [], "lint_files": [], "type_files": [], "loc": 2000,
    })
    spec = engine.judge(python_repo)
    assert spec["element_key"] == "water"


def test_dual_element_when_second_language_dominant() -> None:
    snapshot = make_snapshot("github.com/acme/mixed", tree={
        "lang_share": {"Python": 0.55, "Rust": 0.35}, "primary_language": "Python",
        "code_files": 40, "test_files": 8, "ci_files": [], "lint_files": [], "type_files": [], "loc": 9000,
    })
    spec = engine.judge(snapshot)
    assert spec["element_key"] == "water"
    assert spec["element_secondary"] == "steel"


def test_species_detection_ml_cli_docs() -> None:
    ml = make_snapshot("github.com/acme/llm", deps=["torch", "transformers", "numpy"],
                       description="LLM training toolkit", topics=["llm"])
    assert engine.judge(ml)["species_key"] == "dragon"

    cli = make_snapshot("github.com/acme/tool", deps=["click", "rich", "__bin__"],
                        description="command line tool", topics=["cli"])
    assert engine.judge(cli)["species_key"] == "bird"

    docs = make_snapshot("github.com/acme/notes", deps=["vitepress"], topics=["documentation"],
                         description="documentation site")
    assert engine.judge(docs)["species_key"] == "fairy"

    lib = make_snapshot("github.com/acme/httpx", deps=["anyio"],
                        description="a small library", topics=["library"],
                        tree={"lang_share": {"Python": 1.0}, "primary_language": "Python",
                              "code_files": 30, "test_files": 6, "ci_files": [], "lint_files": [],
                              "type_files": [], "loc": 5000})
    assert engine.judge(lib)["species_key"] == "element"

    webapp = make_snapshot("github.com/acme/app", deps=["react", "vite"])
    assert engine.judge(webapp)["species_key"] == "beast"


def test_quality_good_beats_weak(good_snapshot, weak_snapshot) -> None:
    good_score, good_dims, good_quality = engine.quality_score(good_snapshot)
    weak_score, weak_dims, weak_quality = engine.quality_score(weak_snapshot)
    assert good_score > weak_score
    assert good_dims["tests"] > weak_dims["tests"]
    assert good_dims["docs"] >= weak_dims["docs"]
    assert good_quality["key"] in {"SR", "SSR"}
    assert weak_quality["key"] == "N"


def test_quality_tiers_boundaries() -> None:
    assert engine.quality_by_key("N")["min"] == 0
    assert engine.quality_by_key("R")["min"] == 40
    assert engine.quality_by_key("SR")["min"] == 60
    assert engine.quality_by_key("SSR")["min"] == 80


def test_engineering_and_level_mapping(good_snapshot, weak_snapshot) -> None:
    weak_eng = engine.engineering_score(weak_snapshot)
    good_eng = engine.engineering_score(good_snapshot)
    assert 0 <= weak_eng < good_eng <= 100
    assert engine.level_from_engineering(0) == 1
    assert 1 <= engine.level_from_engineering(19) < 50
    assert 50 <= engine.level_from_engineering(25) < 150
    assert 150 <= engine.level_from_engineering(45) < 300
    assert engine.level_from_engineering(100) == 999


def test_stats_and_skills(good_snapshot) -> None:
    spec = engine.judge(good_snapshot)
    assert len(spec["stats"]) == 6
    assert all(0 <= stat["value"] <= 100 for stat in spec["stats"])
    assert spec["hp"] == spec["stats"][5]["value"] * 10
    assert 2 <= len(spec["skills"]) <= 4
    assert len(set(spec["skills"])) == len(spec["skills"])


def test_keep_species_locks_variety() -> None:
    snapshot = make_snapshot("github.com/acme/widget")
    locked = engine.judge(snapshot, keep_species=("fire", None, "phantom"))
    assert locked["element_key"] == "fire"
    assert locked["species_key"] == "phantom"


def test_sprite_seed_matches_frontend_algorithm() -> None:
    """与前端 hashSeed/ spriteSeed 的算法保持同源。"""
    ref = parse_repo("github.com/facebook/react")
    seed, sprite_seed = engine.sprite_seed_for(ref)
    assert seed == engine.fnv1a32("github/facebook/react")
    assert sprite_seed == engine.fnv1a32(f"{seed}facebook/react")


def test_stage_gating_requires_milestone(weak_snapshot) -> None:
    # 弱仓库没有 release、只有 1 位贡献者，等级再高也只能停在幼体
    assert engine.evolution_stage(600, weak_snapshot) == 1
    assert engine.evolution_stage(600, None) == 3
