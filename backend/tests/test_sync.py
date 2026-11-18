"""SSOT 契约同步：PUT 批量 upsert、client_state round-trip 与 owner_key 归属优先级。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from gitmon_api import api, auth, config, services
from gitmon_api.main import create_app

DEVICE = {"X-Gitmon-User": "device1"}


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    monkeypatch.setattr(settings, "cache_ttl", 21600)
    settings.ensure_dirs()
    app = create_app(start_queue=False)
    with TestClient(app) as test_client:
        yield test_client


def frontend_pet(**overrides) -> dict:
    """完整前端 pet 对象：engine.judge 产物 + 运行时字段（契约 §3 入站形态）。"""
    pet = {
        "id": "local-legacy-id",
        "platform": "github",
        "owner": "acme",
        "repo": "widget",
        "fullName": "acme/widget",
        "seed": 1234,
        "spriteSeed": 99,
        "element": {"key": "thunder", "name": "雷", "color": "#f5c542", "trait": "敏捷爆发"},
        "elementSecondary": None,
        "species": {"key": "beast", "name": "兽型", "type": "Web 应用", "body": "biped"},
        "quality": {"key": "SR", "name": "史诗", "color": "#ab47bc", "glow": True},
        "qualityKey": "SR",
        "qualityScore": 77.5,
        "qualityDims": {"code": 80},
        "engineeringScore": 55.5,
        "level": 5,
        "exp": 40,
        "expToNext": 60,
        "evolutionStage": 1,
        "evolutionStageName": "幼体",
        "stats": [{"key": "atk", "value": 12}],
        "skills": [{"key": "slash", "name": "斩击"}],
        "hp": 300,
        "foundation": 41.2,
        "foundationTier": {"key": "bronze", "name": "青铜", "min": 30},
        "foundationDims": {"test": 60},
        "traits": [{"key": "neat", "name": "干净", "kind": "positive", "desc": "", "reason": "", "effect": {"expPct": 5}}],
        "traitSummary": "干净",
        "aiRate": 0.9,
        "bond": 2,
        "battles": 0,
        "wins": 0,
        "status": "active",
        "description": "描述",
        "createdAt": "1999-01-01T00:00:00+00:00",
        "syncedAt": "1999-01-01T00:00:00+00:00",
        "metrics": {"stars": 10},
        "notes": ["note"],
        "degraded": False,
        "spriteUrl": "/api/pets/local-legacy-id/sprite.png",
        "htmlUrl": "https://github.com/acme/widget",
        # 不在列映射表里的字段 → client_state 原样 round-trip
        "ivs": {"hp": 15, "atk": 12},
        "baseStats": {"hp": 40},
        "combatPower": 4321,
        "statCap": 99,
        "maxHp": 500,
        "milestones": [{"at": 3}],
        "source": "local",
        "aiEvaluated": True,
    }
    pet.update(overrides)
    return pet


def test_put_upserts_new_then_updates(client: TestClient) -> None:
    created_body = client.put("/api/pets", json={"items": [frontend_pet()]}, headers=DEVICE).json()
    assert created_body["saved"] == 1
    assert len(created_body["items"]) == 1
    created = created_body["items"][0]
    assert created["fullName"] == "acme/widget"
    assert created["owner"] == "acme" and created["repo"] == "widget"
    assert created["level"] == 5
    assert created["battles"] == 0 and created["wins"] == 0
    assert created["createdAt"] != "1999-01-01T00:00:00+00:00"  # created_at 由服务端计算

    updated_body = client.put(
        "/api/pets",
        json={"items": [frontend_pet(level=9, exp=12, bond=7, battles=3, wins=2)]},
        headers=DEVICE,
    ).json()
    assert updated_body["saved"] == 1
    updated = updated_body["items"][0]
    assert updated["id"] == created["id"]
    assert (updated["level"], updated["exp"], updated["bond"]) == (9, 12, 7)
    assert (updated["battles"], updated["wins"]) == (3, 2)

    listing = client.get("/api/pets?limit=200", headers=DEVICE).json()
    assert listing["count"] == 1  # 更新不产生新行
    assert listing["items"][0]["level"] == 9


def test_put_returns_server_authoritative_version(client: TestClient) -> None:
    pet = frontend_pet(id="evil-id", spriteUrl="/evil.png", htmlUrl="https://evil.example/x", ownerKey="user:github:evil")
    body = client.put("/api/pets", json={"items": [pet]}, headers=DEVICE).json()
    item = body["items"][0]
    assert item["id"] != "evil-id"
    assert item["createdAt"] != "1999-01-01T00:00:00+00:00"
    assert item["syncedAt"] != "1999-01-01T00:00:00+00:00"
    assert item["spriteUrl"] == f"/api/pets/{item['id']}/sprite.png"
    assert item["htmlUrl"] == "https://github.com/acme/widget"
    assert "ownerKey" not in item  # 条目自带的归属字段被忽略
    got = client.get("/api/pets?limit=200", headers=DEVICE).json()["items"][0]
    assert got["id"] == item["id"]
    assert got["createdAt"] == item["createdAt"]


def test_put_skips_invalid_entries(client: TestClient) -> None:
    items = [
        frontend_pet(),
        {},
        {"platform": "github", "fullName": "acme/noseed"},
        {"platform": "gitee", "fullName": "acme/half", "seed": 1},
        {
            "platform": "github", "fullName": "acme/noelement",
            "seed": 1, "spriteSeed": 1, "qualityScore": 10.0, "engineeringScore": 10.0, "level": 1,
        },
        "not-a-dict",
    ]
    response = client.put("/api/pets", json={"items": items}, headers=DEVICE)
    assert response.status_code == 200  # 坏条目跳过，不整体 4xx
    body = response.json()
    assert body["saved"] == 1
    assert [item["fullName"] for item in body["items"]] == ["acme/widget"]
    assert client.get("/api/pets?limit=200", headers=DEVICE).json()["count"] == 1


def test_put_rejects_more_than_sixty_items(client: TestClient) -> None:
    response = client.put("/api/pets", json={"items": [frontend_pet()] * 61}, headers=DEVICE)
    assert response.status_code == 422


def test_client_state_roundtrip_and_shallow_merge(client: TestClient) -> None:
    client.put("/api/pets", json={"items": [frontend_pet()]}, headers=DEVICE)
    got = client.get("/api/pets?limit=200", headers=DEVICE).json()["items"][0]
    assert got["ivs"] == {"hp": 15, "atk": 12}
    assert got["combatPower"] == 4321
    assert got["statCap"] == 99
    assert got["maxHp"] == 500
    assert got["milestones"] == [{"at": 3}]
    assert (got["battles"], got["wins"]) == (0, 0)
    assert got["quality"]["key"] == "SR"
    assert got["qualityKey"] == "SR"

    # 二次推送：列字段覆盖，client_state 浅合并（入站覆盖同名键，未带的键保留）
    second = frontend_pet(level=6, battles=5, wins=4, ivs={"hp": 16})
    second.pop("statCap")
    body = client.put("/api/pets", json={"items": [second]}, headers=DEVICE).json()
    merged = body["items"][0]
    assert (merged["level"], merged["battles"], merged["wins"]) == (6, 5, 4)
    assert merged["ivs"] == {"hp": 16}
    assert merged["statCap"] == 99
    assert merged["maxHp"] == 500
    assert client.get("/api/pets?limit=200", headers=DEVICE).json()["count"] == 1


def test_pet_to_api_columns_win_over_client_state() -> None:
    pet = {
        "id": "p1", "platform": "github", "owner": "a", "repo": "b", "full_name": "a/b",
        "owner_key": "public", "seed": 1, "sprite_seed": 2,
        "element_key": "thunder", "element_secondary": None, "species_key": "beast",
        "quality": "R", "quality_score": 50.0, "quality_dims": {}, "engineering_score": 10.0,
        "level": 3, "exp": 0, "evolution_stage": 1, "stats": [], "skills": [], "hp": 10,
        "foundation": 0.0, "foundation_dims": {}, "traits": [], "ai_rate": None,
        "bond": 0, "battles": 7, "wins": 5, "status": "active", "metrics": {}, "notes": [],
        "degraded": False, "description": "",
        "created_at": "2026-01-01T00:00:00+00:00", "synced_at": "2026-01-02T00:00:00+00:00",
        "client_state": {"level": 99, "battles": 77, "combatPower": 123, "ivs": {"hp": 1}},
    }
    out = services.pet_to_api(pet)
    assert (out["level"], out["battles"], out["wins"]) == (3, 7, 5)  # 列字段优先
    assert out["combatPower"] == 123 and out["ivs"] == {"hp": 1}  # client_state 补缺


def test_session_cookie_overrides_device_header(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth, "github_profile", lambda token: {"login": "octocat", "name": "", "avatar_url": ""})
    monkeypatch.setattr(auth, "github_quota", lambda token: {})
    assert client.post("/api/auth/github/token", json={"token": "ghp_sso_test_token"}).status_code == 200

    # 登录态下 X-Gitmon-User 被忽略，归属走 user:github:octocat（跨设备一致）
    client.put("/api/pets", json={"items": [frontend_pet()]}, headers=DEVICE)
    assert client.get("/api/pets?limit=200", headers=DEVICE).json()["count"] == 1
    assert client.get("/api/pets?limit=200", headers={"X-Gitmon-User": "device2"}).json()["count"] == 1

    # 无会话时回退 X-Gitmon-User，再退 public
    client.cookies.clear()
    assert client.get("/api/pets?limit=200", headers=DEVICE).json()["count"] == 0
    client.put("/api/pets", json={"items": [frontend_pet(fullName="acme/other")]}, headers=DEVICE)
    assert client.get("/api/pets?limit=200", headers=DEVICE).json()["count"] == 1
    assert client.get("/api/pets?limit=200").json()["count"] == 0


def test_owner_key_priority(monkeypatch) -> None:
    request = SimpleNamespace(cookies={auth.SESSION_COOKIE: "sid-123"})
    monkeypatch.setattr(auth, "resolve_session", lambda sid: {"provider": "gitee", "login": "alice"})
    assert api.owner_key(request, "device1") == "user:gitee:alice"
    monkeypatch.setattr(auth, "resolve_session", lambda sid: None)
    assert api.owner_key(request, "device1") == "device1"
    assert api.owner_key(request, None) == "public"
    assert api.owner_key(SimpleNamespace(cookies={}), "bad!!user") == "baduser"
