"""BYOK 自动绑定：密钥解析、模型挑选、厂商探测与 /api/llm/bind（全程不联网）。"""

from __future__ import annotations

import asyncio

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

async def _fake_probe(client, base_url, api_key):
    assert api_key == KEY
    if "deepseek" in base_url:
        return ["deepseek-chat", "deepseek-reasoner", "text-embedding-v1"]
    return []


def test_detect_finds_provider_from_models(monkeypatch):
    monkeypatch.setattr(byok, "_probe", _fake_probe)
    out = asyncio.run(byok.detect(KEY))
    assert out["provider"] == "deepseek"
    assert out["label"] == "DeepSeek"
    assert out["model"] == "deepseek-chat"
    assert out["verified"] is True and out["detectedBy"] == "models"


def test_detect_with_explicit_provider_only_probes_that_one(monkeypatch):
    seen = []

    async def probe(client, base_url, api_key):
        seen.append(base_url)
        return ["gpt-4o-mini"]

    monkeypatch.setattr(byok, "_probe", probe)
    out = asyncio.run(byok.detect(KEY, provider="openai"))
    assert seen == ["https://api.openai.com/v1"]
    assert out["provider"] == "openai"


def test_detect_unknown_key_raises_actionable_error(monkeypatch):
    async def probe(client, base_url, api_key):
        return []

    monkeypatch.setattr(byok, "_probe", probe)
    with pytest.raises(llm.LLMError) as e:
        asyncio.run(byok.detect(KEY))
    assert "没能自动认出" in e.value.message
    assert "自定义端点" in e.value.hint


def test_detect_custom_endpoint_does_not_probe_other_providers(monkeypatch):
    seen = []

    async def probe(client, base_url, api_key):
        seen.append(base_url)
        return []

    monkeypatch.setattr(byok, "_probe", probe)
    out = asyncio.run(byok.bind(f"deepseek={KEY}", custom={
        "baseUrl": "http://127.0.0.1:11434/v1", "label": "本地 Ollama", "model": "qwen2.5:7b",
    }))
    assert seen == ["http://127.0.0.1:11434/v1"]
    assert out["provider"] == "custom"
    assert out["model"] == "qwen2.5:7b"
    assert out["label"] == "本地 Ollama"


def test_detect_custom_endpoint_without_model_or_models_fails(monkeypatch):
    async def probe(client, base_url, api_key):
        return []

    monkeypatch.setattr(byok, "_probe", probe)
    with pytest.raises(llm.LLMError):
        asyncio.run(byok.detect(KEY, custom={"baseUrl": "http://127.0.0.1:11434/v1"}))


def test_detect_rejects_invalid_custom_url():
    with pytest.raises(llm.LLMError):
        asyncio.run(byok.detect(KEY, custom={"baseUrl": "file:///etc/passwd", "model": "x"}))


def test_bind_parses_env_snippet(monkeypatch):
    monkeypatch.setattr(byok, "_probe", _fake_probe)
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
    monkeypatch.setattr(byok, "_probe", _fake_probe)
    resp = client.post("/api/llm/bind", json={"apiKey": KEY})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == "deepseek"
    assert body["model"] == "deepseek-chat"
    assert KEY not in resp.text


def test_api_bind_translates_detection_failure(client, monkeypatch):
    async def probe(client_, base_url, api_key):
        return []

    monkeypatch.setattr(byok, "_probe", probe)
    resp = client.post("/api/llm/bind", json={"apiKey": KEY})
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "没能自动认出这枚密钥属于哪家厂商"
    assert KEY not in resp.text


def test_api_bind_rejects_empty_key(client):
    resp = client.post("/api/llm/bind", json={"apiKey": ""})
    assert resp.status_code == 422
