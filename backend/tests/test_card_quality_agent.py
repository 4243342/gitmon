"""Offline review request, bounds, and cache checks."""

from concurrent.futures import ThreadPoolExecutor
import json
import threading

import httpx
import pytest

from conftest import make_snapshot
from gitmon_api import card_quality, card_quality_agent, card_ratings, purpose_agent
from gitmon_api.card_quality import Check
from gitmon_api.db import Database


@pytest.fixture
def evidence():
    return {
        "revision": "a" * 40,
        "sources": {"src/main.py": "def render(value):\n    if value is None:\n        raise ValueError('missing value')"},
        "readme_path": "README.md",
        "readme": "Run the tool with an input argument.",
    }


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_url", "https://example.com/v1/chat/completions")
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_model", "test-reviewer")
    monkeypatch.setattr(purpose_agent.settings, "purpose_agent_allow_private", False)


def test_review_budget_and_references(configured, evidence, monkeypatch):
    checks = [
        Check("errors", "source", 15, None, ("src/main.py",), "Is missing input handled?"),
        Check("docs", "docs", 10, None, ("README.md",), "Does the usage clarify inputs?"),
        Check("unknown", "test", 8, None, ("missing.py",), "Are tests available?"),
    ]
    plan = card_quality_agent.prepare(evidence, checks, private=False)
    assert plan is not None
    assert card_quality_agent.prepare(evidence, checks, private=True) is None
    messages = plan.payload["messages"]
    assert sum(len(item["content"].encode()) for item in messages) <= 1050
    assert plan.payload["max_tokens"] == 120 and "tools" not in plan.payload
    assert len(json.loads(messages[1]["content"])["e"]) <= 3
    assert plan.check_ids == ("errors", "docs")

    monkeypatch.setattr(purpose_agent, "request_json", lambda *_: {
        "r": [[0, True, 0, "raise ValueError('missing value')"], [1, False, 0, "raise ValueError('missing value')"]],
    })
    assert card_quality_agent.review(plan) == {"errors": True}
    monkeypatch.setattr(purpose_agent, "request_json", lambda *_: {"r": [[0, True, 0, "invented quotation"]]})
    assert card_quality_agent.review(plan) == {}


def test_only_unresolved_ranks_review_and_share_version_cache(configured, evidence, tmp_dir, monkeypatch):
    monkeypatch.setattr(card_ratings, "db", Database(tmp_dir / "quality.sqlite"))
    monkeypatch.setattr(card_quality, "checks", lambda _: [
        Check("source", "source", 65, 65, (), ""),
        Check("errors", "source", 35, None, ("src/main.py",), "Is missing input handled?"),
    ])
    calls = []

    def request(endpoint, payload):
        assert endpoint == httpx.URL("https://example.com/v1/chat/completions")
        calls.append(payload)
        return {"r": [[0, True, 0, "raise ValueError('missing value')"]]}

    monkeypatch.setattr(purpose_agent, "request_json", request)
    snapshot = make_snapshot(repo_id="333", stars=0, forks=0, quality_evidence=evidence)
    start = threading.Barrier(2)

    def evaluate():
        start.wait(timeout=2)
        return card_ratings.evaluate(snapshot)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(evaluate)
        second = executor.submit(evaluate)
        assert first.result(timeout=4) == second.result(timeout=4)
    assert card_ratings.evaluate(snapshot)["qualityRating"]["key"] == "platinum"
    assert len(calls) == 1
    snapshot.quality_evidence = {**evidence, "revision": "b" * 40}
    assert card_ratings.evaluate(snapshot)["qualityRating"]["key"] == "platinum"
    assert len(calls) == 2

    monkeypatch.setattr(card_quality, "checks", lambda _: [
        Check("source", "source", 90, 90, (), ""),
        Check("errors", "source", 10, None, ("src/main.py",), "Is missing input handled?"),
    ])
    snapshot.quality_evidence = {**evidence, "revision": "c" * 40}
    assert card_ratings.evaluate(snapshot)["qualityRating"]["key"] == "platinum"
    assert len(calls) == 2
