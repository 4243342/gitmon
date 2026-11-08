"""SQLite 存储层（WAL 模式，单文件零运维）。

只做三件事：精灵档案、成长流水、仓库快照缓存。
业务判定不在这里，全在 engine / growth 两个纯函数模块。
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS pets (
    id                TEXT PRIMARY KEY,
    platform          TEXT NOT NULL,
    owner             TEXT NOT NULL,
    repo              TEXT NOT NULL,
    full_name         TEXT NOT NULL,
    owner_key         TEXT NOT NULL DEFAULT 'public',
    seed              INTEGER NOT NULL,
    sprite_seed       INTEGER NOT NULL,
    element_key       TEXT NOT NULL,
    element_secondary TEXT,
    species_key       TEXT NOT NULL,
    quality           TEXT NOT NULL,
    quality_score     REAL NOT NULL,
    quality_dims      TEXT NOT NULL DEFAULT '{}',
    engineering_score REAL NOT NULL,
    level             INTEGER NOT NULL,
    exp               INTEGER NOT NULL DEFAULT 0,
    evolution_stage   INTEGER NOT NULL DEFAULT 1,
    stats             TEXT NOT NULL DEFAULT '[]',
    skills            TEXT NOT NULL DEFAULT '[]',
    hp                INTEGER NOT NULL DEFAULT 0,
    foundation        REAL NOT NULL DEFAULT 0,
    foundation_dims   TEXT NOT NULL DEFAULT '{}',
    traits            TEXT NOT NULL DEFAULT '[]',
    ai_rate           REAL,
    bond              INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'active',
    metrics           TEXT NOT NULL DEFAULT '{}',
    notes             TEXT NOT NULL DEFAULT '[]',
    degraded          INTEGER NOT NULL DEFAULT 0,
    description       TEXT NOT NULL DEFAULT '',
    sprite_path       TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    synced_at         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_identity
    ON pets(platform, full_name, owner_key);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pets_level ON pets(level DESC);

CREATE TABLE IF NOT EXISTS growth_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id      TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    xp_delta    INTEGER NOT NULL DEFAULT 0,
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_pet ON growth_log(pet_id, id DESC);

CREATE TABLE IF NOT EXISTS snapshots (
    cache_key   TEXT PRIMARY KEY,
    platform    TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    fetched_at  REAL NOT NULL,
    payload     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_fetched ON snapshots(fetched_at);
"""


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# 老库平滑升级：CREATE TABLE IF NOT EXISTS 不会补列，这里补一次
_ADDED_COLUMNS = (
    ("foundation", "REAL NOT NULL DEFAULT 0"),
    ("foundation_dims", "TEXT NOT NULL DEFAULT '{}'"),
    ("traits", "TEXT NOT NULL DEFAULT '[]'"),
    ("ai_rate", "REAL"),
)


