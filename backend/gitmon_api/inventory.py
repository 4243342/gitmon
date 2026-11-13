"""背包与商店：物品目录、余额账本、兑换。

三条硬规则，全都在这一层收口，前端不许自己算账：

1. **奖励只发一次** —— ``grant`` 带 ``source_key``，靠 ``ux_ledger_source`` 部分唯一索引
   挡住重复发放（同一个战斗结算事件重放两次也只入账一次）。
2. **兑换幂等** —— ``exchange`` 带客户端生成的 ``request_id``，网络重试重复提交只扣一次款。
3. **余额不会变负** —— 扣减与发放在同一个事务里做，余额不足直接拒绝并回滚。

物品目录写死在代码里而不是数据库：目录是随版本走的（加一个道具 = 发一次版），
真正需要落库的是「余额」和「流水」这两张表。商店商品同理，价格与限购都在这里定义。
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from .db import db

CURRENCY = "stardust"

# ---------------------------------------------------------------- 物品目录

ITEMS: dict[str, dict[str, Any]] = {
    "stardust": {
        "name": "星尘",
        "kind": "currency",
        "icon": "✦",
        "color": "#f5c542",
        "desc": "通用货币。竞技场每赢一场、剧情每达成一个结局都会攒下一些。",
    },
    "bond_charm": {
        "name": "羁绊符",
        "kind": "consumable",
        "icon": "❥",
        "color": "#ff8fb1",
        "desc": "给一只精灵使用，羁绊 +20。",
    },
    "exp_tonic": {
        "name": "经验液",
        "kind": "consumable",
        "icon": "◈",
        "color": "#c0a2ff",
        "desc": "给一只精灵使用，经验 +200。",
    },
    "trait_shard": {
        "name": "词条碎片",
        "kind": "consumable",
        "icon": "✧",
        "color": "#9be15d",
        "desc": "给一只精灵使用，净化掉一条负面词条（速度 -20 这类）。",
    },
}

# 商店货架：offer_key → 商品。limit=0 表示不限购。
OFFERS: dict[str, dict[str, Any]] = {
    "bond_charm": {"price": 60, "limit": 20, "sort": 1},
    "exp_tonic": {"price": 100, "limit": 20, "sort": 2},
    "trait_shard": {"price": 80, "limit": 20, "sort": 3},
}

# 各类奖励的发放额度（后端定死，前端只负责显示）
GRANTS = {
    "battle_win": 30,
    "battle_loss": 8,
    "story_ending": 80,
}


class InventoryError(Exception):
    """背包操作失败（余额不足 / 商品下架 / 超过限购）。"""

    def __init__(self, message: str, *, status_code: int = 400, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.hint = hint


# ---------------------------------------------------------------- 读写


def _now() -> float:
    return time.time()


def balances(owner_key: str) -> dict[str, int]:
    """返回该归属下所有物品的余额（含 0）。"""
    out: dict[str, int] = {key: 0 for key in ITEMS}
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT item_key, count FROM inventory_items WHERE owner_key = ?", (owner_key,)
        ).fetchall()
    for row in rows:
        out[row["item_key"]] = int(row["count"] or 0)
    return out


def _balance_of(conn: Any, owner_key: str, item_key: str) -> int:
    row = conn.execute(
        "SELECT count FROM inventory_items WHERE owner_key = ? AND item_key = ?",
        (owner_key, item_key),
    ).fetchone()
    return int(row["count"] or 0) if row else 0


def _write_balance(conn: Any, owner_key: str, item_key: str, count: int) -> None:
    conn.execute(
        "INSERT INTO inventory_items (owner_key, item_key, count, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(owner_key, item_key) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at",
        (owner_key, item_key, count, _now()),
    )


def _write_ledger(
    conn: Any,
    owner_key: str,
    item_key: str,
    delta: int,
    *,
    reason: str = "",
    source_key: str = "",
    offer_key: str = "",
) -> None:
    conn.execute(
        "INSERT INTO inventory_ledger (id, owner_key, item_key, delta, reason, source_key, offer_key, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, owner_key, item_key, int(delta), reason, source_key, offer_key, _now()),
    )


def grant(
    owner_key: str,
    item_key: str,
    count: int,
    *,
    source_key: str = "",
    reason: str = "",
) -> dict[str, Any]:
    """发奖。带 ``source_key`` 时幂等：同一 source_key 重复调用只入账一次。"""
    if item_key not in ITEMS:
        raise InventoryError(f"未知物品：{item_key}", status_code=400)
    count = int(count)
    if count == 0:
        return {"granted": 0, "balance": balances(owner_key).get(item_key, 0)}
    if count < 0:
        # 负数走扣减通道，不许用发奖接口倒扣
        return spend(owner_key, item_key, -count, reason=reason)

    with db.connect() as conn:
        if source_key:
            row = conn.execute(
                "SELECT delta FROM inventory_ledger WHERE owner_key = ? AND source_key = ? AND item_key = ?",
                (owner_key, source_key, item_key),
            ).fetchone()
            if row is not None:
                # 已经发过了：原样返回当前余额，不重复入账
                return {"granted": 0, "duplicate": True, "balance": _balance_of(conn, owner_key, item_key)}
        current = _balance_of(conn, owner_key, item_key)
        _write_balance(conn, owner_key, item_key, current + count)
        _write_ledger(conn, owner_key, item_key, count, reason=reason, source_key=source_key)
        return {"granted": count, "duplicate": False, "balance": current + count}


def spend(owner_key: str, item_key: str, count: int, *, reason: str = "") -> dict[str, Any]:
    """扣物品。余额不足抛 InventoryError，事务回滚，余额不会变负。"""
    if item_key not in ITEMS:
        raise InventoryError(f"未知物品：{item_key}", status_code=400)
    count = int(count)
    if count <= 0:
        raise InventoryError("扣除数量必须为正", status_code=400)
    with db.connect() as conn:
        current = _balance_of(conn, owner_key, item_key)
        if current < count:
            raise InventoryError(
                f"{ITEMS[item_key]['name']}不够（需要 {count}，还剩 {current}）",
                status_code=400,
                hint="去竞技场赢几场，或者去剧情模式打一个结局",
            )
        _write_balance(conn, owner_key, item_key, current - count)
        _write_ledger(conn, owner_key, item_key, -count, reason=reason)
        return {"spent": count, "balance": current - count}


def ledger_rows(owner_key: str, limit: int = 20) -> list[dict[str, Any]]:
    """最近几条流水，给背包页做「最近发生什么」的展示。"""
    limit = max(1, min(int(limit), 100))
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT item_key, delta, reason, created_at FROM inventory_ledger "
            "WHERE owner_key = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (owner_key, limit),
        ).fetchall()
    return [
        {
            "item_key": row["item_key"],
            "delta": int(row["delta"]),
            "reason": row["reason"] or "",
            "created_at": float(row["created_at"] or 0),
        }
        for row in rows
    ]


def purchased_count(owner_key: str, offer_key: str) -> int:
    """某个商品已兑换次数（限购判定用）。"""
    with db.connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM inventory_ledger "
            "WHERE owner_key = ? AND offer_key = ? AND delta > 0",
            (owner_key, offer_key),
        ).fetchone()
    return int(row["n"] or 0)


def exchange(owner_key: str, offer_key: str, request_id: str) -> dict[str, Any]:
    """兑换商品。``request_id`` 由客户端生成，同一个 id 重复提交只扣一次款。"""
    offer = OFFERS.get(offer_key)
    if offer is None:
        raise InventoryError(f"货架上没有这件商品：{offer_key}", status_code=404)
    item_key = offer_key
    if item_key not in ITEMS:
        raise InventoryError(f"商品没有对应物品：{offer_key}", status_code=400)
    request_id = (request_id or "").strip()[:64]
    if not request_id:
        raise InventoryError("缺少 request_id", status_code=400)

    price = int(offer["price"])
    limit = int(offer.get("limit") or 0)

    with db.connect() as conn:
        source_key = f"shop:{request_id}"
        done = conn.execute(
            "SELECT offer_key FROM inventory_ledger WHERE owner_key = ? AND source_key = ? LIMIT 1",
            (owner_key, source_key),
        ).fetchone()
        if done is not None:
            # 已经兑换过（网络重试）：原样回报，不重复扣款
            return {
                "ok": True,
                "duplicate": True,
                "offer_key": offer_key,
                "item_key": item_key,
                "price": price,
                "balance": _balance_of(conn, owner_key, item_key),
                "currency": _balance_of(conn, owner_key, CURRENCY),
            }

        if limit:
            bought = conn.execute(
                "SELECT COUNT(*) AS n FROM inventory_ledger "
                "WHERE owner_key = ? AND offer_key = ? AND delta > 0",
                (owner_key, offer_key),
            ).fetchone()
            if int(bought["n"] or 0) >= limit:
                raise InventoryError(
                    f"「{ITEMS[item_key]['name']}」限购 {limit} 件，已买满",
                    status_code=400,
                    hint="换个商品看看",
                )

        have = _balance_of(conn, owner_key, CURRENCY)
        if have < price:
            raise InventoryError(
                f"{ITEMS[CURRENCY]['name']}不够（需要 {price}，还剩 {have}）",
                status_code=400,
                hint="去竞技场赢一场，或者去剧情模式打一个结局",
            )

        _write_balance(conn, owner_key, CURRENCY, have - price)
        _write_ledger(conn, owner_key, CURRENCY, -price, reason=f"兑换 {ITEMS[item_key]['name']}", source_key=source_key)
        item_now = _balance_of(conn, owner_key, item_key)
        _write_balance(conn, owner_key, item_key, item_now + 1)
        _write_ledger(conn, owner_key, item_key, 1, reason=f"兑换 {ITEMS[item_key]['name']}", source_key=source_key, offer_key=offer_key)

        return {
            "ok": True,
            "duplicate": False,
            "offer_key": offer_key,
            "item_key": item_key,
            "price": price,
            "balance": item_now + 1,
            "currency": have - price,
        }


# ---------------------------------------------------------------- 对外视图


def catalog() -> dict[str, Any]:
    """物品目录 + 货架（给前端渲染商店与背包）。"""
    return {
        "currency": CURRENCY,
        "items": [
            {"key": key, **{k: v for k, v in meta.items()}} for key, meta in ITEMS.items()
        ],
        "offers": [
            {
                "key": key,
                "item_key": key,
                "price": int(offer["price"]),
                "limit": int(offer.get("limit") or 0),
                "sort": int(offer.get("sort") or 0),
            }
            for key, offer in sorted(OFFERS.items(), key=lambda kv: int(kv[1].get("sort") or 0))
        ],
    }


def snapshot(owner_key: str, ledger_limit: int = 20) -> dict[str, Any]:
    """背包页一次性要的东西：余额 + 货架 + 最近流水。"""
    cat = catalog()
    bought = {key: purchased_count(owner_key, key) for key in OFFERS}
    offers = []
    for offer in cat["offers"]:
        offers.append({**offer, "bought": bought.get(offer["key"], 0)})
    return {
        "currency": CURRENCY,
        "items": cat["items"],
        "offers": offers,
        "balances": balances(owner_key),
        "ledger": ledger_rows(owner_key, ledger_limit),
    }
