"""背包与商店 API：/api/inventory/* 与 /api/shop/*"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from . import inventory
from .api import owner_key

router = APIRouter(prefix="/api", tags=["inventory"])


class ExchangeRequest(BaseModel):
    offer_key: str = Field(min_length=1, max_length=60)
    request_id: str = Field(min_length=4, max_length=64, description="客户端生成；同 id 重试只扣一次款")


class GrantRequest(BaseModel):
    item_key: str = Field(min_length=1, max_length=60)
    count: int = Field(default=1, ge=1, le=9999)
    source_key: str = Field(default="", max_length=120, description="幂等键；同 key 只发一次")
    reason: str = Field(default="", max_length=80)


class SpendRequest(BaseModel):
    item_key: str = Field(min_length=1, max_length=60)
    count: int = Field(default=1, ge=1, le=9999)
    reason: str = Field(default="", max_length=80)


@router.get("/inventory", summary="背包：余额 + 货架 + 最近流水")
def get_inventory(key: str = Depends(owner_key)) -> dict[str, Any]:
    return inventory.snapshot(key)


@router.get("/shop", summary="商店货架")
def get_shop(key: str = Depends(owner_key)) -> dict[str, Any]:
    cat = inventory.catalog()
    bought = {name: inventory.purchased_count(key, name) for name in inventory.OFFERS}
    return {
        "currency": cat["currency"],
        "items": cat["items"],
        "offers": [{**offer, "bought": bought.get(offer["key"], 0)} for offer in cat["offers"]],
        "balances": inventory.balances(key),
    }


@router.post("/shop/exchange", summary="兑换商品（request_id 幂等）")
def post_exchange(req: ExchangeRequest, key: str = Depends(owner_key)) -> dict[str, Any]:
    # InventoryError 由 api.install_error_handlers 统一转成 {"error", "hint"}
    return inventory.exchange(key, req.offer_key, req.request_id)


@router.post("/inventory/grant", summary="发奖（source_key 幂等）")
def post_grant(req: GrantRequest, key: str = Depends(owner_key)) -> dict[str, Any]:
    return inventory.grant(key, req.item_key, req.count, source_key=req.source_key, reason=req.reason)


@router.post("/inventory/spend", summary="消耗物品（余额不足直接拒绝）")
def post_spend(req: SpendRequest, key: str = Depends(owner_key)) -> dict[str, Any]:
    return inventory.spend(key, req.item_key, req.count, reason=req.reason)