def _migrate(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(pets)")}
    for name, ddl in _ADDED_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE pets ADD COLUMN {name} {ddl}")


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._init_lock = threading.Lock()
        self._ready = False

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.init()
        conn = sqlite3.connect(self.path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init(self) -> None:
        if self._ready:
            return
        with self._init_lock:
            if self._ready:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=15.0)
            try:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")
                conn.executescript(_SCHEMA)
                _migrate(conn)
                conn.commit()
            finally:
                conn.close()
            self._ready = True


db = Database(settings.db_path)


def _loads(raw: Any, fallback: Any) -> Any:
    if raw in (None, ""):
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def row_to_pet(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    pet = dict(row)
    pet["quality_dims"] = _loads(pet.get("quality_dims"), {})
    pet["foundation_dims"] = _loads(pet.get("foundation_dims"), {})
    pet["traits"] = _loads(pet.get("traits"), [])
    pet["stats"] = _loads(pet.get("stats"), [])
    pet["skills"] = _loads(pet.get("skills"), [])
    pet["metrics"] = _loads(pet.get("metrics"), {})
    pet["notes"] = _loads(pet.get("notes"), [])
    pet["degraded"] = bool(pet.get("degraded"))
    return pet


def save_pet(conn: sqlite3.Connection, pet: dict[str, Any]) -> None:
    payload = dict(pet)
    for key in ("quality_dims", "foundation_dims", "stats", "skills", "traits", "metrics", "notes"):
        default = {} if key in ("quality_dims", "foundation_dims", "metrics") else []
        payload[key] = json.dumps(payload.get(key, default), ensure_ascii=False, separators=(",", ":"))
    payload["degraded"] = 1 if payload.get("degraded") else 0
    columns = [
        "id", "platform", "owner", "repo", "full_name", "owner_key", "seed", "sprite_seed",
        "element_key", "element_secondary", "species_key", "quality", "quality_score",
        "quality_dims", "engineering_score", "level", "exp", "evolution_stage", "stats",
        "skills", "hp", "foundation", "foundation_dims", "traits", "ai_rate", "bond",
        "status", "metrics", "notes", "degraded", "description",
        "sprite_path", "created_at", "synced_at",
    ]
    placeholders = ",".join("?" for _ in columns)
    values = [payload.get(col) for col in columns]
    conn.execute(
        f"INSERT INTO pets ({','.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET "
        + ",".join(f"{col}=excluded.{col}" for col in columns if col != "id"),
        values,
    )


def find_pet(conn: sqlite3.Connection, platform: str, full_name: str, owner_key: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM pets WHERE platform=? AND full_name=? AND owner_key=?",
        (platform, full_name, owner_key),
    ).fetchone()
    return row_to_pet(row)


def get_pet(conn: sqlite3.Connection, pet_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM pets WHERE id=?", (pet_id,)).fetchone()
    return row_to_pet(row)


def list_pets(conn: sqlite3.Connection, owner_key: str, limit: int = 60, offset: int = 0) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM pets WHERE owner_key=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (owner_key, limit, offset),
    ).fetchall()
    return [row_to_pet(row) for row in rows if row is not None]  # type: ignore[misc]


def list_active_pets(conn: sqlite3.Connection, limit: int = 50) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM pets WHERE status != 'archived' ORDER BY synced_at ASC LIMIT ?",
        (limit,),
    ).fetchall()
    return [row_to_pet(row) for row in rows if row is not None]  # type: ignore[misc]


def add_growth(conn: sqlite3.Connection, pet_id: str, event_type: str, xp: int,
               detail: dict[str, Any] | None = None) -> None:
    conn.execute(
        "INSERT INTO growth_log (pet_id, event_type, xp_delta, detail, created_at) VALUES (?,?,?,?,?)",
        (pet_id, event_type, xp, json.dumps(detail or {}, ensure_ascii=False), utcnow_iso()),
    )


def list_growth(conn: sqlite3.Connection, pet_id: str, limit: int = 20) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM growth_log WHERE pet_id=? ORDER BY id DESC LIMIT ?",
        (pet_id, limit),
    ).fetchall()
    return [
        {
            "event": row["event_type"],
            "xp": row["xp_delta"],
            "detail": _loads(row["detail"], {}),
            "at": row["created_at"],
        }
        for row in rows
    ]


# ---------- 仓库快照缓存 ----------

def get_snapshot_cache(conn: sqlite3.Connection, cache_key: str, ttl: int) -> dict[str, Any] | None:
    import time

    row = conn.execute("SELECT payload, fetched_at FROM snapshots WHERE cache_key=?", (cache_key,)).fetchone()
    if row is None:
        return None
    if time.time() - float(row["fetched_at"]) > ttl:
        return None
    return _loads(row["payload"], None)


def put_snapshot_cache(conn: sqlite3.Connection, cache_key: str, platform: str,
                       full_name: str, payload: dict[str, Any]) -> None:
    import time

    conn.execute(
        "INSERT INTO snapshots (cache_key, platform, full_name, fetched_at, payload) VALUES (?,?,?,?,?) "
        "ON CONFLICT(cache_key) DO UPDATE SET fetched_at=excluded.fetched_at, payload=excluded.payload",
        (cache_key, platform, full_name, time.time(), json.dumps(payload, ensure_ascii=False)),
    )


def purge_expired_snapshots(conn: sqlite3.Connection, ttl: int) -> int:
    import time

    cur = conn.execute("DELETE FROM snapshots WHERE fetched_at < ?", (time.time() - max(ttl * 4, 86400),))
    return cur.rowcount
