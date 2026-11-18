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
    battles           INTEGER NOT NULL DEFAULT 0,
    wins              INTEGER NOT NULL DEFAULT 0,
    client_state      TEXT NOT NULL DEFAULT '{}',
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

-- 登录授权的用户与浏览器会话（令牌加密后落库，密钥见 GITMON_SECRET）
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    provider      TEXT NOT NULL,
    login         TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    avatar        TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    token_cipher  TEXT NOT NULL DEFAULT '',
    refresh_cipher TEXT NOT NULL DEFAULT '',
    scopes        TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL DEFAULT 'oauth',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_login_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login ON users(provider, login);

CREATE TABLE IF NOT EXISTS sessions (
    sid_hash   TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 剧情模式：一条 active 线 / 一个 owner（C1）。部分唯一索引是硬约束，不是前端按钮。
CREATE TABLE IF NOT EXISTS story_runs (
    id               TEXT PRIMARY KEY,
    owner_key        TEXT NOT NULL,
    pet_key          TEXT NOT NULL,
    pet_id           TEXT NOT NULL DEFAULT '',
    pet_name         TEXT NOT NULL DEFAULT '',
    script_title     TEXT NOT NULL,
    script_brief     TEXT NOT NULL DEFAULT '',
    script_beats     TEXT NOT NULL DEFAULT '[]',
    script_source    TEXT NOT NULL DEFAULT 'ai',
    script_pack      TEXT NOT NULL DEFAULT 'default',
    track            TEXT NOT NULL DEFAULT '',
    boss             TEXT NOT NULL DEFAULT '{}',
    rationale        TEXT NOT NULL DEFAULT '',
    queries          TEXT NOT NULL DEFAULT '[]',
    selection_source TEXT NOT NULL DEFAULT 'ai',
    seed             INTEGER NOT NULL DEFAULT 0,
    gap              REAL NOT NULL DEFAULT 0,
    chapter_count    INTEGER NOT NULL DEFAULT 3,
    scene_id         TEXT NOT NULL DEFAULT 'prologue',
    ink_state        TEXT NOT NULL DEFAULT '',
    vars             TEXT NOT NULL DEFAULT '{}',
    visited          TEXT NOT NULL DEFAULT '[]',
    history          TEXT NOT NULL DEFAULT '[]',
    rollback         TEXT NOT NULL DEFAULT '',
    route            TEXT NOT NULL DEFAULT '',
    ending           TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'active',
    step             INTEGER NOT NULL DEFAULT 0,
    created_at       REAL NOT NULL,
    updated_at       REAL NOT NULL,
    closed_at        REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_story_active ON story_runs(owner_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_story_owner ON story_runs(owner_key, created_at DESC);

CREATE TABLE IF NOT EXISTS story_saves (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL,
    slot       INTEGER NOT NULL,
    scene_id   TEXT NOT NULL,
    vars       TEXT NOT NULL,
    visited    TEXT NOT NULL,
    ink_state  TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    UNIQUE (run_id, slot)
);

CREATE TABLE IF NOT EXISTS story_endings (
    id          TEXT PRIMARY KEY,
    owner_key   TEXT NOT NULL,
    ending_id   TEXT NOT NULL,
    run_id      TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    unlocked_at REAL NOT NULL,
    UNIQUE (owner_key, ending_id)
);

-- 任务模式：一次任务实例（领取 → 复审 → 发奖）。列定义见 docs/QUEST.md §7。
-- payload 存出题时的事实快照（含基线值），evidence 存每次复审的证据链。
CREATE TABLE IF NOT EXISTS quest_runs (
    id           TEXT PRIMARY KEY,
    owner_key    TEXT NOT NULL,
    pet_key      TEXT NOT NULL,
    goal_key     TEXT NOT NULL,
    verify_level TEXT NOT NULL DEFAULT 'L1',
    payload      TEXT NOT NULL DEFAULT '{}',
    issued_at    REAL NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'fixing',
    evidence     TEXT NOT NULL DEFAULT '[]',
    reward       TEXT NOT NULL DEFAULT '{}',
    verify_at    REAL
);
-- 同一个仓库 + 同一种任务，一天只能领一次（硬约束，不靠前端按钮）。
-- 注意：issued_at 是 REAL 时间戳，SQLite 的 date() 不认 UNIX 纪元秒，
-- 必须带 'unixepoch' 修饰符，否则表达式恒为 NULL、唯一索引形同虚设。
-- 这里只能用 'unixepoch'，不能加 'localtime'：带时区换算的 date() 在 SQLite
-- 里是非确定性函数，写进索引后 INSERT 会直接报 "non-deterministic use of date()"。
-- 按本地自然日切分由业务层用纪元秒区间做（quest._today_range）。
CREATE UNIQUE INDEX IF NOT EXISTS ux_quest_goal
    ON quest_runs(owner_key, pet_key, goal_key, date(issued_at, 'unixepoch'));
CREATE INDEX IF NOT EXISTS idx_quest_owner ON quest_runs(owner_key, issued_at DESC);

-- 背包：物品余额（货币与道具共用一张表，item_key 相同即叠加）
CREATE TABLE IF NOT EXISTS inventory_items (
    owner_key  TEXT NOT NULL,
    item_key   TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL,
    PRIMARY KEY (owner_key, item_key)
);

-- 背包：流水。source_key 保证同一笔奖励只发一次；offer_key 用于统计限购次数。
CREATE TABLE IF NOT EXISTS inventory_ledger (
    id         TEXT PRIMARY KEY,
    owner_key  TEXT NOT NULL,
    item_key   TEXT NOT NULL,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL DEFAULT '',
    source_key TEXT NOT NULL DEFAULT '',
    offer_key  TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_owner ON inventory_ledger(owner_key, created_at DESC);
-- 部分唯一索引：只对带 source_key 的流水生效（空 source_key 表示不限次的手动流水）
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_source
    ON inventory_ledger(owner_key, source_key, item_key) WHERE source_key <> '';
"""


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# 老库平滑升级：CREATE TABLE IF NOT EXISTS 不会补列，这里补一次
_ADDED_COLUMNS: dict[str, tuple[tuple[str, str], ...]] = {
    "pets": (
        ("foundation", "REAL NOT NULL DEFAULT 0"),
        ("foundation_dims", "TEXT NOT NULL DEFAULT '{}'"),
        ("traits", "TEXT NOT NULL DEFAULT '[]'"),
        ("ai_rate", "REAL"),
        ("battles", "INTEGER NOT NULL DEFAULT 0"),
        ("wins", "INTEGER NOT NULL DEFAULT 0"),
        ("client_state", "TEXT NOT NULL DEFAULT '{}'"),
    ),
    # 剧本三拍：正片每一屏的台词都要照它写
    # 剧本包：决定正片跑哪条路线（斗码苍穹等），老数据按 default 兜底
    "story_runs": (
        ("script_beats", "TEXT NOT NULL DEFAULT '[]'"),
        ("script_pack", "TEXT NOT NULL DEFAULT 'default'"),
    ),
    # Gitee OAuth 的 access_token 只有 1 天，refresh_token 必须一起存下来
    "users": (("refresh_cipher", "TEXT NOT NULL DEFAULT ''"),),
}


def _migrate(conn: sqlite3.Connection) -> None:
    for table, columns in _ADDED_COLUMNS.items():
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for name, ddl in columns:
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")

    # 索引表达式改过就得重建：CREATE UNIQUE INDEX IF NOT EXISTS 不会替换旧索引。
    # 这里比对 sqlite_master 里记录的建表语句，表达式不同就删了重建。
    # 注意：迁移用的连接没设 row_factory，只能按下标取列。
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='ux_quest_goal'"
    ).fetchone()
    if row is not None and "date(issued_at, 'unixepoch')" not in (row[0] or "").replace('"', ""):
        conn.execute("DROP INDEX IF EXISTS ux_quest_goal")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_quest_goal "
            "ON quest_runs(owner_key, pet_key, goal_key, date(issued_at, 'unixepoch'))"
        )


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
    pet["client_state"] = _loads(pet.get("client_state"), {})
    pet["battles"] = int(pet.get("battles") or 0)
    pet["wins"] = int(pet.get("wins") or 0)
    pet["degraded"] = bool(pet.get("degraded"))
    return pet


def save_pet(conn: sqlite3.Connection, pet: dict[str, Any]) -> None:
    payload = dict(pet)
    json_keys = ("quality_dims", "foundation_dims", "stats", "skills", "traits", "metrics", "notes", "client_state")
    for key in json_keys:
        default = {} if key in ("quality_dims", "foundation_dims", "metrics", "client_state") else []
        payload[key] = json.dumps(payload.get(key, default), ensure_ascii=False, separators=(",", ":"))
    payload["degraded"] = 1 if payload.get("degraded") else 0
    payload["battles"] = int(payload.get("battles") or 0)
    payload["wins"] = int(payload.get("wins") or 0)
    columns = [
        "id", "platform", "owner", "repo", "full_name", "owner_key", "seed", "sprite_seed",
        "element_key", "element_secondary", "species_key", "quality", "quality_score",
        "quality_dims", "engineering_score", "level", "exp", "evolution_stage", "stats",
        "skills", "hp", "foundation", "foundation_dims", "traits", "ai_rate", "bond",
        "status", "metrics", "notes", "degraded", "description",
        "battles", "wins", "client_state",
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
