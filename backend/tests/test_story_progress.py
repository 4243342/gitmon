"""推进写入与删宠联动：这两条是数据一致性问题，出错不会报错、只会悄悄丢进度。

覆盖：
- /progress 的 step 乐观锁：同一 step 只认一次，第二次必须 409「状态已过期」
- 串行写入（前端队列修的就是这个）：step 依次递增才持续推进
- 结局屏：写 ending 同时把线置 cleared，并把结局记进收集册（同结局不重复计数）
- 精灵被删：以它为主角的 active 线当场结案，不留「桌宠还锁着、主角却不存在」的空壳
"""

from __future__ import annotations

import json
import time

import pytest

from gitmon_api import services, story
from gitmon_api.db import db

OWNER = "owner-test"


@pytest.fixture()
def fresh_db(tmp_dir, monkeypatch):
    """每个用例一份空库：进度写入的断言全是「这一步/上一步」的关系，不能互相串。"""
    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-test.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    return db


def _insert_run(*, run_id: str = "run-0001", pet_key: str = "github-acme/widget", step: int = 0) -> None:
    now = time.time()
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO story_runs (id, owner_key, pet_key, pet_name, script_title, chapter_count,"
            " status, step, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (run_id, OWNER, pet_key, "acme/widget", "测试剧本", 3, "active", step, now, now),
        )


def _payload(*, step: int, scene_id: str = "prologue", ending_id: str = "") -> dict:
    return {
        "run_id": "run-0001",
        "step": step,
        "scene_id": ending_id or scene_id,
        "ink_state": json.dumps({"step": step}),
        "vars": {"chapter": 0, "trust": 0},
        "visited": ["prologue"],
        "history": [{"who": "narrator", "text": "…"}],
        "rollback_state": "",
        "ending_id": ending_id,
    }


def test_same_step_only_accepted_once(fresh_db) -> None:
    _insert_run()
    first = story.progress(OWNER, "run-0001", _payload(step=0))
    assert first["run"]["step"] == 1

    # 前端连点两下就是这个形状：两个请求都带 step=0。第二个必须被拒，
    # 而且拒绝后服务端状态不能被覆盖（否则本地与服务端各停一屏）。
    with pytest.raises(story.StoryError) as excinfo:
        story.progress(OWNER, "run-0001", _payload(step=0, scene_id="chapter_1"))
    assert excinfo.value.status_code == 409
    assert "过期" in excinfo.value.message

    with db.connect() as conn:
        row = conn.execute("SELECT step, scene_id FROM story_runs WHERE id='run-0001'").fetchone()
    assert row["step"] == 1
    assert row["scene_id"] == "prologue"


def test_serial_writes_keep_advancing(fresh_db) -> None:
    _insert_run()
    # 串行化之后前端就是这样一步步发的：每发一次 step 前进一，永远拿得到新 step
    for expected in (1, 2, 3):
        res = story.progress(OWNER, "run-0001", _payload(step=expected - 1, scene_id=f"scene_{expected}"))
        assert res["run"]["step"] == expected
        assert res["run"]["scene_id"] == f"scene_{expected}"


def test_ending_closes_run_and_records_once(fresh_db) -> None:
    _insert_run()
    res = story.progress(OWNER, "run-0001", _payload(step=0, ending_id="ending_trust"))
    assert res["cleared"] is True
    assert res["run"]["status"] == "cleared"
    assert res["reward"]["xp"] > 0

    with db.connect() as conn:
        rows = conn.execute(
            "SELECT ending_id FROM story_endings WHERE owner_key=?", (OWNER,)
        ).fetchall()
    assert [row["ending_id"] for row in rows] == ["ending_trust"]


def test_progress_on_closed_run_is_rejected(fresh_db) -> None:
    _insert_run()
    story.progress(OWNER, "run-0001", _payload(step=0, ending_id="ending_standard"))
    with pytest.raises(story.StoryError) as excinfo:
        story.progress(OWNER, "run-0001", _payload(step=1))
    assert excinfo.value.status_code == 409


def _insert_pet(pet_id: str = "pet-0001", full_name: str = "acme/widget") -> None:
    now = "2026-11-10T00:00:00Z"
    owner, _, repo = full_name.partition("/")
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO pets (id, platform, owner, repo, full_name, owner_key, seed, sprite_seed,"
            " element_key, species_key, quality, quality_score, engineering_score, level,"
            " created_at, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (pet_id, "github", owner, repo, full_name, OWNER, 1, 1,
             "fire", "cat", "A", 88.0, 80.0, 12, now, now),
        )


def test_removing_protagonist_pet_abandons_run(fresh_db) -> None:
    _insert_pet()
    _insert_run(pet_key="github-acme/widget")

    services.remove("pet-0001")

    with db.connect() as conn:
        row = conn.execute("SELECT status, closed_at FROM story_runs WHERE id='run-0001'").fetchone()
    assert row["status"] == "abandoned"
    assert row["closed_at"] is not None


def test_removing_other_pet_keeps_run(fresh_db) -> None:
    _insert_pet()
    _insert_pet("pet-0002", "acme/other")
    _insert_run(pet_key="github-acme/widget")

    services.remove("pet-0002")

    with db.connect() as conn:
        row = conn.execute("SELECT status FROM story_runs WHERE id='run-0001'").fetchone()
    assert row["status"] == "active"
