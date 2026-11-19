"""按平台仓库 ID 固定精灵身份，按登录账号保存图鉴。"""

from __future__ import annotations

import hashlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from sqlite3 import Connection
from typing import Any, Callable

from . import card_quality, card_ratings, engine, purpose, purpose_agent, services, sprite
from .db import add_growth, db, get_pet, list_pets, save_pet
from .errors import PetNotFound, RateLimited, ScanError, UpstreamError
from .repo import InvalidRepo, RepoRef, ref_from_parts
from .scanner.owner import list_owned_repos
from .scanner.snapshot import RepoSnapshot

BOX_LIMIT = 30
BOX_WORKERS = 3
RARITY_ORDER = {key: index for index, key in enumerate(("N", "R", "SR", "UR", "SE", "PSE"))}
DIVINE_ELEMENT = {"key": "divine", "name": "神", "color": "#f2ce79", "trait": "王者形态"}


def _identity(snapshot: RepoSnapshot) -> tuple[tuple[str, str | None, str], tuple[int, int]]:
    key = (snapshot.ref.platform, snapshot.repo_id)
    seed = engine.fnv1a32(f"{key[0]}/{key[1]}")
    query = ("SELECT element_key, element_secondary, species_key, sprite_seed "
             "FROM repo_identities WHERE platform=? AND repo_id=?")
    with db.connect() as conn:
        row = conn.execute(query, key).fetchone()
        if row is None:
            element, secondary, species = engine.derive_species(snapshot)
            sprite_seed = engine.fnv1a32(f"sprite/v1/{key[0]}/{key[1]}")
            images = [
                sprite.sprite_png(sprite_seed=sprite_seed, color=engine.element_by_key(element)["color"],
                                  body=engine.species_by_key(species)["body"], stage=stage, style="rich")
                for stage in range(1, 4)
            ]
            conn.execute(
                "INSERT INTO repo_identities (platform, repo_id, element_key, element_secondary, species_key, "
                "sprite_seed, sprite_stage_1, sprite_stage_2, sprite_stage_3) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(platform, repo_id) DO NOTHING",
                (*key, element, secondary, species, sprite_seed, *images),
            )
            row = conn.execute(query, key).fetchone()
    return (row["element_key"], row["element_secondary"], row["species_key"]), (seed, row["sprite_seed"])


def _needs_purpose(snapshot: RepoSnapshot, expected_id: str | None) -> bool:
    if not re.fullmatch(r"[1-9][0-9]*", snapshot.repo_id):
        return False
    if expected_id is not None and snapshot.repo_id != expected_id:
        return False
    with db.connect() as conn:
        row = conn.execute(
            "SELECT purpose_element FROM repo_identities WHERE platform=? AND repo_id=?",
            (snapshot.ref.platform, snapshot.repo_id),
        ).fetchone()
    return row is None or row["purpose_element"] is None


def _confirm_purpose(snapshot: RepoSnapshot) -> None:
    evidence = snapshot.purpose_evidence
    if not evidence or not _needs_purpose(snapshot, None):
        return
    element, source = purpose.classify(evidence), "rules"
    if element is None:
        element, source = purpose_agent.classify(evidence, private=snapshot.private), "agent"
    if element not in purpose.ELEMENTS:
        return
    with db.connect() as conn:
        conn.execute(
            "UPDATE repo_identities SET purpose_element=?, purpose_source=? "
            "WHERE platform=? AND repo_id=? AND purpose_element IS NULL",
            (element, source, snapshot.ref.platform, snapshot.repo_id),
        )


def preview(ref: RepoRef, owner: str, *, token: str = "", expected_id: str | None = None) -> dict[str, Any]:
    # 每次用当前会话的访问权限扫描，不走公共快照缓存。
    snapshot = services._scan(ref, token=token, allow_private=bool(token),
                              purpose=lambda snapshot: _needs_purpose(snapshot, expected_id), quality=True)
    if not re.fullmatch(r"[1-9][0-9]*", snapshot.repo_id):
        raise UpstreamError("平台未返回有效的仓库 ID")
    if expected_id is not None and snapshot.repo_id != expected_id:
        raise PetNotFound("该地址已指向另一仓库，请用原仓库的新地址重新孵化")
    identity, seeds = _identity(snapshot)
    _confirm_purpose(snapshot)
    pet_id = hashlib.sha256(f"{ref.platform}/{snapshot.repo_id}/{owner}".encode()).hexdigest()[:32]
    with db.connect() as conn:
        existing = get_pet(conn, pet_id, cloud_owner=owner)
    spec = engine.judge(snapshot, keep_species=identity, seeds=seeds)
    if existing:
        spec["evolution_stage"] = max(spec["evolution_stage"], existing["evolution_stage"])
        spec["skills"] = engine.skills_for(identity[0], spec["evolution_stage"], seeds[1], identity[2])
    pet = services._compose(existing, spec, snapshot.ref, owner, snapshot, cloud_id=pet_id)
    pet["level"] = max(pet["level"], spec["level"])
    scanned_at = datetime.fromtimestamp(snapshot.fetched_at, timezone.utc) if snapshot.fetched_at else datetime.now(timezone.utc)
    pet["synced_at"] = scanned_at.isoformat(timespec="microseconds")
    pet["card_ratings"] = card_ratings.evaluate(snapshot)
    return pet


