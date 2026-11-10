"""剧本包（pack）机制：包清单、系统剧本读包、世界观注入、pack 落库、结局标题按包取。

这一组盯的是「换包等于没换」这类静默串包：
  · mode=system 必须读指定包的方案，而不是永远读 default
  · 台词生成必须按包注入世界观 / 文风
  · 建线时选的包要落库，读档 / 换线后还能取回同一个包
  · 结局标题按包取：斗码苍穹的四个结局和通用包不是同一套
"""

from __future__ import annotations

import asyncio
import json

from gitmon_api import story, story_packs

LLM = {"baseUrl": "http://127.0.0.1:11434/v1", "apiKey": "sk-test", "model": "probe"}


# ------------------------------------------------------------------ 包注册表

def test_registry_lists_every_pack_on_disk() -> None:
    packs = story_packs.list_packs()
    ids = [item["id"] for item in packs]
    assert "default" in ids
    assert "douma" in ids
    # default 是 AI / 自定义剧本的兜底路线，不排在最前面抢玩家的眼
    assert ids[-1] == "default"


def test_pack_meta_exposes_what_the_ui_needs() -> None:
    douma = story_packs.get_pack("douma")
    assert douma["title"] == "斗码苍穹"
    assert douma["world"] and douma["style"]
    assert len(douma["variants"]) == 3
    # 结局标题按包隔离：斗码苍穹的四个结局 id 与通用包完全不同
    assert set(douma["endings"]) == {"ending_flame", "ending_withered", "ending_lone", "ending_steady"}
    assert set(story_packs.get_pack("default")["endings"]) == {
        "ending_trust", "ending_scarred", "ending_alone", "ending_standard"
    }


def test_unknown_pack_falls_back_to_default() -> None:
    """写错的 pack id 不能让正片整个挂掉。"""
    assert story_packs.get_pack("no-such-pack")["id"] == "default"
    assert story_packs.has_pack("no-such-pack") is False
    assert story_packs.has_pack("douma") is True


def test_clean_pack_id_strips_injection() -> None:
    assert story_packs.clean_pack_id("douma") == "douma"
    assert story_packs.clean_pack_id("  douma  ") == "douma"
    assert story_packs.clean_pack_id("") == "default"
    assert story_packs.clean_pack_id(None) == "default"
    # 路径穿越 / 注入字符必须被剥掉
    assert "/" not in story_packs.clean_pack_id("../../etc/passwd")
    assert story_packs.clean_pack_id("a/b;rm -rf") == "abrm-rf"


# ------------------------------------------------------------------ 系统剧本读包

def test_system_scripts_come_from_the_requested_pack() -> None:
    """mode=system + pack=douma 必须给回斗码苍穹的方案，不能是通用模板。"""
    items = story_packs.pack_scripts("douma", "demo/pet", "torvalds/linux")
    assert len(items) == 3
    assert all(item["pack"] == "douma" for item in items)
    # 占位符必须被真实项目名替换掉，不能把 {pet} 原样端到界面上
    joined = json.dumps(items, ensure_ascii=False)
    assert "{pet}" not in joined and "{boss}" not in joined
    assert "demo/pet" in joined
    # 斗码苍穹的方案要带玄幻语汇
    assert any("宗门" in item["title"] or "魂殿" in item["title"] for item in items)


def test_two_packs_give_different_scripts() -> None:
    douma = story_packs.pack_scripts("douma", "demo/pet", "torvalds/linux")
    default = story_packs.pack_scripts("default", "demo/pet", "torvalds/linux")
    assert [item["title"] for item in douma] != [item["title"] for item in default]


def test_scripts_endpoint_forwards_the_pack() -> None:
    data = asyncio.run(story.scripts(
        {"fullName": "demo/pet", "platform": "github", "level": 12},
        {"full_name": "torvalds/linux"},
        {},
        mode="system",
        pack="douma",
    ))
    assert data["source"] == "system"
    assert data["pack"] == "douma"
    assert len(data["scripts"]) == 3
    assert all(item["pack"] == "douma" for item in data["scripts"])
    # 方案标题要和斗码苍穹包对得上
    titles = " ".join(item["title"] for item in data["scripts"])
    assert "宗门" in titles or "魂殿" in titles


def test_unknown_pack_in_request_falls_back_to_default() -> None:
    data = asyncio.run(story.scripts(
        {"fullName": "demo/pet", "platform": "github", "level": 12},
        {"full_name": "torvalds/linux"},
        {},
        mode="system",
        pack="no-such-pack",
    ))
    assert data["pack"] == "default"
    assert len(data["scripts"]) == 3
    # 兜底后每条方案也要标 default，不能还挂着那个不存在的包名
    assert all(item["pack"] == "default" for item in data["scripts"])


# ------------------------------------------------------------------ 台词生成按包注入世界观

def test_generate_text_injects_the_pack_worldview(monkeypatch) -> None:
    """台词生成必须按包注入世界观 / 文风，否则斗码苍穹的台词还是通用腔。"""
    seen: dict[str, str] = {}

    async def fake_chat(*_args, system="", user="", **_k) -> str:
        seen["system"] = system
        seen["user"] = user
        return json.dumps({"lines": {"narrator.hook": "山门之外，风起。"}}, ensure_ascii=False)

    monkeypatch.setattr(story.llm_mod, "chat_completion", fake_chat)
    out = asyncio.run(story.generate_text(
        scene_id="prologue",
        keys=["narrator.hook"],
        vars_={},
        context={"pet_name": "demo/pet", "boss_name": "torvalds/linux", "pack": "douma"},
        llm_in=LLM,
    ))
    assert out["texts"]["narrator.hook"] == "山门之外，风起。"
    # 世界观 / 文风要进 prompt（generate_text 走 user 段）
    assert "魂殿" in seen["user"] or "宗门" in seen["user"]


