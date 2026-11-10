"""剧本包注册表：读取 src/story/packs/<id>/meta.json。

一个「剧本包」= 一条完整路线（story.ink）+ 一套角色 + 一套台词兜底 + 一份世界观设定。
前端按 pack id 装载路线；后端只需要其中的元信息：
  · 系统剧本的方案卡（meta.variants，含 {pet} / {boss} 占位符）
  · 台词生成时要注入的世界观与文风（meta.world / meta.style）
  · 结局标题（meta.endings）

元信息直接读磁盘上的 meta.json —— 它和前端构建产物 packs.js 同源，
不需要额外一步构建，也不会出现两份内容对不上的情况。
目录不存在时（打包部署只带 dist/）退回内置的 default 模板，功能不挂。
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

# backend/gitmon_api/story_packs.py → 仓库根
_ROOT = Path(__file__).resolve().parents[2]
_PACKS_DIR = Path(os.environ.get("GITMON_STORY_PACKS_DIR") or (_ROOT / "src" / "story" / "packs"))

DEFAULT_PACK = "default"

# 内置兜底：连 src/story/packs 都读不到时，至少还能给出一张占位方案。
# 与 default 包的 meta.json 保持同构（仓可梦占位），内容以后随包一起定稿。
_FALLBACK_META: dict[str, Any] = {
    "id": DEFAULT_PACK,
    "title": "仓可梦",
    "tagline": "占位包 · 主线待定稿",
    "world": "",
    "style": "",
    "bgs": {},
    "endings": {},
    "variants": [
        {
            "title": "《仓可梦（占位）》",
            "logline": "仓可梦主线的占位方案：先把系统剧本的位置占住，内容待定稿。",
            "bridge": "",
            "beats": [
                "开局：（占位）",
                "中段：（占位）",
                "收束：（占位）",
            ],
        },
    ],
}

_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_STAMP: dict[str, float] = {}


def _stamp(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def _load_dir() -> dict[str, dict[str, Any]]:
    """读 packs/ 下所有含 meta.json 的子目录。文件改动后会自动重载。"""
    out: dict[str, dict[str, Any]] = {}
    if not _PACKS_DIR.is_dir():
        return out
    for entry in sorted(_PACKS_DIR.iterdir()):
        meta_path = entry / "meta.json"
        if not entry.is_dir() or not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(meta, dict):
            continue
        pack_id = str(meta.get("id") or entry.name).strip()
        if not pack_id:
            continue
        meta.setdefault("id", pack_id)
        out[pack_id] = meta
    return out


def _registry() -> dict[str, dict[str, Any]]:
    """带 mtime 缓存的注册表：改了 meta.json 不重启后端也能生效。"""
    if not _PACKS_DIR.is_dir():
        return _CACHE
    stamp = 0.0
    for entry in sorted(_PACKS_DIR.iterdir()) if _PACKS_DIR.is_dir() else []:
        meta_path = entry / "meta.json"
        if meta_path.is_file():
            stamp = max(stamp, _stamp(meta_path))
    if _CACHE and _CACHE_STAMP.get("__stamp__") == stamp:
        return _CACHE
    loaded = _load_dir()
    if not loaded:
        return _CACHE
    _CACHE.clear()
    _CACHE.update(loaded)
    _CACHE_STAMP["__stamp__"] = stamp
    return _CACHE


def list_packs() -> list[dict[str, Any]]:
    """剧本包清单（给界面上的「系统剧本」选择器用）。"""
    packs = _registry()
    if not packs:
        packs = {DEFAULT_PACK: _FALLBACK_META}
    out = []
    for pack_id, meta in packs.items():
        out.append({
            "id": pack_id,
            "title": str(meta.get("title") or pack_id),
            "tagline": str(meta.get("tagline") or ""),
            "world": str(meta.get("world") or ""),
            "style": str(meta.get("style") or ""),
            "endings": dict(meta.get("endings") or {}),
            "variant_count": len(meta.get("variants") or []),
        })
    # default 排最后：它是 AI / 自定义剧本的兜底路线，不是给玩家挑的正经剧本
    out.sort(key=lambda item: (item["id"] == DEFAULT_PACK, item["id"]))
    return out


def get_pack(pack_id: str | None) -> dict[str, Any]:
    """取一个剧本包的元信息；找不到就退回 default。"""
    packs = _registry()
    key = str(pack_id or "").strip()
    if key in packs:
        return packs[key]
    if packs:
        return packs.get(DEFAULT_PACK) or next(iter(packs.values()))
    return _FALLBACK_META


def has_pack(pack_id: str | None) -> bool:
    return str(pack_id or "").strip() in _registry()


def get_characters(pack_id: str | None) -> dict[str, Any]:
    """取一个包的角色表（characters.json）。

    角色表是包内容的一部分，和 meta.json 同源同目录。立绘声明（art / face）
    也在里面 —— 界面按这个决定要不要画角色的图。
    目录不存在时（打包部署只带 dist/）返回空表，功能不挂。
    """
    key = str(pack_id or "").strip()
    if key not in _registry():
        key = DEFAULT_PACK
    path = _PACKS_DIR / key / "characters.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def resolve_pack_id(pack_id: str | None) -> str:
    """把请求里的 pack id 收口成一个真实存在的包 id。

    包被改名 / 删除时不能让上层拿到一个不存在的 id —— 那会让回包里报着
    「douma」却装着 default 的方案，看起来像换包成功，其实是串包。
    """
    key = str(pack_id or "").strip()
    if key in _registry():
        return key
    return DEFAULT_PACK


def _render(text: str, pet_name: str, boss_name: str) -> str:
    """把 {pet} / {boss} 占位符换成真实的项目名。"""
    return (str(text or "")
            .replace("{pet}", pet_name)
            .replace("{boss}", boss_name))


def pack_scripts(pack_id: str | None, pet_name: str, boss_name: str) -> list[dict[str, Any]]:
    """某个剧本包提供的系统剧本方案卡（界面上给玩家三选一的那几张）。"""
    meta = get_pack(pack_id)
    items: list[dict[str, Any]] = []
    for raw in (meta.get("variants") or [])[:3]:
        if not isinstance(raw, dict):
            continue
        title = _render(str(raw.get("title") or ""), pet_name, boss_name).strip()
        logline = _render(str(raw.get("logline") or raw.get("brief") or ""), pet_name, boss_name).strip()
        if not (title and logline):
            continue
        beats = [_render(str(b), pet_name, boss_name).strip()
                 for b in (raw.get("beats") or []) if str(b).strip()][:3]
        items.append({
            "title": title[:40],
            "logline": logline[:160],
            "bridge": _render(str(raw.get("bridge") or ""), pet_name, boss_name).strip()[:160],
            "beats": [b[:160] for b in beats],
            "strong_fit": raw.get("strong_fit") is not False,
            # 系统剧本一律带 fallback 标记：界面上要能看出「这条没用上调研」
            "fallback": True,
            # 这个方案属于哪个剧本包 —— 正片要按它装载对应的路线
            "pack": meta.get("id") or DEFAULT_PACK,
        })
    return items


def pack_world(pack_id: str | None) -> tuple[str, str]:
    """台词生成时注入的世界观与文风。"""
    meta = get_pack(pack_id)
    return str(meta.get("world") or ""), str(meta.get("style") or "")


def ending_title(pack_id: str | None, ending_id: str) -> str:
    """结局标题：先查剧本包的表，查不到退回通用表。"""
    meta = get_pack(pack_id)
    titles = meta.get("endings") or {}
    title = str(titles.get(ending_id) or "").strip()
    return title or ending_id


def clean_pack_id(value: Any) -> str:
    """把外部传来的 pack id 收口成安全值（只允许字母数字下划线短横）。"""
    text = str(value or "").strip()
    if not text:
        return DEFAULT_PACK
    text = re.sub(r"[^A-Za-z0-9_-]", "", text)[:40]
    return text or DEFAULT_PACK
