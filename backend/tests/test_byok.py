"""BYOK 自动绑定：密钥解析、模型挑选、厂商探测与 /api/llm/bind（全程不联网）。"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from gitmon_api import byok, config, llm
from gitmon_api.main import create_app


KEY = "sk-unit-test-0123456789"


# ---------- 密钥输入解析 ----------

def test_parse_bare_key():
    assert byok.parse_key_input(f"  {KEY}  ") == (KEY, None)


def test_parse_env_lines_and_export_quotes():
    text = (
        "# 从 .env 复制过来的\n"
        "\n"
        f'export DEEPSEEK_API_KEY="{KEY}"\n'
        "OPENAI_API_KEY=sk-ignored\n"
    )
    assert byok.parse_key_input(text) == (KEY, "deepseek")


def test_parse_provider_equals_key():
    assert byok.parse_key_input(f"siliconflow={KEY}") == (KEY, "siliconflow")
    assert byok.parse_key_input(f"GROQ_API_KEY='{KEY}'") == (KEY, "groq")


def test_parse_unknown_var_still_uses_value():
    assert byok.parse_key_input(f"MY_OWN_TOKEN={KEY}") == (KEY, None)


def test_parse_empty_input_raises_friendly_error():
    with pytest.raises(llm.LLMError) as e:
        byok.parse_key_input("   \n# only a comment\n")
    assert "密钥" in e.value.message


# ---------- 模型挑选 ----------

def test_choose_model_prefers_fast_chat_models():
    models = ["text-embedding-3-small", "whisper-1", "gpt-4o", "gpt-4o-mini", "dall-e-3"]
    assert byok.choose_model(models) == "gpt-4o-mini"


def test_choose_model_avoids_legacy_completion_models():
    # 旧模型 id 更短，但不能靠长度取胜
    models = ["davinci", "babbage", "gpt-4o", "gpt-4o-mini"]
    assert byok.choose_model(models) == "gpt-4o-mini"


def test_choose_model_honors_existing_preferred():
    assert byok.choose_model(["qwen-plus", "qwen-turbo"], "qwen-plus") == "qwen-plus"


def test_choose_model_falls_back_when_only_embedding_models():
    assert byok.choose_model(["text-embedding-v2"], "fallback-model") == "text-embedding-v2"


def test_choose_model_empty_list_returns_preferred():
    assert byok.choose_model([], "fallback-model") == "fallback-model"


# ---------- 探测 / 绑定 ----------

def _models_resp(url: str, models: list[str]) -> httpx.Response:
    return httpx.Response(
        200, json={"data": [{"id": m} for m in models]},
        request=httpx.Request("GET", url),
    )


def _fake_http_request(routes: dict[str, list[str]], *, log: list[str] | None = None,
                       expect_key: str | None = None):
    """按 /models 地址分派假模型列表，patch 到 byok.http_request（全程不联网）。

    新版 detect 先经统一的 http_request 发请求、再由 _probe 解析响应，
    所以拦在 http_request：既断言带对了密钥，也让真实 _probe 走通。
    """
    bearer = f"Bearer {expect_key or KEY}"

    async def fake(method, url, **kwargs):
        assert kwargs["headers"]["Authorization"] == bearer
        if log is not None:
            log.append(url)
        for frag, models in routes.items():
            if frag in url:
                return _models_resp(url, models)
        return _models_resp(url, [])
    return fake


_DEEPSEEK_HTTP = _fake_http_request({
    "deepseek": ["deepseek-chat", "deepseek-reasoner", "text-embedding-v1"],
})


def test_detect_finds_provider_from_models(monkeypatch):
    monkeypatch.setattr(byok, "http_request", _DEEPSEEK_HTTP)
    out = asyncio.run(byok.detect(KEY))
    assert out["provider"] == "deepseek"
    assert out["label"] == "DeepSeek"
    assert out["model"] == "deepseek-chat"
    assert out["verified"] is True and out["detectedBy"] == "models"


def test_detect_with_explicit_provider_only_probes_that_one(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(byok, "http_request", _fake_http_request(
        {"openai": ["gpt-4o-mini"]}, log=seen,
    ))
    out = asyncio.run(byok.detect(KEY, provider="openai"))
    assert seen == ["https://api.openai.com/v1/models"]
    assert out["provider"] == "openai"


def test_detect_unknown_key_raises_actionable_error(monkeypatch):
    monkeypatch.setattr(byok, "http_request", _fake_http_request({}))
    with pytest.raises(llm.LLMError) as e:
        asyncio.run(byok.detect(KEY))
    assert "没能自动认出" in e.value.message
    assert "自定义端点" in e.value.hint


def test_detect_custom_endpoint_does_not_probe_other_providers(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(byok, "http_request", _fake_http_request({}, log=seen))
    out = asyncio.run(byok.bind(f"deepseek={KEY}", custom={
        "baseUrl": "http://127.0.0.1:11434/v1", "label": "本地 Ollama", "model": "qwen2.5:7b",
    }))
    assert seen == ["http://127.0.0.1:11434/v1/models"]
    assert out["provider"] == "custom"
    assert out["model"] == "qwen2.5:7b"
    assert out["label"] == "本地 Ollama"


def test_detect_custom_endpoint_without_model_or_models_fails(monkeypatch):
    monkeypatch.setattr(byok, "http_request", _fake_http_request({}))
    with pytest.raises(llm.LLMError):
        asyncio.run(byok.detect(KEY, custom={"baseUrl": "http://127.0.0.1:11434/v1"}))


def test_detect_rejects_invalid_custom_url():
    with pytest.raises(llm.LLMError):
        asyncio.run(byok.detect(KEY, custom={"baseUrl": "file:///etc/passwd", "model": "x"}))


def test_detect_public_endpoint_cannot_bind_when_prefix_mismatch(monkeypatch):
    """OpenRouter /models 无需鉴权、列表恒非空：不得把「别家 key + openai 探测瞬时失败」
    假阳性绑成 OpenRouter（这是「服务商与密钥乱匹配」的上游源头）。"""
    seen: list[str] = []
    # openai 端点返回空（模拟瞬时失败/401），只有 openrouter 公开端点给列表
    monkeypatch.setattr(byok, "http_request", _fake_http_request(
        {"openrouter": ["openai/gpt-4o-mini"]}, log=seen,
    ))
    with pytest.raises(llm.LLMError) as e:
        asyncio.run(byok.detect(KEY))
    assert "没能自动认出" in e.value.message
    assert not any("openrouter" in u for u in seen), "前缀不吻合时不得探测公开端点"


def test_detect_public_endpoint_kept_for_matching_prefix(monkeypatch):
    """sk-or- 前缀的真 OpenRouter 密钥：公开端点照常探测并命中。"""
    seen: list[str] = []
    monkeypatch.setattr(byok, "http_request", _fake_http_request(
        {"openrouter": ["openai/gpt-4o-mini"]}, log=seen,
        expect_key="sk-or-v1-unit-test-key-000",
    ))
    out = asyncio.run(byok.detect("sk-or-v1-unit-test-key-000"))
    assert out["provider"] == "openrouter"
    assert any("openrouter" in u for u in seen)


def test_bind_parses_env_snippet(monkeypatch):
    monkeypatch.setattr(byok, "http_request", _DEEPSEEK_HTTP)
    out = asyncio.run(byok.bind(f"# .env\nexport DEEPSEEK_API_KEY={KEY}\n"))
    assert out["provider"] == "deepseek"


# ---------- API ----------

@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    settings.ensure_dirs()
    return TestClient(create_app(settings, start_queue=False))


def test_api_config_lists_providers(client):
    ids = [p["id"] for p in client.get("/api/llm/config").json()["providers"]]
    assert "openai" in ids and "deepseek" in ids and "hunyuan" in ids


def test_api_bind_returns_provider_and_never_echoes_key(client, monkeypatch):
    monkeypatch.setattr(byok, "http_request", _DEEPSEEK_HTTP)
    resp = client.post("/api/llm/bind", json={"apiKey": KEY})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == "deepseek"
    assert body["model"] == "deepseek-chat"
    assert KEY not in resp.text


def test_api_bind_translates_detection_failure(client, monkeypatch):
    monkeypatch.setattr(byok, "http_request", _fake_http_request({}))
    resp = client.post("/api/llm/bind", json={"apiKey": KEY})
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "没能自动认出这枚密钥属于哪家厂商"
    assert KEY not in resp.text


def test_api_bind_rejects_empty_key(client):
    resp = client.post("/api/llm/bind", json={"apiKey": ""})
    assert resp.status_code == 422