def test_generate_text_without_pack_has_no_worldview(monkeypatch) -> None:
    """不带包的调用方（老路径）不能被强行塞进玄幻世界观。"""
    seen: dict[str, str] = {}

    async def fake_chat(*_args, system="", user="", **_k) -> str:
        seen["system"] = system
        seen["user"] = user
        return json.dumps({"lines": {"narrator.hook": "天亮了。"}}, ensure_ascii=False)

    monkeypatch.setattr(story.llm_mod, "chat_completion", fake_chat)
    asyncio.run(story.generate_text(
        scene_id="prologue",
        keys=["narrator.hook"],
        vars_={},
        context={"pet_name": "demo/pet", "boss_name": "torvalds/linux"},
        llm_in=LLM,
    ))
    assert "魂殿" not in seen["user"]


def test_text_cache_is_separated_by_pack(monkeypatch) -> None:
    """同一个场景在两个包里必须各写各的，不能复用上一包的台词。"""
    calls: list[dict] = []

    async def fake_chat(*_args, **_k) -> str:
        calls.append({})
        return json.dumps({"lines": {"narrator.hook": f"第 {len(calls)} 次"}}, ensure_ascii=False)

    monkeypatch.setattr(story.llm_mod, "chat_completion", fake_chat)
    monkeypatch.setattr(story, "_TEXT_CACHE", {}, raising=False)
    common = {"scene_id": "prologue", "keys": ["narrator.hook"], "vars_": {}, "llm_in": LLM}
    asyncio.run(story.generate_text(context={"pack": "douma"}, **common))
    asyncio.run(story.generate_text(context={"pack": "default"}, **common))
    # 两次都要真的调模型：缓存键里带了包 id
    assert len(calls) == 2


# ------------------------------------------------------------------ pack 落库

def _make_run(tmp_dir, monkeypatch, script: dict) -> dict:
    from gitmon_api.db import db

    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-pack.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    monkeypatch.setattr(story, "_SNAPSHOT_CACHE", {}, raising=False)
    monkeypatch.setattr(story, "boss_card", lambda *a, **k: {
        "full_name": "torvalds/linux", "cp": 60000, "stars": 180000, "language": "C",
        "tier": "SSR", "level": 150, "snapshot": None, "verdict": {},
    })
    pet = {"fullName": "demo/pet", "platform": "github", "aiEvaluated": True, "level": 18,
           "stats": [{"name": "HP", "value": 42}]}
    return story.create_run(
        "owner-pack", pet=pet, boss={"full_name": "torvalds/linux"},
        script=script, track="", rationale="", queries=[], selection_source="ai",
        seed=1, token="", llm_in=LLM,
    )


def test_create_run_persists_the_script_pack(tmp_dir, monkeypatch) -> None:
    """建线时选的包要落库 —— 读档 / 重进时才知道该跑哪条路线。"""
    from gitmon_api.db import db

    out = _make_run(tmp_dir, monkeypatch, {
        "title": "《斗破苍穹：torvalds/linux宗》",
        "logline": "一句话", "beats": ["开局", "中段", "收束"], "pack": "douma",
    })
    assert out["run"]["script_pack"] == "douma"
    with db.connect() as conn:
        row = conn.execute(
            "SELECT script_pack FROM story_runs WHERE id=?", (out["run"]["id"],)
        ).fetchone()
    assert row[0] == "douma"


def test_create_run_without_pack_records_default(tmp_dir, monkeypatch) -> None:
    from gitmon_api.db import db

    out = _make_run(tmp_dir, monkeypatch, {
        "title": "《x》", "logline": "y", "beats": ["a", "b", "c"],
    })
    assert out["run"]["script_pack"] == "default"


# ------------------------------------------------------------------ 结局标题按包取

def test_ending_title_uses_the_pack_table() -> None:
    assert story._ending_title("douma", "ending_flame") == "焚决线 · 一把火烧穿山门"
    assert story._ending_title("default", "ending_trust") == "内应线 · 有人替你开门"
    # 包里没有的结局 id：退回通用表（两条线共用一份 id 时不至于显示空白）
    assert story._ending_title("douma", "ending_trust") == "内应线 · 有人替你开门"
    # 两边都没有的 id：原样返回，不能空着
    assert story._ending_title("douma", "ending_nope") == "ending_nope"


def test_progress_reports_the_pack_ending_title(tmp_dir, monkeypatch) -> None:
    """结算时给的结局标题必须来自这条线自己的包。"""
    out = _make_run(tmp_dir, monkeypatch, {
        "title": "《x》", "logline": "y", "beats": ["a", "b", "c"], "pack": "douma",
    })
    data = story.progress("owner-pack", out["run"]["id"], {
        "step": 0,
        "scene_id": "ending",
        "ink_state": "",
        "vars": {"trust": 8, "deaths": 0, "route": "insider"},
        "ending_id": "ending_flame",
    })
    assert data["cleared"] is True
    assert data["reward"]["title"] == "焚决线 · 一把火烧穿山门"
