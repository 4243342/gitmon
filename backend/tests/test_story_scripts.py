"""自定义剧本：输入一个词后必须给回三个「照这个词写的」方案。"""

from __future__ import annotations

import asyncio
import json

from gitmon_api import story

PET = {"fullName": "demo/pet", "platform": "github", "level": 12}
BOSS = {"full_name": "torvalds/linux"}
LLM = {"baseUrl": "http://127.0.0.1:11434/v1", "apiKey": "sk-test", "model": "probe"}


def _run(text: str, llm=None):
    return asyncio.run(story.custom_script(PET, BOSS, text, llm))


def test_without_model_still_returns_three_takes() -> None:
    data = _run("赘婿", {})
    titles = [item["title"] for item in data["scripts"]]
    assert len(titles) == 3
    assert data["source"] == "rule"
    # 三个方案都要看得见玩家给的词，不能退回通用越级挑战
    assert all("赘婿" in title for title in titles)
    assert all(item["bridge"] for item in data["scripts"])
    assert all(len(item["beats"]) == 3 for item in data["scripts"])


def test_model_partial_result_is_padded_to_three(monkeypatch) -> None:
    payload = {
        "scripts": [{
            "title": "《赘婿归来》",
            "logline": "他回来了，带着一整套可复现的基准。",
            "bridge": "把入赘的屈辱换成公开复现，直接顶到 linux 的调度器上。",
            "beats": ["开局：被逐出核心列表。", "中段：提交被打回三次。", "收束：linux 亲手合入。"] ,
            "strong_fit": True,
        }],
    }

    async def fake_call(*_args, **_kwargs) -> str:
        return json.dumps(payload, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    data = _run("赘婿", LLM)
    # 模型只给了一条、剩下两条是规则补的，如实标 mixed（不能谎报全模型产出）
    assert data["source"] == "mixed"
    assert len(data["scripts"]) == 3
    assert data["scripts"][0]["title"] == "《赘婿归来》"
    # 补齐的两条也得是「照这个词写的」
    assert all("赘婿" in item["title"] for item in data["scripts"])


def test_model_full_result_keeps_bridge_and_strong_fit(monkeypatch) -> None:
    item = {
        "title": "《赘婿拆解》",
        "logline": "把原著的金手指拆成工程步骤。",
        "bridge": "冲突引擎落到对手的基准上。",
        "beats": ["开局：被低估。", "中段：当众复现。", "收束：正面对线。"],
        "strong_fit": False,
    }

    async def fake_call(*_args, **_kwargs) -> str:
        return json.dumps({"scripts": [item, {**item, "title": "《赘婿反写》"}, {**item, "title": "《赘婿原样》"}]}, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    data = _run("赘婿", LLM)
    assert len(data["scripts"]) == 3
    assert data["scripts"][0]["strong_fit"] is False
    assert data["scripts"][0]["bridge"] == "冲突引擎落到对手的基准上。"
    # 顶层兼容字段等于第一个方案，旧调用方仍可用
    assert data["title"] == "《赘婿拆解》"
    assert data["strong_fit"] is False


# ---------------------------------------------------------------- 选对手 → 剧本
# 这一组盯的是「AI 到底有没有参与、有没有用上调研」：
# 模型失败时必须如实降级并回传原因，不能再静默给三张通用模板冒充 AI 产出。

RESEARCH = {
    "track": "前端框架",
    "rationale": "三只对手分别代表正面竞争、生态压制、范式挑战。",
    "queries": ["language:TypeScript topic:framework stars:>10000"],
    "selection_source": "ai",
    "rivals": [{"full_name": "torvalds/linux", "reason": "正面竞争"},
               {"full_name": "vuejs/core", "reason": "生态压制"}],
}
BOSS_CARD = {
    "full_name": "torvalds/linux", "stars": 180000, "language": "C",
    "description": "Linux kernel source tree", "level": 150, "cp": 60000, "tier": "SSR",
    "reason": "同赛道的正面对手，量级高一档。",
    "verdict": {"element": {"name": "钢"}, "species": {"name": "巨兽"},
                "traits": [{"name": "上游垄断"}], "skills": [{"name": "调度器改写"}]},
}


def _scripts(llm=None, research=None, mode="auto"):
    return asyncio.run(story.scripts(PET, BOSS_CARD, llm, research=research, mode=mode))


def test_system_mode_never_calls_the_model(monkeypatch) -> None:
    """系统剧本必须零模型调用：玩家选了它就说明不想花额度、不想等。"""

    async def boom(*_a, **_k):
        raise AssertionError("mode=system 不许调用模型")

    monkeypatch.setattr(story, "_call_model", boom)
    data = _scripts(LLM, RESEARCH, mode="system")
    assert data["source"] == "system"
    assert data["mode"] == "system"
    assert len(data["scripts"]) == 3
    # 模板得照实标记，界面上才能和 AI 产出区分
    assert all(item["fallback"] for item in data["scripts"])
    assert all(item["title"] for item in data["scripts"])


def test_auto_mode_still_hits_the_model(monkeypatch) -> None:
    """同一个端点不带 mode 时行为不变，老调用方不受影响。"""

    async def fake_call(*_a, **_k) -> str:
        return json.dumps({"scripts": [
            {"title": f"《模型方案{i}》", "logline": "x", "beats": ["a", "b", "c"]} for i in (1, 2, 3)
        ]}, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    data = _scripts(LLM, RESEARCH)
    assert data["source"] == "llm"
    assert data["mode"] == "auto"


def test_no_model_reports_rule_and_reason() -> None:
    data = _scripts({}, RESEARCH)
    assert data["source"] == "rule"
    assert data["model_error"]
    assert len(data["scripts"]) == 3
    assert all(item["fallback"] for item in data["scripts"])


def test_model_failure_is_not_silent(monkeypatch) -> None:
    async def boom(*_a, **_k):
        raise story.StoryError("模型调用失败：模型响应超时（45 秒）", status_code=502)

    monkeypatch.setattr(story, "_call_model", boom)
    data = _scripts(LLM, RESEARCH)
    assert data["source"] == "rule"
    assert "超时" in data["model_error"]  # 降级原因要能显示给玩家
    assert len(data["scripts"]) == 3


def test_prompt_carries_the_research(monkeypatch) -> None:
    seen: dict[str, str] = {}

    async def fake_call(_llm, _system, user, **_k) -> str:
        seen["user"] = user
        return json.dumps({"scripts": [
            {"title": "《三条检索式》", "logline": "用 stars:>10000 这条检索式把对手照出来。",
             "beats": ["开局：赛道判定为前端框架。", "中段：正面竞争那条命中了 torvalds/linux。", "收束：上游垄断被拆穿。"]},
        ] * 1 + [
            {"title": f"《方案{i}》", "logline": "x", "beats": ["a", "b", "c"]} for i in (2, 3)
        ]}, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    data = _scripts(LLM, RESEARCH)
    assert data["source"] == "llm"
    # 调研结果必须真的进 prompt，否则模型只能写通用的「榜单 / 赛道 / 越级」
    assert "前端框架" in seen["user"]
    assert "language:TypeScript" in seen["user"]
    assert "上游垄断" in seen["user"]      # 对手的打法
    assert "主角" in seen["user"] and "对手 Boss" in seen["user"]


def test_partial_model_output_is_marked_mixed(monkeypatch) -> None:
    async def fake_call(*_a, **_k) -> str:
        return json.dumps({"scripts": [
            {"title": "《只写了一条》", "logline": "一条也算数。", "beats": ["开局", "中段", "收束"]},
        ]}, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    data = _scripts(LLM, RESEARCH)
    assert data["source"] == "mixed"
    assert len(data["scripts"]) == 3
    assert data["scripts"][0]["fallback"] is False
    assert all(item["fallback"] for item in data["scripts"][1:])
    assert "规则" in data["model_error"]


def test_quality_object_is_not_dumped_into_the_prompt(monkeypatch) -> None:
    """pet.quality 是 {key, name, color, glow} 对象，不是字符串。

    早先直接 f-string 进 prompt，模型读到的是一坨 Python 字典原文（带引号和颜色值），
    既浪费 token 又容易让模型把品质名写错。这里锁死成「传说(SSR)」这种可读写法。
    """
    seen: dict[str, str] = {}

    async def fake_call(_llm, _system, user, **_k) -> str:
        seen["user"] = user
        return json.dumps({"scripts": [
            {"title": "《x》", "logline": "y", "beats": ["a", "b", "c"]},
            {"title": "《z》", "logline": "y", "beats": ["a", "b", "c"]},
            {"title": "《w》", "logline": "y", "beats": ["a", "b", "c"]},
        ]}, ensure_ascii=False)

    monkeypatch.setattr(story, "_call_model", fake_call)
    pet = {"fullName": "demo/pet", "platform": "github", "level": 18,
           "quality": {"key": "SSR", "name": "传说", "color": "#ffb300", "glow": "rgba(255,179,0,.7)"}}
    asyncio.run(story.scripts(pet, BOSS_CARD, LLM, research=RESEARCH, mode="auto"))
    assert "传说(SSR)" in seen["user"]
    assert "{'key'" not in seen["user"]
    assert "#ffb300" not in seen["user"]


# ---------------------------------------------------------------- 建线：剧本要落库
# 三拍不落库，正片就只能拿到一句 logline —— 玩家选的剧本等于没选。

def test_create_run_persists_script_beats(tmp_dir, monkeypatch) -> None:
    from gitmon_api.db import db

    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-run.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    monkeypatch.setattr(story, "_SNAPSHOT_CACHE", {}, raising=False)
    monkeypatch.setattr(story, "boss_card", lambda *a, **k: {
        "full_name": "torvalds/linux", "cp": 60000, "stars": 180000, "language": "C",
        "tier": "SSR", "level": 150, "snapshot": None, "verdict": {},
    })

    pet = {
        "fullName": "demo/pet", "platform": "github", "aiEvaluated": True, "level": 18,
        "stats": [{"name": "HP", "value": 42}],
    }
    out = story.create_run(
        "owner-test", pet=pet, boss={"full_name": "torvalds/linux"},
        script={"title": "《三拍》", "logline": "一句话", "beats": ["开局", "中段", "收束"]},
        track="", rationale="", queries=[], selection_source="ai", seed=1,
        token="", llm_in=LLM,
    )
    assert out["run"]["script_beats"] == ["开局", "中段", "收束"]
    with db.connect() as conn:
        row = conn.execute("SELECT script_beats FROM story_runs WHERE id=?", (out["run"]["id"],)).fetchone()
    assert json.loads(row[0]) == ["开局", "中段", "收束"]


def test_create_run_records_the_script_source(tmp_dir, monkeypatch) -> None:
    """三种来源要能分清：模板不能被记成 ai，模型没写成也不能记成 ai。"""
    from gitmon_api.db import db

    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-src.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    monkeypatch.setattr(story, "_SNAPSHOT_CACHE", {}, raising=False)
    monkeypatch.setattr(story, "boss_card", lambda *a, **k: {
        "full_name": "torvalds/linux", "cp": 60000, "stars": 180000, "language": "C",
        "tier": "SSR", "level": 150, "snapshot": None, "verdict": {},
    })
    pet = {"fullName": "demo/pet", "platform": "github", "aiEvaluated": True, "level": 18,
           "stats": [{"name": "HP", "value": 42}]}

    def _run(source: str) -> str:
        # 一个 owner 同时只能有一条进行中的线，所以每次换个 owner
        out = story.create_run(
            f"owner-src-{source or 'none'}", pet=pet, boss={"full_name": "torvalds/linux"},
            script={"title": "《x》", "logline": "y", "beats": ["a", "b", "c"], "source": source},
            track="", rationale="", queries=[], selection_source="ai", seed=1,
            token="", llm_in=LLM,
        )
        with db.connect() as conn:
            row = conn.execute(
                "SELECT script_source FROM story_runs WHERE id=?", (out["run"]["id"],)
            ).fetchone()
        return row[0]

    assert _run("system") == "system"
    assert _run("manual") == "manual"
    assert _run("rule") == "rule"      # 模型没写成，如实记 rule
    assert _run("ai") == "ai"
    assert _run("") == "ai"            # 老数据没带来源，按 ai 处理