def collect(pet: dict[str, Any]) -> dict[str, Any]:
    return collect_many([pet])[0]


def collect_many(pets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    with db.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        return [_save_preview(conn, pet) for pet in pets]


def _save_preview(conn: Connection, pet: dict[str, Any]) -> dict[str, Any]:
    existing = get_pet(conn, pet["id"], cloud_owner=pet["owner_key"])
    if existing:
        if existing["synced_at"] >= pet["synced_at"]:
            return existing
        pet = {**pet, **{key: existing[key] for key in ("created_at", "exp", "bond")}}
        pet["level"] = max(existing["level"], pet["level"])
        if existing["evolution_stage"] > pet["evolution_stage"]:
            pet["evolution_stage"] = existing["evolution_stage"]
            pet["skills"] = existing["skills"]
    save_pet(conn, pet)
    if existing is None:
        add_growth(conn, pet["id"], "hatch", 0)
    return pet


def _box_repos(platform: str, login: str, repos: list[dict[str, Any]]) -> list[tuple[RepoRef, str]]:
    candidates = {}
    for repo in sorted(repos, key=lambda item: item.get("pushed_at") or item.get("updated_at") or "", reverse=True):
        if repo.get("fork") or repo.get("parent") or not repo.get("size"):
            continue
        full_name = repo.get("full_name") or ""
        owner, _, name = full_name.partition("/")
        if not full_name:
            metadata = repo.get("owner") or repo.get("namespace") or {}
            owner = metadata.get("login") or metadata.get("path") or ""
            name = repo.get("path") or repo.get("name") or ""
        repo_id = str(repo.get("id") or "")
        if owner.lower() != login.lower() or not re.fullmatch(r"[1-9][0-9]*", repo_id):
            continue
        try:
            candidates.setdefault(repo_id, ref_from_parts(platform, owner, name))
        except InvalidRepo:
            continue
    return [(ref, repo_id) for repo_id, ref in candidates.items()]


def preview_box(platform: str, login: str, owner: str, *, token: str,
                on_progress: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    repos = list_owned_repos(platform, token)
    candidates = _box_repos(platform, login, repos)
    targets = candidates[:BOX_LIMIT]
    pets, failed = [], []
    rate_limited = False
    on_progress({"done": 0, "total": len(targets), "name": ""})
    with ThreadPoolExecutor(max_workers=BOX_WORKERS) as executor:
        for offset in range(0, len(targets), BOX_WORKERS):
            futures = {
                executor.submit(preview, ref, owner, token=token, expected_id=repo_id): ref
                for ref, repo_id in targets[offset:offset + BOX_WORKERS]
            }
            for future in as_completed(futures):
                ref = futures[future]
                try:
                    pets.append(future.result())
                except ScanError as exc:
                    failed.append({"name": ref.repo, "reason": exc.message})
                    rate_limited = rate_limited or isinstance(exc, RateLimited)
                on_progress({"done": len(pets) + len(failed), "total": len(targets), "name": ref.repo})
            if rate_limited:
                break
    pets.sort(key=lambda p: (
        -RARITY_ORDER.get((p["card_ratings"].get("potential") or p["card_ratings"]["rarity"]).get("key"), -1),
        -p["level"], p["full_name"]))
    return {
        "pets": pets, "failed": failed, "rateLimited": rate_limited,
        "listed": len(candidates), "limit": BOX_LIMIT, "truncated": len(candidates) > BOX_LIMIT,
        "skipped": len(repos) - len(candidates), "partial": sum(p["degraded"] for p in pets),
    }


def collected_pet(pet_id: str, owner: str) -> dict[str, Any]:
    with db.connect() as conn:
        pet = get_pet(conn, pet_id, cloud_owner=owner)
    if pet is None:
        raise PetNotFound()
    return pet


def refresh(pet: dict[str, Any], token: str) -> dict[str, Any]:
    scanned = preview(services._ref_of(pet), pet["owner_key"], token=token, expected_id=pet["repo_id"])
    return collect(scanned)


def collection(owner: str, limit: int, offset: int) -> dict[str, Any]:
    with db.connect() as conn:
        pets = list_pets(conn, owner, limit, offset)
    return {"items": presentations(pets)}


def presentation(pet: dict[str, Any], preview_path: str | None = None) -> dict[str, Any]:
    return presentations([pet], lambda _: preview_path)[0]


def presentations(pets: list[dict[str, Any]], preview_path: Callable[[dict[str, Any]], str | None] | None = None
                  ) -> list[dict[str, Any]]:
    keys = {(pet["platform"], pet["repo_id"]) for pet in pets}
    if not keys:
        return []
    placeholders = ",".join("(?,?)" for _ in keys)
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT platform, repo_id, purpose_element, purpose_source FROM repo_identities "
            f"WHERE (platform, repo_id) IN (VALUES {placeholders})",
            tuple(value for key in keys for value in key),
        ).fetchall()
    purposes = {(row["platform"], row["repo_id"]): (row["purpose_element"], row["purpose_source"]) for row in rows}
    return [
        _present(pet, *purposes.get((pet["platform"], pet["repo_id"]), (None, None)),
                 preview_path(pet) if preview_path else None)
        for pet in pets
    ]


def _card_face(origin: dict[str, str], rating: dict[str, Any]) -> dict[str, Any]:
    rank = rating.get("key") if rating.get("status") == "confirmed" else None
    number = card_quality.RANK_NUMBERS.get(rank)
    art = None
    if number is not None and origin["key"] in purpose.ELEMENTS:
        lineage = origin["key"].removeprefix("purpose_")
        art = f"{lineage}/{number:02d}-{rank}.png"
    return {"cardElement": DIVINE_ELEMENT if rank == "king" else origin, "cardArt": art}


def _present(pet: dict[str, Any], element: str | None, source: str | None,
             preview_path: str | None) -> dict[str, Any]:
    data = services.pet_to_api(pet)
    # 图鉴属性与对战类型来自不同规则。保留已锁定的对战类型和立绘。
    data["battleElement"] = data["element"]
    data["battleElementSecondary"] = data["elementSecondary"]
    data["element"] = purpose.ELEMENTS.get(element, purpose.PENDING)
    data["elementSecondary"] = None
    data["attributeStatus"] = "confirmed" if element in purpose.ELEMENTS else "pending"
    data["attributeSource"] = source
    data.update(pet.get("card_ratings") or card_ratings.pending())
    data.update(_card_face(data["element"], data.get("qualityRating") or {}))
    # New scans expose potential as the six-rank card quality. Existing collected
    # cards without that versioned result keep their historical rarity until refresh.
    potential = data.get("potential")
    if isinstance(potential, dict) and potential.get("version") == "gpi-heuristic-v1":
        data["communityRarity"] = data.get("rarity")
        data["rarity"] = {
            "key": potential.get("key", "pending"),
            "name": potential.get("name", "待评估"),
            "color": potential.get("color", "#9ca6b8"),
            "status": potential.get("status", "pending"),
            "recognition": None,
        }
        data["qualityScore"] = potential.get("score") if potential.get("status") == "confirmed" else None
        dims = {entry["key"]: entry["score"] for entry in potential.get("dimensions", [])}
        # Classic card face has five narrow bars: four technical areas + one
        # combined business area; all seven components remain in potential.
        if len(dims) == 7:
            business = (15 * dims["demand"] + 10 * dims["ecosystem"]
                        + 5 * dims["sustainability"]) / 30
            data["qualityDims"] = {
                **{key: dims[key] for key in ("evolution", "reliability", "architecture", "innovation")},
                "business": round(business, 2),
            }
    # 六档展示品质优先使用已评估 GPI（存储于 rarity 兼容字段）；八档源码评级继续用于选图。
    rarity = data.get("rarity") or {}
    rarity_key = rarity.get("key")
    if rarity.get("status") == "confirmed" and rarity_key in RARITY_ORDER:
        quality = engine.quality_by_key(rarity_key)
        data["quality"] = {key: quality[key] for key in ("key", "name", "color", "glow", "model")}
        data["quality"]["status"] = "confirmed"
    else:
        color = rarity.get("color") or "#9ca6b8"
        status = rarity.get("status") if rarity.get("status") in {"pending", "unrated"} else "pending"
        data["quality"] = {
            "key": "pending", "name": rarity.get("name") or "待评估", "color": color,
            "glow": f"{color}99", "model": "", "status": status,
        }
    data["qualityKey"] = data["quality"]["key"]
    data["repoId"] = pet["repo_id"]
    path = preview_path or f"pets/{pet['id']}"
    data["spriteUrl"] = f"/api/cloud/{path}/sprite.png?stage={pet['evolution_stage']}"
    return data


def image(pet: dict[str, Any], stage: int) -> bytes:
    # 云卡记录的是完整进化阶段（1–9），旧云立绘只存了幼体/成长/完全三档。
    # 高阶段统一取最后一档，避免 /sprite.png?stage=6 被参数校验挡掉。
    stage = min(3, max(1, int(stage or 1)))
    with db.connect() as conn:
        row = conn.execute(
            "SELECT sprite_stage_1, sprite_stage_2, sprite_stage_3 FROM repo_identities WHERE platform=? AND repo_id=?",
            (pet["platform"], pet["repo_id"]),
        ).fetchone()
    if row is None:
        raise PetNotFound("立绘不存在")
    return row[stage - 1]
