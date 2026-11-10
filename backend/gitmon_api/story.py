"""剧情模式：选 Boss / 剧本、建线、状态持久化、结局收集。

分工（docs/STORY.md §4.2-F）：
  · 路线 / 场景 / 选项 / 结局：前端 inkjs 执行 src/story/story.ink，后端只裁决状态与存档
  · Boss 检索 / 剧本 / 台词：后端代调 GitHub Search 与用户绑定的模型；模型不可用一律走规则兜底
  · 一个账号同时只有一条 active 线（C1，数据库唯一索引保证）
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import re
import time
import uuid
from typing import Any

import httpx

from . import engine, llm as llm_mod, services
from .db import db
from .errors import ScanError
from .repo import InvalidRepo

OPENING_CLOSED = {"cleared", "abandoned"}

ENDING_TITLES = {
    "ending_trust": "内应线 · 有人替你开门",
    "ending_scarred": "伤痕线 · 一路硬扛",
    "ending_alone": "独行线 · 无人送行",
    "ending_standard": "正线 · 各走各路",
}

# 断网 / Search 限流时的兜底池：按语言给几个真实存在的顶级仓库
FALLBACK_POOL = {
    "typescript": ["vuejs/core", "facebook/react", "sveltejs/svelte"],
    "javascript": ["facebook/react", "vercel/next.js", "vuejs/core"],
    "python": ["django/django", "pytorch/pytorch", "pandas-dev/pandas"],
    "rust": ["rust-lang/rust", "tokio-rs/tokio", "serde-rs/serde"],
    "go": ["golang/go", "kubernetes/kubernetes", "prometheus/prometheus"],
    "java": ["spring-projects/spring-boot", "apache/kafka", "elastic/elasticsearch"],
    "c": ["torch/torch7", "redis/redis", "curl/curl"],
    "c++": ["tensorflow/tensorflow", "opencv/opencv", "apache/arrow"],
    "html": ["mdn/content", "whatwg/html", "web-platform-tests/wpt"],
    "default": ["vuejs/core", "golang/go", "rust-lang/rust"],
}


class StoryError(Exception):
    def __init__(self, message: str, *, status_code: int = 400, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.hint = hint


# ---------------------------------------------------------------- 基础工具

def _loads(raw: Any, fallback: Any) -> Any:
    if raw in (None, ""):
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def _dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"))


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def combat_power(pet: dict[str, Any]) -> int:
    """与前端 src/engine.js computeStats 同口径：六维去 HP 再加 60% HP，乘等级系数。"""
    stats = pet.get("stats") or []
    values = {str(s.get("name")): int(s.get("value") or 0) for s in stats if isinstance(s, dict)}
    if not values:
        return 0
    hp = values.get("HP", 0)
    total = sum(values.values())
    offense = total - hp + round(hp * 0.6)
    level = _clamp(int(pet.get("level") or 1), 1, 999)
    return int(offense * (0.5 + level / 200))


def median(values: list[float]) -> float:
    ordered = sorted(v for v in values if v)
    if not ordered:
        return 0.0
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2


def chapter_count_for(gap: float) -> int:
    if gap <= 1.2:
        return 3
    if gap <= 2.0:
        return 4
    if gap <= 3.5:
        return 5
    return 6


def _seed(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(time.time()) & 0x7FFFFFFF


def _json_from_model(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        raise StoryError("模型没有返回可解析的 JSON", status_code=502, hint="换一个更稳的模型再试") from None
    if not isinstance(data, dict):
        raise StoryError("模型返回结构不对", status_code=502)
    return data


def _split_repo(full_name: str) -> tuple[str, str]:
    text = str(full_name or "").strip()
    if "/" not in text:
        raise StoryError("仓库要用 owner/repo 形式", hint="例如 vuejs/core")
    owner, _, repo = text.partition("/")
    return owner.strip(), repo.strip()


# ---------------------------------------------------------------- 表读写

RUN_COLUMNS = (
    "id", "owner_key", "pet_key", "pet_id", "pet_name", "script_title", "script_brief",
    "script_source", "track", "boss", "rationale", "queries", "selection_source", "seed",
    "gap", "chapter_count", "scene_id", "ink_state", "vars", "visited", "history", "rollback",
    "route", "ending", "status", "step", "created_at", "updated_at", "closed_at",
)


def run_to_api(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    run = dict(row)
    for key in ("boss", "queries", "vars", "visited", "history"):
        run[key] = _loads(run.get(key), {} if key in ("boss", "vars") else [])
    return run


def active_run(conn: Any, owner_key: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM story_runs WHERE owner_key=? AND status='active' ORDER BY created_at DESC LIMIT 1",
        (owner_key,),
    ).fetchone()
    return run_to_api(row)


def latest_run(conn: Any, owner_key: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM story_runs WHERE owner_key=? ORDER BY created_at DESC LIMIT 1",
        (owner_key,),
    ).fetchone()
    return run_to_api(row)


def list_saves(conn: Any, run_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT slot, scene_id, vars, visited, created_at FROM story_saves WHERE run_id=? ORDER BY slot",
        (run_id,),
    ).fetchall()
    return [
        {
            "slot": row["slot"],
            "scene_id": row["scene_id"],
            "vars": _loads(row["vars"], {}),
            "visited": _loads(row["visited"], []),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def _get_run(conn: Any, run_id: str, owner_key: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM story_runs WHERE id=?", (run_id,)).fetchone()
    run = run_to_api(row)
    if run is None or run["owner_key"] != owner_key:
        raise StoryError("剧情线不存在", status_code=404)
    return run


# ---------------------------------------------------------------- GitHub 检索

async def _github_search(query: str, token: str, per_page: int = 20) -> list[dict[str, Any]]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "GitMon/0.2"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0), trust_env=False) as client:
            resp = await client.get(
                "https://api.github.com/search/repositories",
                params={"q": query, "sort": "stars", "order": "desc", "per_page": per_page},
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise StoryError(f"GitHub 检索失败：{exc}", status_code=502, hint="检查网络或稍后重试") from None
    if resp.status_code in (403, 429):
        raise StoryError("GitHub Search 限流了", status_code=502, hint="稍后再试，或配置 GitHub Token 提高额度")
    if resp.status_code >= 400:
        raise StoryError(f"GitHub Search 返回 {resp.status_code}", status_code=502)
    items = (resp.json() or {}).get("items") or []
    return [
        {
            "full_name": item.get("full_name", ""),
            "stars": int(item.get("stargazers_count") or 0),
            "language": item.get("language") or "",
            "description": (item.get("description") or "")[:160],
            "topics": (item.get("topics") or [])[:8],
            "archived": bool(item.get("archived")),
            "fork": bool(item.get("fork")),
            "pushed_at": item.get("pushed_at") or "",
        }
        for item in items
        if item.get("full_name") and not item.get("archived") and not item.get("fork")
    ]


async def _search_many(queries: list[str], token: str, seed: int) -> list[dict[str, Any]]:
    results = await asyncio.gather(*(_github_search(q, token) for q in queries[:6]), return_exceptions=True)
    pool: dict[str, dict[str, Any]] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        for item in result:
            pool.setdefault(item["full_name"].lower(), item)
    items = [item for item in pool.values() if item["description"]]
    random.Random(seed).shuffle(items)
    items.sort(key=lambda item: item["stars"], reverse=True)
    return items[:24]


def _pet_language(pet: dict[str, Any]) -> str:
    language = str(pet.get("language") or "").strip()
    if language:
        return language
    languages = pet.get("languages") or []
    if isinstance(languages, dict):
        languages = list(languages.keys())
    if languages and isinstance(languages[0], dict):
        return str(languages[0].get("name") or "").strip()
    return str(languages[0]).strip() if languages else ""


def _rule_queries(pet: dict[str, Any]) -> list[str]:
    language = _pet_language(pet)
    topics = [str(t).strip() for t in (pet.get("topics") or []) if str(t).strip()]
    queries: list[str] = []
    if language:
        queries.append(f"language:{language} stars:>5000")
    for topic in topics[:3]:
        queries.append(f"topic:{topic} stars:>3000")
    if not queries:
        queries.append("stars:>20000")
    return queries


# ---------------------------------------------------------------- 仓库扫描与判定

def scan_repo_ref(full_name: str, platform: str, token: str) -> Any:
    from .repo import ref_from_parts

    owner, repo = _split_repo(full_name)
    ref = ref_from_parts(platform, owner, repo)
    with db.connect() as conn:
        return services.scan_snapshot(conn, ref, token=token)


def boss_card(full_name: str, token: str, *, platform: str = "github", reason: str = "") -> dict[str, Any]:
    """扫一个仓库并判成 Boss 卡：星级 / 语言 / 等级 / 战力 + 判定快照。"""
    try:
        snapshot = scan_repo_ref(full_name, platform, token)
    except ScanError as exc:
        raise StoryError(exc.message, status_code=400, hint=exc.hint or "确认仓库存在且是公开仓库") from None
    except InvalidRepo as exc:
        raise StoryError(str(exc), status_code=400, hint="仓库要用 owner/repo 形式") from None
    if snapshot is None:
        raise StoryError("仓库不存在或没有权限访问", status_code=404, hint="换成公开仓库再试")
    if getattr(snapshot, "archived", False):
        raise StoryError("该仓库已归档，不能作为 Boss", status_code=400)
    verdict = engine.judge(snapshot)
    tier = _tier_from_level(int(verdict.get("level") or 1))
    card = {
        "full_name": snapshot.ref.full_name,
        "platform": snapshot.ref.platform,
        "stars": int(snapshot.stars or 0),
        "language": snapshot.language or "",
        "description": (snapshot.description or "")[:160],
        "tier": tier,
        "level": int(verdict.get("level") or 1),
        "cp": combat_power(verdict),
        "archived": bool(snapshot.archived),
        "reason": reason,
        "snapshot": snapshot.to_dict(),
        "verdict": {
            "element_key": verdict.get("element_key"),
            "element_secondary": verdict.get("element_secondary"),
            "species_key": verdict.get("species_key"),
            "quality": verdict.get("quality"),
            "stats": verdict.get("stats"),
            "skills": verdict.get("skills"),
            "hp": verdict.get("hp"),
            "level": verdict.get("level"),
            "sprite_seed": verdict.get("sprite_seed"),
            "seed": verdict.get("seed"),
        },
    }
    # 建线 / 自选校验复用同一张判定卡，避免重复扫描
    _SNAPSHOT_CACHE[card["full_name"].lower()] = card
    return card


def _tier_from_level(level: int) -> str:
    if level >= 500:
        return "SSR"
    if level >= 200:
        return "SR"
    if level >= 50:
        return "R"
    return "N"


# ---------------------------------------------------------------- 模型调用

def _llm_config(llm_in: dict[str, Any] | None) -> dict[str, str]:
    data = llm_in or {}
    return {
        "baseUrl": str(data.get("baseUrl") or "").strip(),
        "apiKey": str(data.get("apiKey") or "").strip(),
        "model": str(data.get("model") or "").strip(),
    }


async def _call_model(llm_in: dict[str, Any] | None, system: str, user: str, *,
                      timeout: float = 25.0, max_tokens: int = 1200) -> str:
    cfg = _llm_config(llm_in)
    if not cfg["apiKey"]:
        raise StoryError("未绑定模型", status_code=403, hint="开启高级模式并绑定 API Key 后再试")
    return await llm_mod.chat_completion(
        base_url=cfg["baseUrl"] or "https://api.openai.com/v1",
        api_key=cfg["apiKey"],
        model=cfg["model"] or "gpt-4o-mini",
        system=system,
        user=user,
        timeout=timeout,
        max_tokens=max_tokens,
    )


def _pet_profile(pet: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": pet.get("fullName") or pet.get("name") or "",
        "platform": pet.get("platform") or "github",
        "description": str(pet.get("description") or "")[:240],
        "level": pet.get("level"),
        "quality": pet.get("quality"),
        "element": pet.get("element_key"),
        "cp": combat_power(pet),
        "language": _pet_language(pet),
        "topics": (pet.get("topics") or [])[:6],
    }


async def _boss_queries(pet: dict[str, Any], llm_in: dict[str, Any] | None) -> tuple[list[str], str]:
    """第一步：模型读主角画像，给出一组 GitHub 检索条件。"""
    profile = _pet_profile(pet)
    system = (
        "你是 GitHub 技术选型顾问。只输出 JSON，不要解释，不要 Markdown。"
        "目标：为下面这个项目找出 3 个同赛道、同行业的顶级开源项目作为对手。"
    )
    user = (
        f"主角项目画像：{json.dumps(profile, ensure_ascii=False)}\n\n"
        "请先判断它属于哪个技术赛道（track，中文短词），再给出 3-6 条 GitHub Search 检索条件（queries）。"
        "条件要能搜到同赛道的中大型项目，例如 language:TypeScript topic:framework stars:>10000。\n"
        '严格输出：{"track": "前端框架", "queries": ["...", "..."]}'
    )
    try:
        data = _json_from_model(await _call_model(llm_in, system, user, timeout=20, max_tokens=500))
        track = str(data.get("track") or "").strip()[:30]
        queries = [str(q).strip() for q in (data.get("queries") or []) if str(q).strip()][:6]
        if not queries:
            raise StoryError("模型没有给出检索条件", status_code=502)
        return queries, track
    except StoryError:
        raise
    except Exception:
        raise StoryError("模型没有给出检索条件", status_code=502) from None


async def _pick_bosses(pet: dict[str, Any], track: str, candidates: list[dict[str, Any]],
                       llm_in: dict[str, Any] | None, seed: int) -> tuple[list[dict[str, Any]], str]:
    """第二步：模型从真实检索结果里挑 3 只，并写理由。"""
    if not candidates:
        raise StoryError("没有搜到候选仓库", status_code=502, hint="换个网络环境或稍后再试")
    compact = [
        {"full_name": c["full_name"], "stars": c["stars"], "language": c["language"],
         "description": c["description"]}
        for c in candidates[:20]
    ]
    system = (
        "你是 GitHub 技术选型顾问。只输出 JSON，不要解释，不要 Markdown。"
        "只能从给定的候选清单里挑选，不能编造仓库名。"
    )
    user = (
        f"主角项目：{json.dumps(_pet_profile(pet), ensure_ascii=False)}\n"
        f"赛道：{track or '未判定'}\n"
        f"候选清单：{json.dumps(compact, ensure_ascii=False)}\n\n"
        "挑 3 个最适合当对手的项目，三条方向要有区分（例如正面竞争 / 生态压制 / 范式挑战）。"
        "每只给一句 reason（≤40 字），再给一段 rationale 总述（≤120 字，回答为什么是这三只）。\n"
        '严格输出：{"bosses": [{"full_name": "...", "reason": "..."}], "rationale": "..."}'
    )
    try:
        data = _json_from_model(await _call_model(llm_in, system, user, timeout=30, max_tokens=900))
    except StoryError:
        raise
    except Exception:
        raise StoryError("模型挑选失败", status_code=502) from None

    by_name = {c["full_name"].lower(): c for c in candidates}
    picked: list[dict[str, Any]] = []
    for item in data.get("bosses") or []:
        name = str(item.get("full_name") or "").strip()
        hit = by_name.get(name.lower())
        if hit and all(p["full_name"].lower() != hit["full_name"].lower() for p in picked):
            picked.append({**hit, "reason": str(item.get("reason") or "")[:80]})
    for item in candidates:
        if len(picked) >= 3:
            break
        if all(p["full_name"].lower() != item["full_name"].lower() for p in picked):
            picked.append({**item, "reason": item.get("description") or "按星标与赛道接近度补齐"})
    rationale = str(data.get("rationale") or "").strip()[:240]
    return picked[:3], rationale


def _rule_rationale(pet: dict[str, Any], bosses: list[dict[str, Any]]) -> str:
    name = pet.get("fullName") or pet.get("name") or "你的项目"
    if not bosses:
        return "按语言与星标量级挑出的三个对手。"
    names = "、".join(b["full_name"].split("/")[-1] for b in bosses)
    return f"{name} 的三个方向：{names}。它们都在同一赛道里，量级依次递进，选谁就决定这条线要打多大的仗。"


async def preview(pet: dict[str, Any], llm_in: dict[str, Any] | None, *, seed: int, token: str,
                  refresh: bool = False) -> dict[str, Any]:
    """选 Boss 预演：不落库。模型不可用时走规则检索。"""
    if not pet.get("aiEvaluated"):
        raise StoryError("该精灵还没有通过 AI 认证", status_code=403, hint="先在高级模式里完成一次模型评测")

    cache_key = f"{pet.get('platform')}/{pet.get('fullName')}"
    cached = _PREVIEW_CACHE.get(cache_key)
    if cached and not refresh and time.time() - cached[0] < 600:
        return cached[1]

    selection_source = "ai"
    queries: list[str] = []
    track = ""
    if _llm_config(llm_in)["apiKey"]:
        try:
            queries, track = await _boss_queries(pet, llm_in)
        except StoryError:
            queries = _rule_queries(pet)
            selection_source = "rule"
    else:
        queries = _rule_queries(pet)
        selection_source = "rule"

    try:
        candidates = await _search_many(queries, token, seed)
    except StoryError:
        candidates = []
    if len(candidates) < 3:
        # 放宽条件重搜一次
        try:
            candidates = await _search_many([q.replace(" pushed:>2026-01-01", "") for q in queries], token, seed)
        except StoryError:
            candidates = candidates

    picked: list[dict[str, Any]] = []
    rationale = ""
    if len(candidates) >= 3 and selection_source == "ai":
        try:
            picked, rationale = await _pick_bosses(pet, track, candidates, llm_in, seed)
        except StoryError:
            selection_source = "rule"
    if not picked:
        picked = [{**c, "reason": c.get("description") or "同语言、同量级"} for c in candidates[:3]]
        if not picked:
            # GitHub 不可达：退回内置池，仍然尝试扫描真实仓库
            language = str(pet.get("language") or "").lower()
            pool = FALLBACK_POOL.get(language, FALLBACK_POOL["default"])
            selection_source = "fallback_pool"
            for full_name in pool:
                try:
                    snapshot = scan_repo_ref(full_name, "github", token)
                except Exception:
                    continue
                picked.append({
                    "full_name": snapshot.ref.full_name,
                    "stars": int(snapshot.stars or 0),
                    "language": snapshot.language or "",
                    "description": (snapshot.description or "")[:160],
                    "topics": [],
                    "reason": "离线兜底池",
                })
                if len(picked) >= 3:
                    break
            rationale = "GitHub 检索不可用，按内置的同语言顶级项目兜底。"
    if not picked:
        raise StoryError("候选不足 3 只", status_code=502, hint="检查网络 / GitHub 配额后点「换一批」")

    bosses = []
    for item in picked[:3]:
        try:
            card = boss_card(item["full_name"], token, reason=item.get("reason") or "")
        except StoryError:
            continue
        bosses.append({
            "full_name": card["full_name"],
            "stars": card["stars"],
            "language": card["language"],
            "description": card["description"],
            "tier": card["tier"],
            "level": card["level"],
            "cp": card["cp"],
            "reason": item.get("reason") or "",
        })
    if len(bosses) < 3:
        raise StoryError("Boss 判定失败，候选不足 3 只", status_code=502, hint="点「换一批」重试")

    if not rationale:
        rationale = _rule_rationale(pet, bosses)
    result = {
        "track": track or "未判定",
        "bosses": bosses,
        "rationale": rationale,
        "queries": queries,
        "selection_source": selection_source,
        "seed": seed,
    }
    _PREVIEW_CACHE[cache_key] = (time.time(), result)
    return result


_PREVIEW_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_SNAPSHOT_CACHE: dict[str, dict[str, Any]] = {}
_TEXT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


# ---------------------------------------------------------------- 剧本

def _script_fallback(pet: dict[str, Any], boss: dict[str, Any]) -> list[dict[str, Any]]:
    pet_name = pet.get("fullName") or pet.get("name") or "你的项目"
    boss_name = str(boss.get("full_name") or boss.get("fullName") or "对手").split("/")[-1]
    return [
        {
            "title": f"《越级：{boss_name}之上》",
            "logline": f"{pet_name} 想在最强的赛道里留下名字，{boss_name} 挡在唯一的路口。",
            "beats": [
                f"开局：{pet_name} 在榜单末尾被点名，对面是 {boss_name} 的拥趸。",
                "中段：一次基准测试翻车，主角被迫重写最核心的那部分。",
                f"收束：正面撞上 {boss_name}，输赢都算数。",
            ],
        },
        {
            "title": "《从零到榜一》",
            "logline": f"没人看好 {pet_name}，直到它把 {boss_name} 的护城河拆成一段段可复现的基准。",
            "beats": [
                f"开局：{boss_name} 的生态位看起来不可撼动。",
                "中段：主角放弃正面硬拼，从最不起眼的工具链下手。",
                f"收束：{boss_name} 第一次正面回应这个后来者。",
            ],
        },
        {
            "title": "《借来的王座》",
            "logline": f"{pet_name} 借了 {boss_name} 的规则上位，最后必须把规则改回来。",
            "beats": [
                f"开局：{pet_name} 被当作 {boss_name} 的模仿者。",
                "中段：一站站补测试、补文档，把「像」变成「能打」。",
                f"收束：与 {boss_name} 的终局，决定这个名字归谁。",
            ],
        },
    ]


async def scripts(pet: dict[str, Any], boss: dict[str, Any], llm_in: dict[str, Any] | None) -> dict[str, Any]:
    fallback = _script_fallback(pet, boss)
    if not _llm_config(llm_in)["apiKey"]:
        return {"scripts": fallback, "source": "rule"}
    system = (
        "你是中文短剧编剧。只输出 JSON，不要解释，不要 Markdown。"
        "剧本只影响叙事，不改战斗数值。"
    )
    user = (
        f"主角项目：{json.dumps(_pet_profile(pet), ensure_ascii=False)}\n"
        f"对手 Boss：{json.dumps(boss, ensure_ascii=False)}\n\n"
        "写 3 个不同方向的剧本方案。每个方案：title（4-10 字，短剧腔，带书名号）、"
        "logline（一句话：谁、想要什么、被什么挡住）、beats（3 个节拍：开局钩子 / 中段反转 / 收束方式，必须点名 Boss）。\n"
        '严格输出：{"scripts": [{"title": "...", "logline": "...", "beats": ["...", "...", "..."]}]}'
    )
    try:
        data = _json_from_model(await _call_model(llm_in, system, user, timeout=30, max_tokens=1100))
        items = []
        for item in (data.get("scripts") or [])[:3]:
            title = str(item.get("title") or "").strip()[:20]
            logline = str(item.get("logline") or "").strip()[:120]
            beats = [str(b).strip()[:120] for b in (item.get("beats") or []) if str(b).strip()][:3]
            if title and logline and len(beats) == 3:
                items.append({"title": title, "logline": logline, "beats": beats})
        if len(items) < 3:
            raise StoryError("模型给的剧本不完整", status_code=502)
        return {"scripts": items, "source": "llm"}
    except Exception:
        return {"scripts": fallback, "source": "rule"}


def _clean_input(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    if not cleaned or len(cleaned) < 2:
        raise StoryError("先写点什么：小说名或一句故事梗概", hint="例如《赘婿》或「一个被全行业低估的内核项目」")
    if not re.search(r"[\u4e00-\u9fffA-Za-z0-9]", cleaned):
        raise StoryError("输入里没有有效文字", hint="别只发符号")
    return cleaned[:200]


async def custom_script(pet: dict[str, Any], boss: dict[str, Any], raw_input: str,
                        llm_in: dict[str, Any] | None) -> dict[str, Any]:
    text = _clean_input(raw_input)
    is_title = len(text) <= 40
    title = f"《{text.strip('《》')}》" if is_title else f"《{text[:10]}…》"
    brief = text if not is_title else f"以《{text.strip('《》')}》为底本，重塑 {pet.get('fullName') or '主角'} 与 {boss.get('full_name') or 'Boss'} 的对决。"
    source = "rule"
    bridge = ""
    strong_fit = True
    if _llm_config(llm_in)["apiKey"]:
        system = (
            "你是中文短剧编剧。只输出 JSON，不要解释。"
            "任务：把玩家给的小说 / 梗概，桥接到一个开源项目的战场。判据是冲突引擎能不能落到对手的领域事实上，"
            "不看题材像不像。"
        )
        user = (
            f"玩家输入：{text}\n"
            f"主角项目：{json.dumps(_pet_profile(pet), ensure_ascii=False)}\n"
            f"对手 Boss：{json.dumps(boss, ensure_ascii=False)}\n\n"
            "用一句话把小说的冲突引擎映射到 Boss 的领域（谁压迫谁、主角靠什么翻盘）。"
            "映射得出来 strong_fit=true；只能写出空话则 strong_fit=false。\n"
            '严格输出：{"bridge": "...", "strong_fit": true, "title": "《...》", "brief": "一句话故事前提"}'
        )
        try:
            data = _json_from_model(await _call_model(llm_in, system, user, timeout=25, max_tokens=500))
            bridge = str(data.get("bridge") or "").strip()[:160]
            strong_fit = data.get("strong_fit") is not False
            title = str(data.get("title") or title).strip()[:20]
            brief = str(data.get("brief") or brief).strip()[:160]
            source = "llm"
        except Exception:
            pass
    if not bridge:
        bridge = f"把它当成一场越级挑战：主角在 {boss.get('full_name') or '对手'} 的领域里，用最笨的方式把差距一点点磨平。"
    return {
        "title": title,
        "brief": brief,
        "bridge": bridge,
        "strong_fit": strong_fit,
        "source": source,
    }


# ---------------------------------------------------------------- 建线 / 推进

def create_run(owner_key: str, *, pet: dict[str, Any], boss: dict[str, Any], script: dict[str, Any],
               track: str, rationale: str, queries: list[str], selection_source: str,
               seed: int, token: str, llm_in: dict[str, Any] | None) -> dict[str, Any]:
    if not _llm_config(llm_in)["apiKey"]:
        raise StoryError("没有绑定模型，不能建线", status_code=403, hint="绑定 API Key 后再进剧情模式")
    if not pet.get("aiEvaluated"):
        raise StoryError("该精灵还没有通过 AI 认证", status_code=403)

    full_name = str(boss.get("full_name") or boss.get("fullName") or "").strip()
    if not full_name:
        raise StoryError("没有选定 Boss", status_code=400, hint="先选一个最终方向")
    if not str(script.get("title") or "").strip():
        raise StoryError("没有选定剧本", status_code=400, hint="先选一个剧本")

    card = _SNAPSHOT_CACHE.get(full_name.lower())
    if not card or not card.get("snapshot"):
        card = boss_card(full_name, token, reason=str(boss.get("reason") or ""))

    pet_cp = combat_power(pet)
    boss_cp = int(card.get("cp") or 1)
    gap = round(boss_cp / max(1, pet_cp), 3)
    chapters = chapter_count_for(gap)

    run_id = uuid.uuid4().hex[:16]
    now = time.time()
    record = {
        "id": run_id,
        "owner_key": owner_key,
        "pet_key": f"{pet.get('platform') or 'github'}-{pet.get('fullName') or ''}",
        "pet_id": pet.get("id") or "",
        "pet_name": pet.get("fullName") or "",
        "script_title": str(script.get("title"))[:40],
        "script_brief": str(script.get("logline") or script.get("brief") or "")[:160],
        "script_source": "manual" if script.get("source") == "manual" else "ai",
        "track": track or "",
        "boss": {
            "full_name": card["full_name"],
            "stars": card.get("stars"),
            "language": card.get("language"),
            "tier": card.get("tier"),
            "level": card.get("level"),
            "cp": card.get("cp"),
            "reason": str(boss.get("reason") or ""),
            "archived": bool(card.get("archived")),
            "snapshot": card.get("snapshot"),
            "verdict": card.get("verdict"),
        },
        "rationale": rationale or "",
        "queries": queries or [],
        "selection_source": selection_source or "ai",
        "seed": seed,
        "gap": gap,
        "chapter_count": chapters,
        "scene_id": "prologue",
        "ink_state": "",
        "vars": {"chapter": 0, "chapter_count": chapters, "trust": 0, "deaths": 0,
                 "route": "solo", "ending_id": ""},
        "visited": [],
        "history": [],
        "rollback": "",
        "route": "",
        "ending": "",
        "status": "active",
        "step": 0,
        "created_at": now,
        "updated_at": now,
        "closed_at": None,
    }
    try:
        with db.connect() as conn:
            conn.execute(
                f"INSERT INTO story_runs ({','.join(RUN_COLUMNS)}) VALUES ({','.join('?' for _ in RUN_COLUMNS)})",
                [record[col] if col not in ("boss", "queries", "vars", "visited", "history") else _dumps(record[col])
                 for col in RUN_COLUMNS],
            )
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise StoryError("已经有一条进行中的剧情线", status_code=409, hint="先结案或放弃旧线，再开新项目") from None
        raise
    return {
        "run": record,
        "desk": {"key": record["pet_key"], "locked": True},
    }


def progress(owner_key: str, run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    with db.connect() as conn:
        run = _get_run(conn, run_id, owner_key)
        if run["status"] != "active":
            raise StoryError("剧情线已经结束", status_code=409)
        if int(payload.get("step", -1)) != int(run["step"]):
            raise StoryError("状态已过期，请拉取最新进度", status_code=409, hint="多端同时推进时只认最新一端")
        ending = str(payload.get("ending_id") or "")
        status = "cleared" if ending else "active"
        now = time.time()
        conn.execute(
            "UPDATE story_runs SET scene_id=?, ink_state=?, vars=?, visited=?, history=?, rollback=?, "
            "route=?, ending=?, status=?, step=step+1, updated_at=?, closed_at=? WHERE id=?",
            (
                str(payload.get("scene_id") or ""),
                str(payload.get("ink_state") or "")[:200000],
                _dumps(payload.get("vars") or {}),
                _dumps(payload.get("visited") or []),
                _dumps((payload.get("history") or [])[-100:]),
                str(payload.get("rollback_state") or "")[:200000],
                str((payload.get("vars") or {}).get("route") or ""),
                ending,
                status,
                now,
                now if ending else None,
                run_id,
            ),
        )
        if ending:
            title = ENDING_TITLES.get(ending, ending)
            conn.execute(
                "INSERT INTO story_endings (id, owner_key, ending_id, run_id, title, unlocked_at) VALUES (?,?,?,?,?,?) "
                "ON CONFLICT(id) DO NOTHING",
                (f"{owner_key}:{ending}", owner_key, ending, run_id, title, now),
            )
        updated = _get_run(conn, run_id, owner_key)
        reward = None
        if ending:
            chapters = int(run["chapter_count"] or 3)
            reward = {
                "xp": int(120 * chapters * (1 + 0.25 * (chapters - 3))),
                "title": ENDING_TITLES.get(ending, ending),
            }
        return {"run": updated, "cleared": bool(ending), "reward": reward}


def save_slot(owner_key: str, run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    slot = int(payload.get("slot") or 0)
    if slot < 1 or slot > 5:
        raise StoryError("存档槽只有 1-5", status_code=400)
    with db.connect() as conn:
        run = _get_run(conn, run_id, owner_key)
        if run["status"] != "active":
            raise StoryError("剧情线已经结束", status_code=409)
        conn.execute(
            "INSERT INTO story_saves (id, run_id, slot, scene_id, vars, visited, ink_state, created_at) "
            "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id, slot) DO UPDATE SET "
            "scene_id=excluded.scene_id, vars=excluded.vars, visited=excluded.visited, "
            "ink_state=excluded.ink_state, created_at=excluded.created_at",
            (
                uuid.uuid4().hex[:16], run_id, slot,
                str(payload.get("scene_id") or ""),
                _dumps(payload.get("vars") or {}),
                _dumps(payload.get("visited") or []),
                str(payload.get("ink_state") or "")[:200000],
                time.time(),
            ),
        )
        return {"saves": list_saves(conn, run_id)}


def load_slot(owner_key: str, run_id: str, slot: int) -> dict[str, Any]:
    with db.connect() as conn:
        run = _get_run(conn, run_id, owner_key)
        row = conn.execute("SELECT * FROM story_saves WHERE run_id=? AND slot=?", (run_id, int(slot))).fetchone()
        if row is None:
            raise StoryError("这个槽位还没有存档", status_code=404)
        snapshot = {
            "slot": row["slot"],
            "scene_id": row["scene_id"],
            "vars": _loads(row["vars"], {}),
            "visited": _loads(row["visited"], []),
            "ink_state": row["ink_state"],
            "created_at": row["created_at"],
        }
        conn.execute(
            "UPDATE story_runs SET scene_id=?, vars=?, visited=?, ink_state=?, step=step+1, updated_at=? WHERE id=?",
            (snapshot["scene_id"], row["vars"], row["visited"], snapshot["ink_state"], time.time(), run_id),
        )
        return {"snapshot": snapshot, "saves": list_saves(conn, run_id), "run": _get_run(conn, run_id, owner_key)}


def rollback(owner_key: str, run_id: str) -> dict[str, Any]:
    with db.connect() as conn:
        run = _get_run(conn, run_id, owner_key)
        if run["status"] != "active":
            raise StoryError("剧情线已经结束", status_code=409)
        if not run.get("rollback"):
            raise StoryError("还没有可回滚的选择点", status_code=400)
        conn.execute(
            "UPDATE story_runs SET ink_state=?, step=step+1, updated_at=? WHERE id=?",
            (run["rollback"], time.time(), run_id),
        )
        return {"ink_state": run["rollback"], "run": _get_run(conn, run_id, owner_key)}


def close_run(owner_key: str, run_id: str, reason: str) -> dict[str, Any]:
    with db.connect() as conn:
        run = _get_run(conn, run_id, owner_key)
        if run["status"] in OPENING_CLOSED:
            return {"run": run}
        status = "cleared" if reason == "clear" else "abandoned"
        conn.execute(
            "UPDATE story_runs SET status=?, closed_at=?, updated_at=? WHERE id=?",
            (status, time.time(), time.time(), run_id),
        )
        return {"run": _get_run(conn, run_id, owner_key)}


def endings(owner_key: str) -> list[dict[str, Any]]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT ending_id, title, unlocked_at, run_id FROM story_endings WHERE owner_key=? ORDER BY unlocked_at DESC",
            (owner_key,),
        ).fetchall()
        return [dict(row) for row in rows]


def archive(owner_key: str) -> list[dict[str, Any]]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, script_title, pet_name, boss, ending, status, chapter_count, created_at, closed_at "
            "FROM story_runs WHERE owner_key=? AND status!='active' ORDER BY created_at DESC LIMIT 30",
            (owner_key,),
        ).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            boss = _loads(item.pop("boss"), {})
            item["boss_name"] = boss.get("full_name", "")
            out.append(item)
        return out


# ---------------------------------------------------------------- 实时台词

_TEXT_SYSTEM = (
    "你是中文短剧编剧，负责给游戏里的一个场景写当前屏台词。"
    "只输出 JSON，不要解释，不要 Markdown。"
)


def _text_cache_key(scene_id: str, keys: list[str], vars_: dict[str, Any], model: str) -> str:
    raw = json.dumps([scene_id, keys, vars_, model], ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def generate_text(*, scene_id: str, keys: list[str], vars_: dict[str, Any], context: dict[str, Any],
                        llm_in: dict[str, Any] | None) -> dict[str, Any]:
    keys = [str(k)[:60] for k in (keys or []) if str(k).strip()][:6]
    if not keys:
        return {"texts": {}, "source": "fallback", "cached": False}
    cfg = _llm_config(llm_in)
    model = cfg["model"] or "gpt-4o-mini"
    cache_key = _text_cache_key(scene_id, keys, vars_, model)
    hit = _TEXT_CACHE.get(cache_key)
    if hit and time.time() - hit[0] < 6 * 3600:
        return {**hit[1], "cached": True}

    if not cfg["apiKey"]:
        return {"texts": {}, "source": "fallback", "cached": False}

    pet_name = str(context.get("pet_name") or "主角")
    boss_name = str(context.get("boss_name") or "宿敌")
    brief = str(context.get("brief") or "")[:160]
    user = (
        f"场景：{scene_id}\n"
        f"主角：{pet_name}\n对手：{boss_name}\n故事前提：{brief or '一路打上山顶，挑战最强的对手'}\n"
        f"当前变量：{json.dumps(vars_, ensure_ascii=False)}\n"
        f"需要写的台词 key：{json.dumps(keys, ensure_ascii=False)}\n\n"
        "为每个 key 写一句中文台词（1-2 句，共 2-4 句一屏）。"
        "只能提主角、对手和旁白；不要出现其他仓库名或真实公司名。"
        "台词要短、有冲突、有画面感，像短剧的对白。\n"
        '严格输出：{"lines": {"key": "台词"}}'
    )
    try:
        raw = await llm_mod.chat_completion(
            base_url=cfg["baseUrl"] or "https://api.openai.com/v1",
            api_key=cfg["apiKey"],
            model=model,
            system=_TEXT_SYSTEM,
            user=user,
            timeout=8.0,
            max_tokens=600,
        )
        data = _json_from_model(raw)
        lines = data.get("lines") if isinstance(data.get("lines"), dict) else data
        texts = {}
        for key in keys:
            value = str((lines or {}).get(key) or "").strip()
            if value:
                texts[key] = value[:200]
        if not texts:
            raise StoryError("模型没有写出台词", status_code=502)
        payload = {"texts": texts, "source": "llm", "cached": False}
        _TEXT_CACHE[cache_key] = (time.time(), payload)
        return payload
    except Exception:
        # 超时 / 503 / 结构不对：整屏退回前端 fallback，不让玩家等
        return {"texts": {}, "source": "fallback", "cached": False}
