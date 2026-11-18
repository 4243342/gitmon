"""背包与商店：幂等、限购、余额不为负、归属隔离。

这几条是账本层的底线——发奖重复入账、兑换重复扣款、余额扣成负数，
在任何一次网络重试或连点下都会直接毁掉玩家的资产。
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, inventory
from gitmon_api.db import db
from gitmon_api.main import create_app

OWNER = "user:github:tester"


@pytest.fixture(autouse=True)
def isolated_db(tmp_dir, monkeypatch):
    """每个用例都跑在独立临时库上。

    不隔离的话这些用例会往开发库里写真星尘，余额越堆越离谱，
    限购计数也会被上一轮跑剩下的记录污染（曾经因此把 20 件限购跑成 19 件）。
    """
    monkeypatch.setattr(db, "path", tmp_dir / "gitmon-inv.db", raising=False)
    monkeypatch.setattr(db, "_ready", False, raising=False)
    db.init()


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    settings.ensure_dirs()
    app = create_app(start_queue=False)
    with TestClient(app) as test_client:
        yield test_client


def _headers(owner: str = OWNER) -> dict[str, str]:
    return {"X-Gitmon-User": owner}


# ---------------------------------------------------------------- 幂等

def test_grant_with_same_source_key_only_lands_once() -> None:
    first = inventory.grant(OWNER, "stardust", 30, source_key="battle:win:1", reason="竞技场胜利")
    second = inventory.grant(OWNER, "stardust", 30, source_key="battle:win:1", reason="竞技场胜利")
    assert first["granted"] == 30
    assert second["granted"] == 0
    assert second["duplicate"] is True
    assert inventory.balances(OWNER)["stardust"] == 30


def test_grant_without_source_key_always_lands() -> None:
    inventory.grant(OWNER, "stardust", 10)
    inventory.grant(OWNER, "stardust", 10)
    assert inventory.balances(OWNER)["stardust"] == 20


def test_exchange_with_same_request_id_charges_once() -> None:
    inventory.grant(OWNER, "stardust", 500)
    first = inventory.exchange(OWNER, "trait_shard", "req-1")
    second = inventory.exchange(OWNER, "trait_shard", "req-1")
    assert first["duplicate"] is False
    assert second["duplicate"] is True
    # 只扣了一次钱，也只发了一张券
    assert inventory.balances(OWNER)["stardust"] == 500 - 80
    assert inventory.balances(OWNER)["trait_shard"] == 1


# ---------------------------------------------------------------- 余额与限购

def test_exchange_refuses_when_balance_is_short() -> None:
    inventory.grant(OWNER, "stardust", 10)
    with pytest.raises(inventory.InventoryError) as excinfo:
        inventory.exchange(OWNER, "trait_shard", "req-short")
    assert "不够" in excinfo.value.message
    # 失败的兑换不能留下痕迹：钱没少，券也没有
    assert inventory.balances(OWNER)["stardust"] == 10
    assert inventory.balances(OWNER)["trait_shard"] == 0


def test_spend_never_makes_balance_negative() -> None:
    inventory.grant(OWNER, "exp_tonic", 1)
    with pytest.raises(inventory.InventoryError):
        inventory.spend(OWNER, "exp_tonic", 5)
    assert inventory.balances(OWNER)["exp_tonic"] == 1


def test_offer_limit_is_enforced() -> None:
    inventory.grant(OWNER, "stardust", 100000)
    limit = int(inventory.OFFERS["bond_charm"]["limit"])
    for i in range(limit):
        inventory.exchange(OWNER, "bond_charm", f"req-{i}")
    assert inventory.balances(OWNER)["bond_charm"] == limit
    with pytest.raises(inventory.InventoryError) as excinfo:
        inventory.exchange(OWNER, "bond_charm", "req-over")
    assert "限购" in excinfo.value.message


def test_repeat_purchase_counts_against_the_limit() -> None:
    """限购按「买了多少件」算，不是按背包里有多少件。"""
    inventory.grant(OWNER, "stardust", 100000)
    for i in range(5):
        inventory.exchange(OWNER, "trait_shard", f"req-rep-{i}")
    assert inventory.balances(OWNER)["trait_shard"] == 5
    assert inventory.purchased_count(OWNER, "trait_shard") == 5
    # 发奖不是购买，不占限购名额
    inventory.grant(OWNER, "trait_shard", 3, source_key="quest:1")
    assert inventory.purchased_count(OWNER, "trait_shard") == 5


# ---------------------------------------------------------------- 归属隔离

def test_balances_are_isolated_per_owner() -> None:
    inventory.grant(OWNER, "stardust", 50)
    inventory.grant("device-b", "stardust", 7)
    assert inventory.balances(OWNER)["stardust"] == 50
    assert inventory.balances("device-b")["stardust"] == 7


# ---------------------------------------------------------------- 流水

def test_ledger_records_both_sides_of_a_purchase() -> None:
    inventory.grant(OWNER, "stardust", 200, source_key="story:ending:1", reason="剧情达成")
    inventory.exchange(OWNER, "bond_charm", "req-led")
    rows = inventory.ledger_rows(OWNER, 10)
    assert rows[0]["item_key"] == "bond_charm" and rows[0]["delta"] == 1
    assert rows[1]["item_key"] == "stardust" and rows[1]["delta"] == -60
    assert rows[2]["item_key"] == "stardust" and rows[2]["delta"] == 200


def test_ledger_keeps_only_the_latest_rows() -> None:
    for i in range(5):
        inventory.grant(OWNER, "stardust", 1, reason=f"第 {i} 次")
    rows = inventory.ledger_rows(OWNER, 3)
    assert len(rows) == 3
    assert rows[0]["reason"] == "第 4 次"


# ---------------------------------------------------------------- HTTP 层

def test_inventory_endpoint_returns_snapshot(client: TestClient) -> None:
    payload = client.get("/api/inventory", headers=_headers()).json()
    assert payload["currency"] == "stardust"
    assert {item["key"] for item in payload["items"]} >= {"stardust", "trait_shard"}
    assert payload["balances"]["stardust"] == 0
    assert len(payload["offers"]) == len(inventory.OFFERS)


def test_exchange_endpoint_reports_insufficient_balance(client: TestClient) -> None:
    response = client.post(
        "/api/shop/exchange",
        json={"offer_key": "trait_shard", "request_id": "req-api"},
        headers=_headers(),
    )
    assert response.status_code == 400
    assert "error" in response.json()


def test_exchange_endpoint_is_idempotent(client: TestClient) -> None:
    client.post("/api/inventory/grant", json={"item_key": "stardust", "count": 300}, headers=_headers())
    body = {"offer_key": "bond_charm", "request_id": "req-api-2"}
    first = client.post("/api/shop/exchange", json=body, headers=_headers()).json()
    second = client.post("/api/shop/exchange", json=body, headers=_headers()).json()
    assert first["duplicate"] is False
    assert second["duplicate"] is True
    snapshot = client.get("/api/inventory", headers=_headers()).json()
    assert snapshot["balances"]["bond_charm"] == 1
    assert snapshot["balances"]["stardust"] == 300 - 60
