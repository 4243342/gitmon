"""服务编排层：扫描 → 判定 → 落库 → 结算。

API 层只负责参数校验与序列化，所有业务动作都收在这里。
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import engine, growth, sprite
from . import traits as trait_mod
from .config import settings
from .db import (
    add_growth,
    db,
    find_pet,
    get_pet,
    get_snapshot_cache,
    list_growth,
    list_pets,
    put_snapshot_cache,
    save_pet,
)
from .db import utcnow_iso
from .errors import PetNotFound
from .repo import RepoRef, parse_repo
from .scanner import scan as scan_remote
from .scanner.snapshot import RepoSnapshot


# ---------------------------------------------------------------- 快照

def _scan(ref: RepoRef, since: str | None = None, token: str | None = None) -> RepoSnapshot:
    """真正的网络扫描。测试通过 monkeypatch 这个函数注入假数据。"""
    return scan_remote(ref, since=since, token=token)


def scan_snapshot(conn, ref: RepoRef, *, force: bool = False, since: str | None = None,
                  token: str | None = None) -> RepoSnapshot:
    if not force:
        cached = get_snapshot_cache(conn, ref.cache_key, settings.cache_ttl)
        if cached:
            return RepoSnapshot.from_dict(cached)
    snapshot = _scan(ref, since=since, token=token)
    put_snapshot_cache(conn, ref.cache_key, ref.platform, ref.full_name, snapshot.to_dict())
    return snapshot


# ---------------------------------------------------------------- 工具

def _pet_id(ref: RepoRef, owner_key: str) -> str:
    digest = hashlib.sha1(f"{ref.cache_key}|{owner_key}".encode("utf-8")).hexdigest()
    return digest[:16]


def _ref_of(pet: dict[str, Any]) -> RepoRef:
    return RepoRef(pet["platform"], pet["owner"], pet["repo"])


def _fresh(pet: dict[str, Any], ttl: int | None = None) -> bool:
    try:
        synced = datetime.fromisoformat(str(pet.get("synced_at")))
    except (TypeError, ValueError):
        return False
    if synced.tzinfo is None:
        synced = synced.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - synced).total_seconds()
    return age <= (ttl if ttl is not None else settings.cache_ttl)


def _sprite_path(pet_id: str, stage: int) -> Path:
    return settings.sprite_dir / f"{pet_id}-s{stage}.png"


def _write_sprite(pet: dict[str, Any]) -> str:
    path = _sprite_path(pet["id"], int(pet["evolution_stage"]))
    if not path.exists():
        element = engine.element_by_key(pet["element_key"])
        species = engine.species_by_key(pet["species_key"])
        payload = sprite.sprite_png(
            sprite_seed=int(pet["sprite_seed"]),
            color=element["color"],
            body=species["body"],
            stage=int(pet["evolution_stage"]),
        )
        path.write_bytes(payload)
    return str(path)


def pet_to_api(pet: dict[str, Any]) -> dict[str, Any]:
    """数据库行 → 前端可直接消费的精灵对象。"""
    element = engine.element_by_key(pet["element_key"])
    species = engine.species_by_key(pet["species_key"])
    quality = engine.quality_by_key(pet["quality"])
    stage = int(pet.get("evolution_stage") or 1)
    level = int(pet.get("level") or 1)
    secondary_key = pet.get("element_secondary")
    secondary = engine.element_by_key(secondary_key) if secondary_key else None
    ref = _ref_of(pet)
    # 老数据没有根基字段：不假装它是 0 分，标成"未评估"，等下次同步补算
    foundation_value = float(pet.get("foundation") or 0)
    foundation = round(foundation_value, 1) if foundation_value > 0 else None
    foundation_tier = (
        trait_mod.foundation_tier(foundation_value) if foundation is not None
        else {"key": "unknown", "name": "未评估", "min": 0}
    )

    return {
        "id": pet["id"],
        "platform": pet["platform"],
        "owner": pet["owner"],
        "repo": pet["repo"],
        "fullName": pet["full_name"],
        "htmlUrl": ref.html_url,
        "seed": int(pet["seed"]),
        "spriteSeed": int(pet["sprite_seed"]),
        "spriteUrl": f"/api/pets/{pet['id']}/sprite.png",
        "element": {"key": element["key"], "name": element["name"], "color": element["color"], "trait": element["trait"]},
        "elementSecondary": (
            {"key": secondary["key"], "name": secondary["name"], "color": secondary["color"]} if secondary else None
        ),
        "species": {"key": species["key"], "name": species["name"], "type": species["type"], "body": species["body"]},
        "quality": {"key": quality["key"], "name": quality["name"], "color": quality["color"], "glow": quality["glow"]},
        "qualityScore": float(pet["quality_score"]),
        "qualityDims": pet.get("quality_dims") or {},
        "engineeringScore": float(pet["engineering_score"]),
        "level": level,
        "exp": int(pet.get("exp") or 0),
        "expToNext": int(round(growth.xp_to_next(level) * trait_mod.xp_multiplier(pet.get("traits") or []))),
        "evolutionStage": stage,
        "evolutionStageName": engine.STAGE_NAMES.get(stage, "幼体"),
        "stats": pet.get("stats") or [],
        "skills": pet.get("skills") or [],
        "hp": int(pet.get("hp") or 0),
        "foundation": foundation,
        "foundationTier": foundation_tier,
        "foundationDims": pet.get("foundation_dims") or {},
        "traits": pet.get("traits") or [],
        "traitSummary": trait_mod.summary(pet.get("traits") or []),
        "aiRate": pet.get("ai_rate"),
        "bond": int(pet.get("bond") or 0),
        "status": pet.get("status") or "active",
        "description": pet.get("description") or "",
        "createdAt": pet.get("created_at"),
        "syncedAt": pet.get("synced_at"),
        "metrics": pet.get("metrics") or {},
        "notes": pet.get("notes") or [],
        "degraded": bool(pet.get("degraded")),
    }


def _compose(existing: dict[str, Any] | None, spec: dict[str, Any], ref: RepoRef,
             owner_key: str, snapshot: RepoSnapshot) -> dict[str, Any]:
    now = utcnow_iso()
    pet = dict(existing or {})
    pet.update(
        {
            "id": existing["id"] if existing else _pet_id(ref, owner_key),
            "platform": ref.platform,
            "owner": ref.owner,
            "repo": ref.repo,
            "full_name": ref.full_name,
            "owner_key": owner_key,
            "seed": spec["seed"],
            "sprite_seed": spec["sprite_seed"],
            "element_key": spec["element_key"],
            "element_secondary": spec["element_secondary"],
            "species_key": spec["species_key"],
            "quality": spec["quality"],
            "quality_score": spec["quality_score"],
            "quality_dims": spec["quality_dims"],
            "engineering_score": spec["engineering_score"],
            "evolution_stage": spec["evolution_stage"],
            "stats": spec["stats"],
            "skills": spec["skills"],
            "hp": spec["hp"],
            "foundation": spec["foundation"],
            "foundation_dims": spec["foundation_dims"],
            "traits": spec["traits"],
            "ai_rate": spec["ai_rate"],
            "metrics": spec["metrics"],
            "notes": spec["notes"],
            "degraded": spec["degraded"],
            "description": snapshot.description,
            "created_at": existing["created_at"] if existing else now,
            "synced_at": now,
        }
    )
    pet.setdefault("exp", 0)
    pet.setdefault("bond", 0)
    pet.setdefault("status", growth.status_for(snapshot))
    if existing is None:
        pet["level"] = spec["level"]
    pet["sprite_path"] = _write_sprite(pet)
    return pet


# ---------------------------------------------------------------- 孵化

def hatch(repo_value: str, owner_key: str = "public", *, refresh: bool = False,
          token: str | None = None) -> dict[str, Any]:
    ref = parse_repo(repo_value)
    with db.connect() as conn:
        existing = find_pet(conn, ref.platform, ref.full_name, owner_key)
        if existing and not refresh and _fresh(existing):
            return pet_to_api(existing)

        snapshot = scan_snapshot(conn, ref, force=refresh, token=token)
        keep = None
        if existing:
            keep = (existing["element_key"], existing.get("element_secondary"), existing["species_key"])
        spec = engine.judge(snapshot, keep_species=keep)
        pet = _compose(existing, spec, ref, owner_key, snapshot)
        save_pet(conn, pet)
        add_growth(
            conn, pet["id"],
            "hatch" if existing is None else "rescan",
            0,
            {
                "level": pet["level"],
                "quality": pet["quality"],
                "qualityScore": pet["quality_score"],
                "engineeringScore": pet["engineering_score"],
                "platform": ref.platform,
            },
        )
        return pet_to_api(pet)


# ---------------------------------------------------------------- 同步结算

def sync(pet_id: str, *, token: str | None = None) -> dict[str, Any]:
    with db.connect() as conn:
        pet = get_pet(conn, pet_id)
        if pet is None:
            raise PetNotFound()
        ref = _ref_of(pet)
        snapshot = scan_snapshot(conn, ref, force=True, since=pet.get("synced_at"), token=token)
        return _apply_sync(conn, pet, snapshot)


def sync_by_ref(ref: RepoRef, owner_key: str = "public", *, token: str | None = None) -> dict[str, Any]:
    with db.connect() as conn:
        pet = find_pet(conn, ref.platform, ref.full_name, owner_key)
    if pet is None:
        return hatch(ref.html_url, owner_key, token=token)
    with db.connect() as conn:
        snapshot = scan_snapshot(conn, ref, force=True, since=pet.get("synced_at"), token=token)
        return _apply_sync(conn, pet, snapshot)


def _apply_sync(conn, pet: dict[str, Any], snapshot: RepoSnapshot) -> dict[str, Any]:
    outcome = growth.settle(pet, snapshot)
    ref = _ref_of(pet)
    previous_stage = int(pet.get("evolution_stage") or 1)
    keep = (pet["element_key"], pet.get("element_secondary"), pet["species_key"])
    spec = engine.judge(snapshot, keep_species=keep)

    # 等级取「成长等级」与「当前工程量应得等级」的较高者：删代码不会掉级
    baseline = engine.level_from_engineering(spec["engineering_score"])
    level = max(int(outcome["level"]), baseline)
    stage = max(int(outcome["evolution_stage"]), int(spec["evolution_stage"]), previous_stage)

    pet.update(
        {
            "quality": spec["quality"],
            "quality_score": spec["quality_score"],
            "quality_dims": spec["quality_dims"],
            "engineering_score": spec["engineering_score"],
            "stats": spec["stats"],
            "skills": engine.skills_for(spec["element_key"], stage, pet["sprite_seed"], pet["species_key"]),
            "hp": spec["stats"][5]["value"] * 10,
            "foundation": spec["foundation"],
            "foundation_dims": spec["foundation_dims"],
            "traits": spec["traits"],
            "ai_rate": spec["ai_rate"],
            "level": level,
            "exp": outcome["exp"],
            "evolution_stage": stage,
            "bond": outcome["bond"],
            "status": outcome["status"],
            "metrics": outcome["metrics"],
            "notes": spec["notes"],
            "degraded": spec["degraded"],
            "description": snapshot.description,
            "synced_at": utcnow_iso(),
        }
    )
    pet["sprite_path"] = _write_sprite(pet)
    save_pet(conn, pet)

    if outcome["xp_gained"] > 0:
        add_growth(conn, pet["id"], "sync", outcome["xp_gained"], {
            "events": outcome["events"],
            "levels": outcome["levels_gained"],
            "level": level,
        })
    if stage > previous_stage:
        add_growth(conn, pet["id"], "evolve", 0, {"stage": stage})

    api = pet_to_api(pet)
    api["sync"] = {
        "xpGained": outcome["xp_gained"],
        "levelsGained": outcome["levels_gained"],
        "events": outcome["events"],
        "evolved": stage > previous_stage,
    }
    return api


# ---------------------------------------------------------------- 查询

def collection(owner_key: str, limit: int = 60, offset: int = 0) -> dict[str, Any]:
    with db.connect() as conn:
        pets = list_pets(conn, owner_key, limit, offset)
    return {"items": [pet_to_api(pet) for pet in pets], "count": len(pets)}


def detail(pet_id: str, *, include_growth: bool = True) -> dict[str, Any]:
    with db.connect() as conn:
        pet = get_pet(conn, pet_id)
        if pet is None:
            raise PetNotFound()
        api = pet_to_api(pet)
        if include_growth:
            api["growthLog"] = list_growth(conn, pet_id, 20)
    return api


def remove(pet_id: str) -> None:
    with db.connect() as conn:
        pet = get_pet(conn, pet_id)
        if pet is None:
            raise PetNotFound()
        conn.execute("DELETE FROM pets WHERE id=?", (pet_id,))
        conn.execute("DELETE FROM growth_log WHERE pet_id=?", (pet_id,))


def leaderboard(limit: int = 20) -> dict[str, Any]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM pets ORDER BY level DESC, quality_score DESC LIMIT ?",
            (max(limit * 4, 40),),
        ).fetchall()
        from .db import row_to_pet

        pets = [row_to_pet(row) for row in rows]

    # 同一仓库可能被多个用户各自孵化过，榜单只保留等级最高的那一只
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for pet in pets:
        if not pet:
            continue
        key = (pet["platform"], pet["full_name"])
        current = best.get(key)
        if current is None or (pet["level"], pet["quality_score"]) > (current["level"], current["quality_score"]):
            best[key] = pet
    ranked = sorted(best.values(), key=lambda p: (p["level"], p["quality_score"]), reverse=True)[:limit]
    return {"items": [pet_to_api(p) for p in ranked], "count": len(ranked)}


def sprite_file(pet_id: str) -> Path:
    with db.connect() as conn:
        pet = get_pet(conn, pet_id)
        if pet is None:
            raise PetNotFound()
        path = Path(pet.get("sprite_path") or "") if pet.get("sprite_path") else _sprite_path(pet_id, pet["evolution_stage"])
        if not path.exists():
            path = Path(_write_sprite(pet))
    return path


def sprite_by_ref(ref: RepoRef, *, stage: int | None = None) -> tuple[bytes, str]:
    """任意仓库的立绘 PNG（无状态）。未入库时先按徽章流程登记一次。"""
    api = ensure_pet_for_badge(ref)
    if api is None:
        raise PetNotFound("仓库尚未扫描，无法生成立绘")
    element = engine.element_by_key(api["element"]["key"])
    species = engine.species_by_key(api["species"]["key"])
    payload = sprite.sprite_png(
        sprite_seed=int(api["spriteSeed"]),
        color=element["color"],
        body=species["body"],
        stage=stage or int(api["evolutionStage"]),
    )
    return payload, element["color"]


def ensure_pet_for_badge(ref: RepoRef, *, token: str | None = None) -> dict[str, Any] | None:
    """徽章端点用：已入库直接取，否则扫一次并登记到公共图鉴。"""
    with db.connect() as conn:
        pet = find_pet(conn, ref.platform, ref.full_name, "public")
    if pet:
        return pet_to_api(pet)
    try:
        return hatch(ref.html_url, "public", token=token)
    except Exception:
        return None


def daily_sync(limit: int = 30) -> dict[str, Any]:
    """每日结算：按最久未同步的顺序处理一批精灵。"""
    from .db import list_active_pets

    with db.connect() as conn:
        pets = list_active_pets(conn, limit)
    synced, failed = 0, 0
    for pet in pets:
        try:
            ref = _ref_of(pet)
            with db.connect() as conn:
                snapshot = scan_snapshot(conn, ref, force=True, since=pet.get("synced_at"), token=token)
                _apply_sync(conn, pet, snapshot)
            synced += 1
        except Exception:
            failed += 1
    return {"synced": synced, "failed": failed, "scanned": len(pets)}
