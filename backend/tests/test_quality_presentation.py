"""六档卡片品质与旧存档、云端八档选图之间的边界。"""

from copy import deepcopy

import pytest

from gitmon_api import card_quality, cloud, engine, services, story


@pytest.fixture
def stored_pet(good_snapshot):
    good_snapshot.repo_id = "123"
    pet = services._compose(
        None, engine.judge(good_snapshot), good_snapshot.ref, "test-owner", good_snapshot,
        cloud_id="test-quality-card",
    )
    pet["quality"] = "SSR"
    pet["client_state"] = {"qualityKey": "SSR"}
    return pet


def test_legacy_stored_quality_reads_as_ur_without_regrading(stored_pet):
    original = deepcopy(stored_pet)
    presented = services.pet_to_api(stored_pet)
    assert presented["quality"]["key"] == presented["qualityKey"] == "UR"
    assert presented["quality"]["name"] == "金闪"
    assert presented["qualityScore"] == original["quality_score"]
    assert presented["stats"] == original["stats"]
    assert stored_pet == original


@pytest.mark.parametrize("recognition, key", [
    (0, "N"), (10, "R"), (100, "SR"), (1_000, "UR"), (10_000, "SE"), (100_000, "PSE"),
])
def test_cloud_quality_uses_rarity_and_preserves_eight_rank_art(stored_pet, recognition, key):
    rating = {"key": "king", "name": "王者", "status": "confirmed", "sourceMin": 90, "sourceMax": 90}
    stored_pet["card_ratings"] = {
        "rarity": card_quality.rarity(recognition, 0, private=False),
        "qualityRating": rating,
    }
    original = deepcopy(stored_pet)
    presented = cloud._present(stored_pet, "purpose_fire", "test", None)
    assert presented["qualityKey"] == presented["quality"]["key"] == key
    assert presented["quality"]["name"] == presented["rarity"]["name"]
    assert presented["quality"]["color"] == presented["rarity"]["color"]
    assert presented["quality"]["status"] == "confirmed"
    assert presented["qualityRating"] == rating
    assert presented["cardArt"] == "fire/08-king.png"
    assert presented["cardElement"]["key"] == "divine"
    assert stored_pet == original


@pytest.mark.parametrize("private, status", [(False, "pending"), (True, "unrated")])
def test_unrated_cloud_card_is_not_presented_as_confirmed_n(stored_pet, private, status):
    stored_pet["card_ratings"] = {
        "rarity": card_quality.rarity(None, None, private=private),
        "qualityRating": {"key": "pending", "status": "pending"},
    }
    presented = cloud._present(stored_pet, None, None, None)
    assert presented["qualityKey"] == presented["quality"]["key"] == "pending"
    assert presented["quality"]["status"] == status
    assert presented["quality"]["model"] == ""
    assert presented["cardArt"] is None


def test_old_story_quality_labels_are_canonical_without_changing_level_tiers():
    assert story._quality_label({"quality": "SSR"}) == "金闪(UR)"
    assert story._quality_label({"quality": {"key": "SSR", "name": "传说"}}) == "金闪(UR)"
    assert story._quality_label({"quality": {"key": "PSE", "name": "镜碎"}}) == "镜碎(PSE)"
    assert [story._tier_from_level(level) for level in (1, 49, 50, 199, 200, 499, 500, 999)] == [
        "N", "N", "R", "R", "SR", "SR", "UR", "UR",
    ]
