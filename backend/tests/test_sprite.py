"""立绘与徽章渲染。"""

from __future__ import annotations

from conftest import make_snapshot

from gitmon_api import badge, engine, sprite

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _spec(name: str = "github.com/acme/widget"):
    return engine.judge(make_snapshot(name))


def test_png_is_valid_and_deterministic() -> None:
    spec = _spec()
    first = sprite.sprite_png(sprite_seed=spec["sprite_seed"], color="#f5c542", body="biped", stage=1)
    second = sprite.sprite_png(sprite_seed=spec["sprite_seed"], color="#f5c542", body="biped", stage=1)
    assert first.startswith(PNG_SIGNATURE)
    assert first == second
    assert b"IHDR" in first and b"IEND" in first


def test_png_changes_with_seed_and_stage() -> None:
    spec = _spec()
    base = sprite.sprite_png(sprite_seed=spec["sprite_seed"], color="#4a9eff", body="slime", stage=1)
    other = sprite.sprite_png(sprite_seed=spec["sprite_seed"] + 1, color="#4a9eff", body="slime", stage=1)
    stage3 = sprite.sprite_png(sprite_seed=spec["sprite_seed"], color="#4a9eff", body="slime", stage=3)
    assert base != other
    assert base != stage3


def test_grid_has_reasonable_coverage() -> None:
    grid = sprite.render_grid(sprite_seed=12345, color="#4a9eff", body="quadruped", stage=2, style="classic")
    filled = sum(1 for row in grid for pixel in row if pixel is not None)
    assert 30 < filled < 16 * 16
    # 立绘不该溢出画布
    assert len(grid) == 16 and all(len(row) == 16 for row in grid)


def test_rich_style_renders_32_grid() -> None:
    grid = sprite.render_grid(sprite_seed=4242, color="#9fb2c8", body="golem", stage=3, style="rich")
    assert len(grid) == 32
    filled = sum(1 for row in grid for pixel in row if pixel is not None)
    assert filled > 120


def test_every_body_type_renders() -> None:
    for species in engine.SPECIES:
        grid = sprite.render_grid(sprite_seed=999, color="#7bc96f", body=species["body"], stage=3, style="classic")
        filled = sum(1 for row in grid for pixel in row if pixel is not None)
        assert filled > 25, species["key"]


def test_badge_svg_contains_key_facts() -> None:
    spec = _spec()
    api = {
        "repo": "widget",
        "fullName": "acme/widget",
        "level": spec["level"],
        "quality": engine.quality_by_key(spec["quality"]),
        "element": engine.element_by_key(spec["element_key"]),
        "species": engine.species_by_key(spec["species_key"]),
        "spriteSeed": spec["sprite_seed"],
        "evolutionStage": spec["evolution_stage"],
        "qualityScore": spec["quality_score"],
        "engineeringScore": spec["engineering_score"],
    }
    svg = badge.badge_svg(api)
    assert svg.startswith("<svg")
    assert "widget" in svg
    assert f"Lv.{spec['level']}" in svg
    assert "<rect" in svg
    assert svg.count("<svg") == 1


def test_card_svg_lists_stats_and_skills() -> None:
    spec = _spec()
    api = {
        "repo": "widget", "fullName": "acme/widget", "owner": "acme", "platform": "github",
        "level": spec["level"], "hp": spec["hp"], "stats": spec["stats"], "skills": spec["skills"],
        "quality": engine.quality_by_key(spec["quality"]),
        "element": engine.element_by_key(spec["element_key"]),
        "species": engine.species_by_key(spec["species_key"]),
        "spriteSeed": spec["sprite_seed"], "evolutionStage": spec["evolution_stage"],
        "qualityScore": spec["quality_score"], "engineeringScore": spec["engineering_score"],
    }
    svg = badge.card_svg(api)
    assert svg.startswith("<svg")
    for skill in spec["skills"]:
        assert skill in svg
    for stat in spec["stats"]:
        assert stat["name"] in svg


def test_placeholder_badge_escapes() -> None:
    svg = badge.placeholder_badge("<script>alert(1)</script>")
    assert "<script>" not in svg
    assert "&lt;script&gt;" in svg
