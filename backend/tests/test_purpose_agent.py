"""只有可依据仓库原文核验的 agent 复核结果才能固定属性。"""

from __future__ import annotations

import json

import httpx
import pytest

from gitmon_api import purpose_agent


@pytest.fixture
def evidence() -> dict:
    return {
        "description": "Operations tooling",
        "language": "Go",
        "readme": "Send an alert when a service fails a health check.",
        "artifacts": {"release:ops-agent": "Provides a service monitor."},
        "sources": {"cmd/ops/main.go": "scheduleServiceChecksAndDeliverAlerts()"},
    }


@pytest.fixture
def configured(monkeypatch) -> None:
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_url", "https://example.com/v1/chat/completions")
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_model", "fixture-model")
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_key", "fixture-key")
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_allow_private", False)


def _outcome() -> dict:
    return {
        "attribute": "purpose_fire",
        "evidence": [
            {"id": "readme", "quote": "Send an alert when a service fails a health check."},
            {"id": "source-1", "quote": "scheduleServiceChecksAndDeliverAlerts()"},
        ],
    }


def test_purpose_agent_openai_compatible_http_contract(configured, evidence, monkeypatch) -> None:
    client_type = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://example.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer fixture-key"
        payload = json.loads(request.content)
        assert payload["model"] == "fixture-model"
        assert "tools" not in payload
        assert payload["messages"][0]["role"] == "system"
        user_data = json.loads(payload["messages"][1]["content"])
        assert user_data["evidence"]["source-1"]["path"] == "cmd/ops/main.go"
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(_outcome())}}]})

    def client(**kwargs) -> httpx.Client:
        return client_type(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(purpose_agent.httpx, "Client", client)
    assert purpose_agent.classify(evidence, private=False) == "purpose_fire"


def test_purpose_agent_skips_disabled_private_and_insufficient_inputs(configured, evidence, monkeypatch) -> None:
    def unexpected(*_args) -> None:
        raise AssertionError("agent should not have been called")

    monkeypatch.setattr(purpose_agent, "_request", unexpected)
    assert purpose_agent.classify(evidence, private=True) is None
    assert purpose_agent.classify({"readme": evidence["readme"]}, private=False) is None
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_url", "http://example.com/v1/chat/completions")
    assert purpose_agent.classify(evidence, private=False) is None
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_url", "")
    assert purpose_agent.classify(evidence, private=False) is None


def test_purpose_agent_private_opt_in_and_timeout(configured, evidence, monkeypatch) -> None:
    def timeout(*_args) -> None:
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_allow_private", True)
    monkeypatch.setattr(purpose_agent, "_request", lambda *_args: _outcome())
    assert purpose_agent.classify(evidence, private=True) == "purpose_fire"
    monkeypatch.setattr(purpose_agent, "_request", timeout)
    assert purpose_agent.classify(evidence, private=True) is None


@pytest.mark.parametrize(("key", "value"), [
    ("attribute", "purpose_pending"),
    ("evidence", [{"id": "readme", "quote": "Fake quote to change the attribute."}]),
    ("evidence", [
        {"id": "readme", "quote": "Send an alert"},
        {"id": "source-1", "quote": "Fake quote to change the attribute."},
    ]),
    ("evidence", [
        {"id": "readme", "quote": "Send an alert"},
        {"id": "readme", "quote": "when a service fails a health check"},
    ]),
])
def test_purpose_agent_rejects_invalid_citations(configured, evidence, monkeypatch, key, value) -> None:
    result = _outcome()
    result[key] = value
    monkeypatch.setattr(purpose_agent, "_request", lambda *_args: result)
    assert purpose_agent.classify(evidence, private=False) is None


def test_purpose_agent_rejects_oversized_http_response(configured, evidence, monkeypatch) -> None:
    client_type = httpx.Client
    content = json.dumps({
        "choices": [{"message": {"content": json.dumps(_outcome())}}],
        "padding": "x" * purpose_agent._RESPONSE_BYTES,
    }).encode()
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, content=content))
    monkeypatch.setattr(purpose_agent.httpx, "Client", lambda **kwargs: client_type(transport=transport, **kwargs))

    assert purpose_agent.classify(evidence, private=False) is None
