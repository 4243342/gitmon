"""剧情模式：选 Boss / 剧本、建线、状态持久化、结局收集。

分工（docs/STORY.md §4.2-F）：
  · 路线 / 场景 / 选项 / 结局：前端 inkjs 执行 src/story/packs/<id>/story.ink，后端只裁决状态与存档
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

from . import engine, llm as llm_mod, services, story_packs
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
    "id", "owner_key", "pet_key", "pet_id", "pet_name", "script_title", "script_brief", "script_beats",
    "script_source", "script_pack", "track", "boss", "rationale", "queries", "selection_source", "seed",
    "gap", "chapter_count", "scene_id", "ink_state", "vars", "visited", "history", "rollback",
    "route", "ending", "status", "step", "created_at", "updated_at", "closed_at",
)


def run_to_api(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    run = dict(row)
    for key in ("boss", "queries", "vars", "visited", "history", "script_beats"):
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
        raise StoryError("该仓库已归档，不能作为最终对手", status_code=400)
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
        # 与 growth.status_of 同一口径：30 天没推送就算沉睡（卡面上会挂「沉睡」标签）
        "status": "sleeping" if snapshot.days_since_push > 30 else "active",
        "reason": reason,
        "snapshot": snapshot.to_dict(),
        "verdict": {
            "element_key": verdict.get("element_key"),
            "element_secondary": verdict.get("element_secondary"),
            "species_key": verdict.get("species_key"),
            "quality": verdict.get("quality"),
            "quality_score": verdict.get("quality_score"),
            "quality_dims": verdict.get("quality_dims"),
            "engineering_score": verdict.get("engineering_score"),
            "stats": verdict.get("stats"),
            "skills": verdict.get("skills"),
            "hp": verdict.get("hp"),
            "level": verdict.get("level"),
            "evolution_stage": verdict.get("evolution_stage"),
            # 根基 / 词条：卡面下半部分要画（品质五维 + 词条 chips）
            "foundation": verdict.get("foundation"),
            "foundation_tier": verdict.get("foundation_tier"),
            "traits": verdict.get("traits"),
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
    try:
        return await llm_mod.chat_completion(
            base_url=cfg["baseUrl"] or "https://api.openai.com/v1",
            api_key=cfg["apiKey"],
            model=cfg["model"] or "gpt-4o-mini",
            system=system,
            user=user,
            timeout=timeout,
            max_tokens=max_tokens,
        )
    except StoryError:
        raise
    except Exception as exc:
        # 别把 401 / 超时 / JSON 解析失败吞成一句「模型没有给出检索条件」，
        # 否则前端只知道「模型没生效」，不知道该怎么修
        msg = getattr(exc, "message", None) or str(exc)
        raise StoryError(f"模型调用失败：{str(msg)[:120]}", status_code=502) from None


def _pet_profile(pet: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": pet.get("fullName") or pet.get("full_name") or pet.get("name") or "",
        "platform": pet.get("platform") or "github",
        "description": str(pet.get("description") or "")[:240],
        "level": pet.get("level"),
        "quality": pet.get("quality"),
        "element": _element_label(pet),
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
        "你是中文 GitHub 技术选型顾问。只输出 JSON，不要解释，不要 Markdown。"
        "reason / rationale 一律用中文写，不要照抄仓库的英文 description。"
        "只能从给定的候选清单里挑选，不能编造仓库名。"
    )
    user = (
        f"主角项目：{json.dumps(_pet_profile(pet), ensure_ascii=False)}\n"
        f"赛道：{track or '未判定'}\n"
        f"候选清单：{json.dumps(compact, ensure_ascii=False)}\n\n"
        "挑 3 个最适合当对手的项目，三条方向要有区分（例如正面竞争 / 生态压制 / 范式挑战）。"
        "每只给一句中文 reason（≤40 字），再给一段中文 rationale 总述（≤120 字，回答为什么是这三只）。\n"
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
    if not picked:
        # 模型有响应却一只有效对手都没挑出来：必须算降级。
        # 否则 preview 仍标 selection_source=ai，用户以为模型在工作，实际全是规则补齐。
        raise StoryError("模型没有从候选清单里挑出有效对手", status_code=502)
    for item in candidates:
        if len(picked) >= 3:
            break
        if all(p["full_name"].lower() != item["full_name"].lower() for p in picked):
            picked.append({**item, "reason": ""})  # 交给 _zh_reason 统一写中文
    rationale = str(data.get("rationale") or "").strip()[:240]
    return picked[:3], rationale


_ZH_RE = re.compile(r"[\u4e00-\u9fff]")

# 模型不可用 / 返回英文时的规则理由：三条方向要有区分，不能只是"同语言同量级"
_RULE_REASONS = (
    "同赛道的正面对手：{lang}、★{stars}，适合硬碰硬。",
    "体量高一档，★{stars} 的生态会先把你的短板照出来。",
    "打法与你完全不同，选它等于换一套规则重打。",
)


def _zh_reason(item: dict[str, Any], index: int, track: str = "") -> str:
    """Boss 卡的一句话理由必须是中文。

    旧逻辑在规则兜底 / 候选补齐时把 GitHub 的英文 description 直接塞进 reason，
    中文界面里就出现「中文总述 + 三张英文卡片」的割裂。这里统一收口：
    模型给的是中文就用，否则按序号生成有区分度的中文理由。
    """
    raw = str(item.get("reason") or "").strip()
    if _ZH_RE.search(raw) and not raw.startswith("离线兜底池"):
        return raw[:80]
    lang = str(item.get("language") or "同语言").strip() or "同语言"
    stars = int(item.get("stars") or 0)
    star_label = (f"{stars / 10000:.1f}w" if stars >= 10000
                  else f"{stars / 1000:.1f}k" if stars >= 1000 else str(stars))
    prefix = f"{track} · " if track and track != "未判定" else ""
    return (prefix + _RULE_REASONS[index % 3].format(lang=lang, stars=star_label))[:80]


def _card_verdict(verdict: dict[str, Any] | None) -> dict[str, Any]:
    """对手的判定快照：选择界面要把它渲染成一整张角色卡。

    除了画精灵要的属性 / 种族 / 形象种子，六维、技能、根基、词条、品质五维
    也一并带出去 —— 否则前端只能画个缩略图，做不出「整张卡」。
    这些数值和建线后真正开打的那只同源（都来自 engine.judge），不会偏差。
    """
    if not isinstance(verdict, dict):
        return {}
    return {
        "element_key": verdict.get("element_key"),
        "element_secondary": verdict.get("element_secondary"),
        "species_key": verdict.get("species_key"),
        "quality": verdict.get("quality"),
        "level": verdict.get("level"),
        "evolution_stage": verdict.get("evolution_stage"),
        "sprite_seed": verdict.get("sprite_seed"),
        "seed": verdict.get("seed"),
        "stats": verdict.get("stats") or [],
        "skills": verdict.get("skills") or [],
        "hp": verdict.get("hp"),
        "foundation": verdict.get("foundation"),
        "foundation_tier": verdict.get("foundation_tier"),
        "traits": verdict.get("traits") or [],
        "quality_score": verdict.get("quality_score"),
        "quality_dims": verdict.get("quality_dims") or {},
        "engineering_score": verdict.get("engineering_score"),
    }


def _rule_rationale(pet: dict[str, Any], bosses: list[dict[str, Any]]) -> str:
    name = pet.get("fullName") or pet.get("name") or "你的项目"
    if not bosses:
        return "按语言与星标量级挑出的三个对手。"
    names = "、".join(b["full_name"].split("/")[-1] for b in bosses)
    return f"{name} 的三个方向：{names}。它们都在同一赛道里，量级依次递进，选谁就决定这条线要打多大的仗。"


async def preview(pet: dict[str, Any], llm_in: dict[str, Any] | None, *, seed: int, token: str,
                  refresh: bool = False, on_stage: Any = None) -> dict[str, Any]:
    """选 Boss 预演：不落库。模型不可用时走规则检索。

    on_stage(key, detail)：可选进度回调。这活要连跑「模型定检索条件 → GitHub
    检索 → 模型挑对手 → 抓三张仓库卡」，动辄几十秒；流式端点靠它把真实阶段
    推给前端，避免界面只剩一行静态文字、看着像卡死。
    """
    async def stage(key: str, detail: str = "") -> None:
        if on_stage is None:
            return
        try:
            await on_stage(key, detail)
        except Exception:  # 推送失败绝不能影响主流程
            pass

    if not pet.get("aiEvaluated"):
        raise StoryError("该精灵还没有通过 AI 认证", status_code=403, hint="先在高级模式里完成一次模型评测")

    cache_key = f"{pet.get('platform')}/{pet.get('fullName')}"
    cached = _PREVIEW_CACHE.get(cache_key)
    if cached and not refresh and time.time() - cached[0] < 600:
        return cached[1]

    selection_source = "ai"
    model_error = ""  # 降级原因回传前端，禁止「悄悄变规则推荐」
    queries: list[str] = []
    track = ""
    if _llm_config(llm_in)["apiKey"]:
        await stage("queries")
        try:
            queries, track = await _boss_queries(pet, llm_in)
        except StoryError as exc:
            queries = _rule_queries(pet)
            selection_source = "rule"
            model_error = exc.message
    else:
        queries = _rule_queries(pet)
        selection_source = "rule"
        model_error = "请求里没有模型密钥"

    await stage("search", track)
    try:
        candidates = await _search_many(queries, token, seed)
    except StoryError:
        candidates = []
    if len(candidates) < 3:
        # 放宽条件重搜一次
        await stage("repick", track)
        try:
            candidates = await _search_many([q.replace(" pushed:>2026-01-01", "") for q in queries], token, seed)
        except StoryError:
            candidates = candidates

    picked: list[dict[str, Any]] = []
    rationale = ""
    if len(candidates) >= 3 and selection_source == "ai":
        await stage("pick", f"{len(candidates)} 个候选")
        try:
            picked, rationale = await _pick_bosses(pet, track, candidates, llm_in, seed)
        except StoryError as exc:
            selection_source = "rule"
            model_error = model_error or exc.message
    if not picked:
        picked = [{**c, "reason": ""} for c in candidates[:3]]  # 见 _zh_reason
        if not picked:
            # GitHub 不可达：退回内置池，仍然尝试扫描真实仓库
            await stage("fallback")
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
                    "reason": "",
                })
                if len(picked) >= 3:
                    break
            rationale = "GitHub 检索不可用，按内置的同语言顶级项目兜底。"
    if not picked:
        raise StoryError("候选不足 3 只", status_code=502, hint="检查网络 / GitHub 配额后点「换一批」")

    bosses = []
    await stage("cards", f"{len(picked[:3])} 只")
    for index, item in enumerate(picked[:3]):
        # 统一收口：无论模型 / 规则 / 兜底池，卡片理由都必须是中文
        reason = _zh_reason(item, index, track)
        try:
            card = boss_card(item["full_name"], token, reason=reason)
        except StoryError:
            continue
        bosses.append({
            "full_name": card["full_name"],
            "platform": card.get("platform") or "github",
            "stars": card["stars"],
            "language": card["language"],
            "description": card["description"],
            "tier": card["tier"],
            "level": card["level"],
            "cp": card["cp"],
            "reason": reason,
            # 对手的精灵形象（属性 / 种族 / 形象种子 / 六维 / 技能 / 根基 / 词条）。
            # 选择界面要直接渲染成一整张角色卡，而且必须和建线后真正开打的那只一致
            # —— 两边都取自同一张 boss_card。
            "verdict": _card_verdict(card.get("verdict")),
            "status": card.get("status") or "active",
        })
    if len(bosses) < 3:
        raise StoryError("对手判定失败，候选不足 3 只", status_code=502, hint="点「换一批」重试")

    if not rationale or not _ZH_RE.search(str(rationale)):
        rationale = _rule_rationale(pet, bosses)
    result = {
        "track": track or "未判定",
        "bosses": bosses,
        "rationale": rationale,
        "queries": queries,
        "selection_source": selection_source,
        "model_error": model_error,
        "seed": seed,
    }
    _PREVIEW_CACHE[cache_key] = (time.time(), result)
    return result


_PREVIEW_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_SNAPSHOT_CACHE: dict[str, dict[str, Any]] = {}
_TEXT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


# ---------------------------------------------------------------- 剧本

def _pet_name(pet: dict[str, Any]) -> str:
    """主角项目的显示名（owner/repo 全名）。"""
    return str(pet.get("fullName") or pet.get("full_name") or pet.get("name") or "你的项目")


def _boss_name(boss: dict[str, Any]) -> str:
    """对手的短名（只取 repo 那段）。"""
    return str(boss.get("full_name") or boss.get("fullName") or "对手").split("/")[-1]


def _script_fallback(pet: dict[str, Any], boss: dict[str, Any]) -> list[dict[str, Any]]:
    pet_name = _pet_name(pet)
    boss_name = _boss_name(boss)
    items = [
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
    # 规则模板必须自带标记：界面要能标出「这条没用上调研」，别让它冒充 AI 的产出
    return [{**item, "bridge": item.get("bridge", ""), "strong_fit": True, "fallback": True} for item in items]


def _script_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    """把模型吐出的 scripts 数组收口成统一结构。

    只要 title + logline 成立就收下：beats 不满 3 条时用 bridge / logline 补，
    宁可给一张「两拍」的卡，也不要因为它少写一拍就把整条方案丢掉——
    丢掉一条就只剩规则兜底，用户会以为模型根本没思考。
    """
    items: list[dict[str, Any]] = []
    for raw in (data.get("scripts") or [])[:3]:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()[:20]
        logline = str(raw.get("logline") or raw.get("brief") or "").strip()[:120]
        bridge = str(raw.get("bridge") or "").strip()[:160]
        beats = [str(b).strip()[:120] for b in (raw.get("beats") or []) if str(b).strip()][:3]
        if not (title and logline):
            continue
        if len(beats) < 3:
            for filler in (bridge, logline):
                if len(beats) >= 3:
                    break
                if filler and filler not in beats:
                    beats.append(filler)
        items.append({
            "title": title,
            "logline": logline,
            "bridge": bridge,
            "beats": beats,
            "strong_fit": raw.get("strong_fit") is not False,
            "fallback": False,
        })
    return items


def _stat_line(stats: Any) -> str:
    parts = []
    for s in stats or []:
        if isinstance(s, dict) and s.get("name") and s.get("value") is not None:
            parts.append(f"{s['name']}{s['value']}")
    return " / ".join(parts)


def _names(items: Any, limit: int = 4) -> str:
    """只接受列表：字符串 / None / 脏数据一律当没有，避免把 JSON 字符串按字符拆开。"""
    if not isinstance(items, (list, tuple)):
        return ""
    out: list[str] = []
    for it in items:
        name = it.get("name") if isinstance(it, dict) else (it if isinstance(it, str) else "")
        name = str(name or "").strip()
        if name and name not in out:
            out.append(name)
        if len(out) >= limit:
            break
    return "、".join(out)


_ELEMENT_CN = {
    "water": "水系", "thunder": "雷系", "steel": "钢系", "earth": "土系", "rock": "岩系",
    "fire": "火系", "wind": "风系", "grass": "草系", "normal": "普通",
}


def _element_label(pet: dict[str, Any]) -> str:
    element = pet.get("element")
    if isinstance(element, dict) and element.get("name"):
        return str(element["name"])
    key = str(pet.get("element_key") or pet.get("element") or "").strip()
    return _ELEMENT_CN.get(key, key or "未知")


def _quality_label(pet: dict[str, Any]) -> str:
    """品质既可能是 'SSR' 字符串，也可能是 {key, name, color, glow} 对象。

    早先直接把对象塞进 f-string，prompt 里就出现
    ``{'key': 'SSR', 'name': '传说', 'color': '#ffb300', ...}`` 这种 Python 字典原文，
    模型读到的就是一堆噪音。这里统一收成「传说(SSR)」。
    """
    quality = pet.get("quality")
    if isinstance(quality, dict):
        name = str(quality.get("name") or "").strip()
        key = str(quality.get("key") or "").strip()
        if name and key:
            return f"{name}({key})"
        return name or key or "N"
    return str(quality or "N").strip() or "N"


def _story_brief(pet: dict[str, Any], boss: dict[str, Any], research: dict[str, Any] | None) -> str:
    """把「这一局到底是谁打谁、为什么是它」写成一段人话简报，喂给编剧模型。

    没有这段，模型只能看到两段英文 description，写出来的必然是「榜单 / 赛道 / 越级」
    这类放在任何项目上都成立的空话——调研结果必须真的进 prompt 才叫「用了调研」。
    """
    r = research or {}
    pet_name = pet.get("fullName") or pet.get("full_name") or pet.get("name") or "主角"
    boss_name = boss.get("full_name") or boss.get("fullName") or "对手"
    verdict = boss.get("verdict") or {}

    lines = [
        "【主角】",
        f"{pet_name}｜{pet.get('platform') or 'github'}｜Lv.{pet.get('level') or 1}｜品质 {_quality_label(pet)}"
        f"｜{_pet_language(pet) or '语言未知'}｜战力 {combat_power(pet)}｜属性 {_element_label(pet)}",
        f"简介：{str(pet.get('description') or '（无）')[:180]}",
    ]
    stats = _stat_line(pet.get("stats"))
    if stats:
        lines.append(f"六维：{stats}")
    topics = _names(pet.get("topics"), 6)
    if topics:
        lines.append(f"仓库标签：{topics}")
    traits = _names(pet.get("traits"), 4)
    if traits:
        lines.append(f"性格词条：{traits}")

    lines += [
        "",
        "【对手 Boss】",
        f"{boss_name}｜★{boss.get('stars') or 0}｜{boss.get('language') or '语言未知'}"
        f"｜Lv.{boss.get('level') or 1}｜CP {boss.get('cp') or 0}｜{boss.get('tier') or ''}",
        f"简介：{str(boss.get('description') or '（无）')[:180]}",
    ]
    if boss.get("reason"):
        lines.append(f"为什么挑它当对手：{boss['reason']}")
    if isinstance(verdict, dict) and verdict:
        element = (verdict.get("element") or {}).get("name") or ""
        species = (verdict.get("species") or {}).get("name") or ""
        if element or species:
            lines.append(f"它的打法：{element}系 / {species}")
        vt = _names(verdict.get("traits"), 3)
        if vt:
            lines.append(f"它的词条（= 它压人的方式）：{vt}")
        vs = _names(verdict.get("skills"), 4)
        if vs:
            lines.append(f"它的招牌招：{vs}")

    lines += ["", "【这一局的调研记录（真实检索 + 选型，写剧本必须用上）】"]
    track = str(r.get("track") or "").strip()
    if track:
        lines.append(f"赛道判定：{track}")
    queries = [str(q) for q in (r.get("queries") or []) if str(q).strip()][:6]
    if queries:
        lines.append("真实检索条件：" + " ｜ ".join(queries))
    if r.get("rationale"):
        lines.append(f"三个对手的定位：{str(r['rationale'])[:220]}")
    rivals = [b for b in (r.get("rivals") or []) if isinstance(b, dict)]
    others = [b for b in rivals if str(b.get("full_name") or "") != str(boss_name)]
    if others:
        lines.append(
            "同批候选还有：" + "；".join(
                f"{b.get('full_name')}（{str(b.get('reason') or '').strip() or '同赛道'}）" for b in others[:2]
            )
        )
    if r.get("selection_source") and r["selection_source"] != "ai":
        lines.append("注意：这批对手是规则兜底选出来的，不是模型挑的——剧本里别声称「它专门盯上你」。")

    return "\n".join([line for line in lines if line is not None])


_SCRIPT_RULES = (
    "写作硬要求（违反任何一条都算不合格）：\n"
    "1. 每个方案至少要落在上面 **2 条具体事实** 上（对手的星级量级 / 它擅长的具体能力 / 主角某条具体短板或词条），"
    "并且让这些事实出现在 logline 或 beats 里；\n"
    "2. 禁止用「榜单」「赛道」「越级」「后来者」「顶尖项目」这类放在任何项目上都成立的空话推进剧情，"
    "它们最多只能当背景，不能当冲突；\n"
    "3. 三个方案的角度必须真的不同：正面竞争（功能替代）/ 生态压制（对方占着上游、分发或标准）/ "
    "范式挑战（换一套评价标准）；\n"
    "4. beats 每一条都要写清「卡在哪一处具体的技术摩擦上」，不要写「一次基准测试翻车」这种万能句；\n"
    "5. 不要编造没被告知的事实（不虚构 commit / CVE / 版本号 / 融资）。\n"
)


async def scripts(pet: dict[str, Any], boss: dict[str, Any], llm_in: dict[str, Any] | None,
                  research: dict[str, Any] | None = None, mode: str = "auto",
                  pack: str = "") -> dict[str, Any]:
    """三个来源由玩家自己选，不再进 03 步就默认花一次模型调用：

    - ``system``：读某个剧本包内置的方案卡，立刻出卡，**完全不碰模型**
    - ``auto``：模型依据调研现场写；调用失败才退回同一套模板

    ``pack`` 指定用哪个剧本包（斗码苍穹等）。留空则用 default 兜底包。
    """
    pack_id = story_packs.resolve_pack_id(pack)
    fallback = _script_fallback(pet, boss)
    if str(mode or "auto").strip().lower() in ("system", "rule", "builtin"):
        # 系统剧本：读包里的方案卡。包里没有就退回通用模板（功能不能因为内容缺失而挂）
        items = story_packs.pack_scripts(pack_id, _pet_name(pet), _boss_name(boss))
        if not items:
            items = fallback
            pack_id = story_packs.DEFAULT_PACK
        return {
            "scripts": items,
            "source": "system",
            "mode": "system",
            "pack": pack_id,
            "model_error": "",
        }
    if not _llm_config(llm_in)["apiKey"]:
        return {
            "scripts": fallback,
            "source": "rule",
            "mode": "auto",
            "pack": pack_id,
            "model_error": "没有绑定模型，当前是规则兜底剧本（模板化，不含调研）。",
        }
    system = (
        "你是中文短剧编剧，也是懂开源生态的技术作者。只输出 JSON，不要解释，不要 Markdown。"
        "剧本只影响叙事，不改战斗数值。你写的每一句都要能让读者看出「这确实是这两个项目在打架」。"
    )
    user = (
        f"{_story_brief(pet, boss, research)}\n\n"
        f"{_SCRIPT_RULES}\n"
        "写 3 个不同方向的剧本方案。每个方案：title（4-10 字，短剧腔，带书名号）、"
        "logline（一句话：谁、想要什么、被什么挡住，必须点名 Boss 并带上一条具体事实）、"
        "beats（3 个节拍：开局钩子 / 中段反转 / 收束方式，每条都要有具体的技术摩擦）。\n"
        '严格输出：{"scripts": [{"title": "...", "logline": "...", "beats": ["...", "...", "..."]}]}'
    )
    model_error = ""
    items: list[dict[str, Any]] = []
    try:
        data = _json_from_model(await _call_model(llm_in, system, user, timeout=45, max_tokens=1600))
        items = _script_items(data)
        if not items:
            model_error = "模型没有给出可用剧本（title / logline 缺失）"
    except Exception as exc:  # noqa: BLE001 —— 降级原因必须回传，不能静默
        model_error = str(getattr(exc, "message", None) or exc)[:160]
    if not items:
        return {"scripts": fallback, "source": "rule", "mode": "auto", "pack": pack_id,
                "model_error": model_error or "模型没有给出可用剧本"}

    # 模型只给 1-2 条：保留模型写的，用规则补足到 3 条，并如实标成 mixed
    source = "llm" if len(items) >= 3 else "mixed"
    if len(items) < 3:
        from_model = len(items)
        seen = {item["title"] for item in items}
        for extra in fallback:
            if len(items) >= 3:
                break
            if extra["title"] in seen:
                continue
            items.append(extra)
        model_error = f"模型只产出 {from_model} 个方案，其余用规则模板补齐"
    # AI / 混合方案默认落在兜底路线上；只有系统剧本才会带自己的包
    for item in items:
        item.setdefault("pack", pack_id)
    return {"scripts": items[:3], "source": source, "mode": "auto", "pack": pack_id,
            "model_error": model_error}


def _clean_input(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    if not cleaned or len(cleaned) < 2:
        raise StoryError("先写点什么：小说名或一句故事梗概", hint="例如《赘婿》或「一个被全行业低估的内核项目」")
    if not re.search(r"[\u4e00-\u9fffA-Za-z0-9]", cleaned):
        raise StoryError("输入里没有有效文字", hint="别只发符号")
    return cleaned[:200]


def _custom_fallback(pet: dict[str, Any], boss: dict[str, Any], text: str) -> list[dict[str, Any]]:
    """模型不可用时也必须给出三个「看得见自定义词」的方案，不能退回通用的越级挑战。"""
    pet_name = pet.get("fullName") or pet.get("name") or "主角"
    boss_name = str(boss.get("full_name") or boss.get("fullName") or "对手").split("/")[-1]
    base = text.strip("《》 ")
    short = (base[:12] + "…") if len(base) > 12 else base
    items = [
        {
            "title": f"《{short}·原样》",
            "logline": f"{pet_name} 拿到《{short}》的开局，而这一世的 {boss_name} 就是那个不讲道理的第一关。",
            "bridge": f"《{short}》的冲突引擎是「被看轻的人抢回解释权」，落到 {boss_name} 的地盘就是硬碰它的基准与生态位。",
            "beats": [
                f"开局：{pet_name} 顶着《{short}》里的污名被点名，对面站着 {boss_name} 的拥趸。",
                f"中段：《{short}》的关键道具换成一次公开复现，主角当众拆掉 {boss_name} 的招牌指标。",
                f"收束：{pet_name} 与 {boss_name} 正面对线，输赢都改写了《{short}》的结局。",
            ],
            "strong_fit": True,
        },
        {
            "title": f"《{short}·反写》",
            "logline": f"把《{short}》的位置对调：{pet_name} 站到了压迫者那侧，{boss_name} 成了它必须亲手扶起来的对手。",
            "bridge": f"《{short}》里最狠的一招本是用来压人的，这里改成 {pet_name} 对 {boss_name} 的唯一让步：先承认差距，再逐条补齐。",
            "beats": [
                f"开局：{pet_name} 用《{short}》的手段抢下 {boss_name} 的份额，赢了却不被承认。",
                f"中段：{boss_name} 反手公开 {pet_name} 的短板，主角只能回头补最枯燥的那部分，冲突由「打倒」变成「配得上」。",
                f"收束：{pet_name} 把《{short}》争的东西让给 {boss_name}，换一条更难的路。",
            ],
            "strong_fit": True,
        },
        {
            "title": f"《{short}·拆解》",
            "logline": f"《{short}》的金手指被拆成可复现的工程步骤，{pet_name} 靠这些步骤一点点撬动 {boss_name} 的护城河。",
            "bridge": f"把《{short}》的爽点翻译成 {boss_name} 领域的硬指标：基准、文档、可维护性，一条条啃下来才算翻盘。",
            "beats": [
                f"开局：{pet_name} 只有《{short}》里那点微不足道的先手，{boss_name} 的生态已经闭环。",
                f"中段：主角把《{short}》的玄学打法拆成三步，每一步都拿 {boss_name} 的公开指标做验收。",
                f"收束：最后一块拼图落在 {boss_name} 最自信的地方，正面交接。",
            ],
            "strong_fit": True,
        },
    ]
    return [{**item, "fallback": True} for item in items]


async def custom_script(pet: dict[str, Any], boss: dict[str, Any], raw_input: str,
                        llm_in: dict[str, Any] | None,
                        research: dict[str, Any] | None = None) -> dict[str, Any]:
    text = _clean_input(raw_input)
    fallback = _custom_fallback(pet, boss, text)
    items: list[dict[str, Any]] = []
    source = "rule"
    model_error = ""
    if _llm_config(llm_in)["apiKey"]:
        system = (
            "你是中文短剧编剧。只输出 JSON，不要解释，不要 Markdown。"
            "任务：把玩家给的小说 / 梗概，桥接到一个开源项目的战场。判据是冲突引擎能不能落到对手的领域事实上，"
            "不看题材像不像。剧本只影响叙事，不改战斗数值。"
        )
        user = (
            f"玩家给的底本：{text}\n\n"
            f"{_story_brief(pet, boss, research)}\n\n"
            "以「玩家给的底本」为唯一素材来源，写 3 个方向明显不同的剧本方案。"
            "每个方案都要实名承接底本里的人物 / 关系 / 冲突，不能写成泛泛的越级挑战；"
            "桥接必须落在上面简报里的具体事实上（对手擅长的具体能力、主角的具体短板），"
            "不许只用「榜单 / 赛道 / 越级」这类万能词。\n"
            "每个方案：title（4-12 字，带书名号，要能看出和底本的关系）、"
            "logline（一句话：谁、想要什么、被什么挡住）、"
            "bridge（一句话把底本的冲突引擎映射到 Boss 的领域：谁压迫谁、主角靠什么翻盘）、"
            "beats（3 个节拍：开局钩子 / 中段反转 / 收束方式，必须点名 Boss）、"
            "strong_fit（映射得出来 true；只能写空话 false）。\n"
            '严格输出：{"scripts": [{"title": "《...》", "logline": "...", "bridge": "...", '
            '"beats": ["...", "...", "..."], "strong_fit": true}]}'
        )
        try:
            data = _json_from_model(await _call_model(llm_in, system, user, timeout=45, max_tokens=1600))
            items = _script_items(data)
            if items:
                source = "llm"
            else:
                model_error = "模型没有给出可用剧本（title / logline 缺失）"
        except Exception as exc:  # noqa: BLE001
            items = []
            model_error = str(getattr(exc, "message", None) or exc)[:160]
    else:
        model_error = "没有绑定模型，当前是规则兜底剧本（模板化，不含调研）。"
    # 模型只吐出一两条（或整段失败）时用规则方案补齐：界面永远是三选一，且每条都带自定义词
    if len(items) < 3:
        from_model = len(items)
        seen = {item["title"] for item in items}
        for extra in fallback:
            if len(items) >= 3:
                break
            if extra["title"] in seen:
                continue
            items.append(extra)
        if from_model:
            source = "mixed"
            model_error = f"模型只产出 {from_model} 个方案，其余用规则模板补齐"
    head = items[0]
    return {
        "scripts": items,
        "source": source,
        "model_error": model_error,
        # 兼容旧调用方：顶层字段等于第一个方案
        "title": head["title"],
        "brief": head["logline"],
        "bridge": head["bridge"],
        "strong_fit": head["strong_fit"],
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
        # 三个节拍必须落库：正片每一屏的台词都要照它写，否则玩家选的剧本等于没选
        "script_beats": [str(b)[:160] for b in (script.get("beats") or []) if str(b).strip()][:3],
        # 三个来源都要能分辨：manual=自定义底本、system=内置模板、ai=模型现写
        # rule / mixed 也要如实记下来：模型没写成不能被当成 ai
        "script_source": (
            script.get("source")
            if script.get("source") in ("manual", "system", "rule", "mixed")
            else "ai"
        ),
        # 剧本包：决定正片跑哪条路线。系统剧本会带自己的包（斗码苍穹等），
        # AI / 自定义剧本走 default 兜底路线。落库后读档才知道该装哪条线。
        # resolve 而不是 clean：包里不存在的 id 要落成 default，不能留一个空壳包名。
        "script_pack": story_packs.resolve_pack_id(script.get("pack")),
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
                [record[col] if col not in ("boss", "queries", "vars", "visited", "history", "script_beats") else _dumps(record[col])
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
            # 结局标题按剧本包取：斗码苍穹的结局 id 和通用包不一样，标题也不能混用
            title = _ending_title(run.get("script_pack"), ending)
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
                "title": _ending_title(run.get("script_pack"), ending),
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


def _ending_title(pack_id: str | None, ending_id: str) -> str:
    """结局标题：优先用剧本包自己的表，查不到再退回通用表。"""
    title = story_packs.ending_title(pack_id, ending_id)
    if title and title != ending_id:
        return title
    return ENDING_TITLES.get(ending_id, ending_id)


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


def _text_cache_key(scene_id: str, keys: list[str], vars_: dict[str, Any], model: str, script: str = "") -> str:
    raw = json.dumps([scene_id, keys, vars_, model, script], ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


async def generate_text(*, scene_id: str, keys: list[str], vars_: dict[str, Any], context: dict[str, Any],
                        llm_in: dict[str, Any] | None) -> dict[str, Any]:
    keys = [str(k)[:60] for k in (keys or []) if str(k).strip()][:6]
    if not keys:
        return {"texts": {}, "source": "fallback", "cached": False}
    cfg = _llm_config(llm_in)
    model = cfg["model"] or "gpt-4o-mini"
    script_title = str(context.get("script_title") or "")[:40]
    beats = [str(b)[:160] for b in (context.get("script_beats") or []) if str(b).strip()][:3]
    try:
        chapter = max(0, int(vars_.get("chapter") or 0))
    except (TypeError, ValueError):
        chapter = 0
    beat = beats[min(chapter, len(beats) - 1)] if beats else ""
    # 缓存键必须含剧本包：同一个 scene 在不同包里是不同台词，混用会让换包等于没换
    pack_id = story_packs.clean_pack_id(context.get("pack"))
    cache_key = _text_cache_key(scene_id, keys, vars_, model, f"{pack_id}|{script_title}|{beat}")
    hit = _TEXT_CACHE.get(cache_key)
    if hit and time.time() - hit[0] < 6 * 3600:
        return {**hit[1], "cached": True}

    if not cfg["apiKey"]:
        return {"texts": {}, "source": "fallback", "cached": False}

    pet_name = str(context.get("pet_name") or "主角")
    boss_name = str(context.get("boss_name") or "宿敌")
    brief = str(context.get("brief") or "")[:160]
    # 剧本包的世界观与文风：斗码苍穹这类包有自己的语汇，不注入的话模型会写回通用赛博腔
    world, style = story_packs.pack_world(pack_id)
    world_block = ""
    if world or style:
        world_block = (
            f"世界观：{world}\n"
            f"{f'文风要求：{style}' if style else ''}\n"
        )
    # 玩家选的剧本必须真的进 prompt：否则每一屏都在写「通用的越级挑战」，
    # 选哪条剧本对正片毫无影响 —— 这就是「AI 没用提供的剧情」。
    script_block = ""
    if script_title or beat:
        where = f"第 {chapter + 1}/{len(beats) or 3} 段" if beats else ""
        script_block = (
            f"玩家选的剧本：{script_title or '（未命名）'}\n"
            f"{f'本屏在剧本里的位置：{where} —— {beat}' if beat else ''}\n"
        )
    user = (
        f"{script_block}"
        f"{world_block}"
        f"场景：{scene_id}\n"
        f"主角：{pet_name}\n对手：{boss_name}\n故事前提：{brief or '一路打上山顶，挑战最强的对手'}\n"
        f"当前变量：{json.dumps(vars_, ensure_ascii=False)}\n"
        f"需要写的台词 key：{json.dumps(keys, ensure_ascii=False)}\n\n"
        "为每个 key 写一句中文台词（1-2 句，共 2-4 句一屏）。"
        "台词必须落在上面那句「本屏在剧本里的位置」写的事上，接着往下推，不要另起炉灶、"
        "也不要写成空泛的口号；可以引用主角 / 对手各自的具体特征。"
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
