"""高级模式：模型评测代理的纯函数与 API 测试（全程不联网）。"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, llm
from gitmon_api.main import create_app

GOOD_EVAL = {
    "owner": "facebook",
    "repo": "react",
    "summary": "前端 UI 库",
    "element": "thunder",
    "elementSecondary": None,
    "species": "beast",
    "quality": "SSR",
    "qualityScore": 91,
    "qualityDims": [90, 88, 85, 92, 95],
    "engineeringScore": 88,
    "level": 909,
    "stats": [92, 96, 100, 85, 83, 100],
    "foundation": 76,
    "traits": [{"name": "文档洁癖", "kind": "positive", "desc": "文档和代码一起长", "reason": "文档齐全"}],
    "skills": [
        {"name": "虚拟 DOM 重构", "element": "thunder", "power": 88, "unlockLevel": 12,
         "desc": "用 Fiber 架构把渲染拆成可中断任务", "reason": "React 以 Fiber 调度为核心"},
        {"name": "Hooks 连锁", "element": "thunder", "power": 82, "unlockLevel": 45,
         "desc": "把状态逻辑挂进函数组件的钩子链", "reason": "Hooks 是 React 的招牌能力"},
        {"name": "SSR 洪流", "element": "water", "power": 76, "unlockLevel": 110,
         "desc": "服务端流式渲染首屏", "reason": "生态里有成熟的 SSR 方案"},
        {"name": "生态同调", "element": "steel", "power": 95, "unlockLevel": 220,
         "desc": "调用庞大第三方生态协同作战", "reason": "社区规模极大"},
    ],
    "stars": 232000,
    "aiRate": 18,
    "comment": "生态里的常青树",
    "evidence": "长期高活跃、社区庞大",
}


def test_parse_model_json_accepts_code_fence_and_prose():
    wrapped = '这是评测结果：\n```json\n' + json.dumps(GOOD_EVAL, ensure_ascii=False) + '\n```\n以上。'
    assert llm.parse_model_json(wrapped)["repo"] == "react"
    with pytest.raises(llm.LLMError):
        llm.parse_model_json("not json at all")
    with pytest.raises(llm.LLMError):
        llm.parse_model_json("")


def test_normalize_keeps_model_scores_and_records_fallbacks():
    out, warnings = llm.normalize_evaluation(GOOD_EVAL)
    assert out["qualityScore"] == 91 and out["stats"][2] == 100
    assert out["traits"][0]["kind"] == "positive"
    assert warnings == []

    bad = dict(GOOD_EVAL, element="plasma", species="alien", quality="?", stats=[999, -3], qualityDims=[10])
    fixed, warnings = llm.normalize_evaluation(bad)
    assert fixed["element"] == "normal" and fixed["species"] == "beast"
    assert fixed["quality"] == "SSR"  # 按 91 分归档
    assert fixed["stats"] == [100, 0, 50, 50, 50, 50]
    assert len(fixed["qualityDims"]) == 5
    assert any("兜底" in w for w in warnings)


def test_normalize_clamps_traits_and_skills():
    raw = dict(GOOD_EVAL, traits=[{"name": "T" * 80, "kind": "weird"}] * 9, skills=["S" * 60] * 9)
    out, warnings = llm.normalize_evaluation(raw)
    assert len(out["traits"]) == 4 and len(out["traits"][0]["name"]) <= 16
    assert out["traits"][0]["kind"] == "positive"
    assert len(out["skills"]) == 4 and len(out["skills"][0]["name"]) <= 24
    # 旧格式（只有名字）绝不代填等级 / 威力，并如实记录
    assert out["skills"][0]["unlockLevel"] is None and out["skills"][0]["power"] is None
    assert any("只给了技能名" in w for w in warnings)


def test_skills_are_fully_authored_by_model():
    """技能的名字 / 属性 / 威力 / 解锁等级 / 描述全部来自模型，不套本地门槛表。"""
    out, warnings = llm.normalize_evaluation(GOOD_EVAL)
    assert warnings == []
    assert [s["unlockLevel"] for s in out["skills"]] == [12, 45, 110, 220]
    assert [s["power"] for s in out["skills"]] == [88, 82, 76, 95]
    assert out["skills"][0]["desc"].startswith("用 Fiber")
    assert out["skills"][2]["element"] == "water"
    assert "不要套用通用技能模板" in llm.SYSTEM_PROMPT
    assert "1/1/150/500" in llm.SYSTEM_PROMPT
    assert "unlockLevel" in llm.SYSTEM_PROMPT


def test_skill_fields_are_clamped_not_rescored():
    bad = dict(GOOD_EVAL, skills=[
        {"name": "越界技能", "element": "plasma", "power": 999, "unlockLevel": -8,
         "desc": "D" * 200, "reason": "R" * 200},
    ])
    out, warnings = llm.normalize_evaluation(bad)
    s = out["skills"][0]
    assert s["element"] == "thunder"  # 回退到模型给的主属性，不额外评测
    assert s["power"] == 100 and s["unlockLevel"] == 1
    assert len(s["desc"]) <= 80 and len(s["reason"]) <= 80
    assert any("技能只给了 1 个" in w for w in warnings)


def test_prompt_contains_level_calibration():
    """等级锚点是用户明确要求的：Dify 120 / Odoo 150，别让提示词被改回去。"""
    assert "Dify 取 Lv.120" in llm.SYSTEM_PROMPT
    assert "Odoo 取 Lv.150" in llm.SYSTEM_PROMPT
    assert "不是 star 数" in llm.SYSTEM_PROMPT
    assert "不要超过 Lv.160" in llm.SYSTEM_PROMPT


def test_base_url_validation():
    assert llm.validate_base_url("http://127.0.0.1:11434/v1/") == "http://127.0.0.1:11434/v1"
    with pytest.raises(llm.LLMError):
        llm.validate_base_url("file:///etc/passwd")


def test_evaluate_repo_uses_model_only_and_never_leaks_key(monkeypatch):
    seen = {}

    async def fake_chat(**kwargs):
        seen.update(kwargs)
        return json.dumps(GOOD_EVAL, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", fake_chat)
    result = asyncio.run(llm.evaluate_repo(
        repo="facebook/react", base_url="https://api.openai.com/v1",
        api_key="sk-super-secret", model="demo-model", hint="这是前端库",
    ))
    assert result["meta"]["engine"] == "none"
    assert result["evaluation"]["qualityScore"] == 91
    assert "这是前端库" in seen["user"]
    assert "sk-super-secret" not in json.dumps(result, ensure_ascii=False)
    assert seen["model"] == "demo-model"


def test_prompt_contains_evidence_priority_rule():
    """证据优先规则是深度审计的定稿要求：真实抓取 > 模型记忆，别让提示词被改回去。"""
    assert "优先于你的记忆与推测" in llm.SYSTEM_PROMPT
    assert "没有附带证据时" in llm.SYSTEM_PROMPT
    assert "{evidence_block}" in llm.USER_TEMPLATE


def test_evaluate_repo_injects_evidence_and_keeps_pure_guess_mode(monkeypatch):
    seen = {}

    async def fake_chat(**kwargs):
        seen.update(kwargs)
        return json.dumps(GOOD_EVAL, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", fake_chat)
    asyncio.run(llm.evaluate_repo(
        repo="facebook/react", base_url="https://api.openai.com/v1",
        api_key="sk-x", model="demo-model",
        evidence={"languages": {"TypeScript": 68.2}, "scale": {"commits": 180000}},
    ))
    assert "真实审计证据" in seen["user"] and "180000" in seen["user"]
    # 不带证据 → 回到纯推测模式，提示词里不出现证据块（向后兼容）
    asyncio.run(llm.evaluate_repo(
        repo="facebook/react", base_url="https://api.openai.com/v1",
        api_key="sk-x", model="demo-model",
    ))
    assert "真实审计证据" not in seen["user"]


def test_api_evaluate_accepts_evidence_and_rejects_oversized(client, monkeypatch):
    seen = {}

    async def fake_chat(**kwargs):
        seen.update(kwargs)
        return json.dumps(GOOD_EVAL, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", fake_chat)
    resp = client.post("/api/llm/evaluate", json={
        "repo": "facebook/react", "model": "m",
        "evidence": {"languages": {"TypeScript": 68.2}},
    })
    assert resp.status_code == 200, resp.text
    assert "真实审计证据" in seen["user"]
    # 超 8KB 的证据直接 422 打回，防提示词膨胀
    resp = client.post("/api/llm/evaluate", json={
        "repo": "facebook/react", "model": "m",
        "evidence": {"readmeHead": "x" * 9000},
    })
    assert resp.status_code == 422


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    settings.ensure_dirs()
    return TestClient(create_app(settings, start_queue=False))


def test_api_config_lists_enums(client):
    body = client.get("/api/llm/config").json()
    assert "thunder" in body["elements"] and "beast" in body["species"]
    assert body["statNames"] == ["攻击", "防御", "速度", "特攻", "特防", "HP"]


def test_api_evaluate_returns_model_evaluation(client, monkeypatch):
    async def fake_chat(**kwargs):
        return json.dumps(GOOD_EVAL, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", fake_chat)
    resp = client.post("/api/llm/evaluate", json={
        "repo": "facebook/react", "model": "demo-model", "apiKey": "sk-super-secret",
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["evaluation"]["quality"] == "SSR"
    assert body["evaluation"]["skills"][0]["unlockLevel"] == 12  # 模型给的门槛原样透传
    assert body["meta"]["engine"] == "none"
    assert "sk-super-secret" not in resp.text


def test_api_evaluate_translates_model_errors(client, monkeypatch):
    async def fake_chat(**kwargs):
        raise llm.LLMError("API Key 无效或没有权限", "检查密钥")

    monkeypatch.setattr(llm, "chat_completion", fake_chat)
    resp = client.post("/api/llm/evaluate", json={"repo": "acme/widget", "model": "m"})
    assert resp.status_code == 502
    assert resp.json()["detail"]["error"] == "API Key 无效或没有权限"


def test_api_ping_success_returns_latency(client, monkeypatch):
    async def fake_ping(**kwargs):
        return {"ok": True, "model": kwargs["model"], "latencyMs": 123}

    monkeypatch.setattr(llm, "ping", fake_ping)
    resp = client.post("/api/llm/ping", json={"model": "demo-model", "apiKey": "sk-test-secret"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True, "model": "demo-model", "latencyMs": 123}
    assert "sk-test-secret" not in resp.text


def test_api_ping_translates_connection_errors(client, monkeypatch):
    async def fake_ping(**kwargs):
        raise llm.LLMError("连不上模型接口", "检查 Base URL、网络代理；本地模型请确认服务已启动")

    monkeypatch.setattr(llm, "ping", fake_ping)
    resp = client.post("/api/llm/ping", json={"model": "m"})
    assert resp.status_code == 502
    assert resp.json()["detail"]["error"] == "连不上模型接口"


def _mock_401(monkeypatch):
    async def fake_request(method, url, **kwargs):
        return httpx.Response(401, request=httpx.Request(method, url))

    monkeypatch.setattr(llm, "http_request", fake_request)


def test_ping_401_names_provider_key_mismatch(monkeypatch):
    """服务商与密钥家族错配时，401 的 hint 要点名双方（OpenRouter ≠ OpenAI）。"""
    _mock_401(monkeypatch)
    with pytest.raises(llm.LLMError) as exc:
        asyncio.run(llm.ping(
            base_url="https://openrouter.ai/api/v1",
            api_key="sk-proj-abc123", model="m",
        ))
    assert exc.value.message == "API Key 无效或没有权限"
    assert "OpenRouter" in exc.value.hint and "OpenAI" in exc.value.hint
    assert "不匹配" in exc.value.hint or "不通用" in exc.value.hint


def test_ping_401_without_mismatch_keeps_generic_hint(monkeypatch):
    """识别不了错配（如普通 sk- 密钥）时保持原有通用提示。"""
    _mock_401(monkeypatch)
    with pytest.raises(llm.LLMError) as exc:
        asyncio.run(llm.ping(base_url="https://api.openai.com/v1", api_key="sk-short", model="m"))
    assert exc.value.hint == "检查密钥，或换个模型服务商"


def test_chat_completion_401_reports_mismatch(monkeypatch):
    """评测主链路（chat/completions）的 401 同样点破错配。"""
    _mock_401(monkeypatch)
    with pytest.raises(llm.LLMError) as exc:
        asyncio.run(llm.chat_completion(
            base_url="https://openrouter.ai/api/v1",
            api_key="gsk_abc123", model="m", system="s", user="u",
        ))
    assert "OpenRouter" in exc.value.hint and "Groq" in exc.value.hint


def _mock_max_tokens_400_then_ok(monkeypatch):
    """首发 max_tokens 被 400 点名换键，重发 max_completion_tokens 后成功。"""
    seen: list[dict] = []

    async def fake_request(method, url, **kwargs):
        body = kwargs["json_body"]
        seen.append(dict(body))  # 快照：chat_completion 会就地改 payload
        if "max_tokens" in body:
            return httpx.Response(
                400,
                json={"error": {"message": (
                    "Unsupported parameter: 'max_tokens' is not supported with this model. "
                    "Use 'max_completion_tokens' instead."
                )}},
                request=httpx.Request(method, url),
            )
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "pong/ok"}}]},
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(llm, "http_request", fake_request)
    return seen


def test_chat_completion_retries_with_max_completion_tokens(monkeypatch):
    """推理系模型（o 系 / gpt-5）拒收 max_tokens → 自动换 max_completion_tokens 重发成功。"""
    seen = _mock_max_tokens_400_then_ok(monkeypatch)
    out = asyncio.run(llm.chat_completion(
        base_url="https://api.openai.com/v1", api_key="sk-x", model="m", system="s", user="u",
    ))
    assert out == "pong/ok"
    assert len(seen) == 2
    assert "max_tokens" in seen[0] and "max_completion_tokens" not in seen[0]
    assert seen[1].get("max_completion_tokens") == 2200 and "max_tokens" not in seen[1]


def test_ping_retries_with_max_completion_tokens(monkeypatch):
    """绑定前的连接测试同样换键重发，不再被这个 400 挡在高级模式门外。"""
    seen = _mock_max_tokens_400_then_ok(monkeypatch)
    result = asyncio.run(llm.ping(
        base_url="https://api.openai.com/v1", api_key="sk-x", model="m",
    ))
    assert result["ok"] is True
    assert len(seen) == 2
    assert seen[1].get("max_completion_tokens") == 8 and "max_tokens" not in seen[1]


def test_chat_completion_400_without_keyword_does_not_retry(monkeypatch):
    """与换键无关的 400 不触发重发，照常点破错误详情。"""
    calls = []

    async def fake_request(method, url, **kwargs):
        calls.append(dict(kwargs["json_body"]))
        return httpx.Response(
            400, json={"error": {"message": "context length exceeded"}},
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(llm, "http_request", fake_request)
    with pytest.raises(llm.LLMError) as exc:
        asyncio.run(llm.chat_completion(
            base_url="https://api.openai.com/v1", api_key="sk-x", model="m", system="s", user="u",
        ))
    assert len(calls) == 1
    assert "HTTP 400" in exc.value.message


def test_chat_completion_drops_temperature_on_400(monkeypatch):
    """temperature 只支持默认值 1 的模型 → 删掉该键重发成功。"""
    seen: list[dict] = []

    async def fake_request(method, url, **kwargs):
        body = kwargs["json_body"]
        seen.append(dict(body))
        if "temperature" in body:
            return httpx.Response(
                400,
                json={"error": {"message": (
                    "Unsupported value: 'temperature' does not support 0.7 with this model. "
                    "Only the default (1) value is supported."
                )}},
                request=httpx.Request(method, url),
            )
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "ok"}}]},
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(llm, "http_request", fake_request)
    out = asyncio.run(llm.chat_completion(
        base_url="https://api.openai.com/v1", api_key="sk-x", model="m", system="s", user="u",
    ))
    assert out == "ok"
    assert len(seen) == 2
    assert "temperature" in seen[0] and "temperature" not in seen[1]
    assert seen[1]["max_tokens"] == 2200  # 只删 temperature，max_tokens 保留


def test_chat_completion_fixes_both_400s_in_sequence(monkeypatch):
    """max_tokens 与 temperature 两个 400 依次出现时逐个修，最终成功。"""
    seen: list[dict] = []

    async def fake_request(method, url, **kwargs):
        body = kwargs["json_body"]
        seen.append(dict(body))
        if "max_tokens" in body:
            return httpx.Response(
                400, json={"error": {"message": "Use 'max_completion_tokens' instead."}},
                request=httpx.Request(method, url),
            )
        if "temperature" in body:
            return httpx.Response(
                400, json={"error": {"message": "'temperature' does not support 0.7"}},
                request=httpx.Request(method, url),
            )
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "ok"}}]},
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(llm, "http_request", fake_request)
    out = asyncio.run(llm.chat_completion(
        base_url="https://api.openai.com/v1", api_key="sk-x", model="m", system="s", user="u",
    ))
    assert out == "ok"
    assert len(seen) == 3
    assert "max_tokens" in seen[0] and "temperature" in seen[0]
    assert "max_completion_tokens" in seen[1] and "temperature" in seen[1]
    assert "max_completion_tokens" in seen[2] and "temperature" not in seen[2]
