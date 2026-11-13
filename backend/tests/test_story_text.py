"""正片台词：玩家选的剧本（标题 + 三拍）必须真的进 prompt。"""

from __future__ import annotations

import asyncio
import json

from gitmon_api import llm as llm_mod
from gitmon_api import story

LLM = {"baseUrl": "http://127.0.0.1:11434/v1", "apiKey": "sk-test", "model": "probe"}
CONTEXT = {
    "pet_name": "4243342/gitmon",
    "boss_name": "vercel/next.js",
    "brief": "gitmon 想拆开 next.js 的脚手架。",
    "script_title": "《脚手架里的钉子》",
    "script_beats": [
        "开局：App Router 把构建配置藏进约定里，gitmon 找不到入口。",
        "中段：gitmon 扫编译产物，指出文档与实现的两处偏差。",
        "收束：双方在同一份基准上对线。",
    ],
}


def _run(scene_id, keys, vars_):
    return asyncio.run(story.generate_text(
        scene_id=scene_id, keys=keys, vars_=vars_, context=CONTEXT, llm_in=LLM,
    ))


def _stub(monkeypatch, sink: dict) -> None:
    async def fake(**kwargs) -> str:
        sink["user"] = kwargs["user"]
        return json.dumps({"lines": {"k": "台词"}}, ensure_ascii=False)

    monkeypatch.setattr(llm_mod, "chat_completion", fake)


def test_prompt_follows_the_chosen_script(monkeypatch) -> None:
    sink: dict = {}
    _stub(monkeypatch, sink)
    story._TEXT_CACHE.clear()
    data = _run("prologue", ["k"], {"chapter": 0})
    assert data["source"] == "llm"
    assert "《脚手架里的钉子》" in sink["user"]
    # 第 0 章 → 第一拍
    assert "App Router 把构建配置藏进约定里" in sink["user"]
    assert "第 1/3 段" in sink["user"]


def test_beat_advances_with_chapter(monkeypatch) -> None:
    sink: dict = {}
    _stub(monkeypatch, sink)
    story._TEXT_CACHE.clear()
    _run("boss_fight", ["k"], {"chapter": 2})
    assert "双方在同一份基准上对线" in sink["user"]
    assert "第 3/3 段" in sink["user"]


def test_cache_is_per_script(monkeypatch) -> None:
    """不同剧本不能共用同一屏的缓存，否则换了剧本台词还是旧的。"""
    calls: list[str] = []

    async def fake(**kwargs) -> str:
        calls.append(kwargs["user"])
        return json.dumps({"lines": {"k": "台词"}}, ensure_ascii=False)

    monkeypatch.setattr(llm_mod, "chat_completion", fake)
    story._TEXT_CACHE.clear()
    _run("prologue", ["k"], {"chapter": 0})
    again = _run("prologue", ["k"], {"chapter": 0})
    assert again["cached"] is True
    assert len(calls) == 1

    ctx_b = {**CONTEXT, "script_title": "《换一把尺子》", "script_beats": ["开局：换尺子。", "中段：量化。", "收束：对线。"]}
    asyncio.run(story.generate_text(scene_id="prologue", keys=["k"], vars_={"chapter": 0},
                                    context=ctx_b, llm_in=LLM))
    assert len(calls) == 2
