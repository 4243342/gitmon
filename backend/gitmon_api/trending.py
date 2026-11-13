"""GitHub 趋势榜抓取：把 github.com/trending 的排行榜拉成结构化数据。

GitHub 没有公开的 trending API，只能抓页面用正则解析。趋势榜更新很慢，
结果在进程内缓存 30 分钟，避免每次请求都去打 GitHub（匿名还会被限流）。
"""

from __future__ import annotations

import html
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

_GITHUB = "https://github.com"
_SEARCH_API = "https://api.github.com/search/repositories"
_UA = "GitMon/0.2 (+https://github.com/4243342/gitmon)"
_CACHE_TTL = 1800  # 30 分钟

_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]], str]] = {}

# 数据来源：trending = 抓 github.com/trending；search = 网页不可达时退回搜索接口近似榜单
_source = "trending"


def last_source() -> str:
    return _source

_ARTICLE_RE = re.compile(r'<article class="Box-row">(.*?)</article>', re.S)
_H2_RE = re.compile(r'<h2[^>]*>\s*<a[^>]*href="/([^"/?#]+)/([^"/?#]+)"', re.S)
_DESC_RE = re.compile(r'<p class="col-9[^"]*">\s*(.*?)\s*</p>', re.S)
_LANG_RE = re.compile(r'itemprop="programmingLanguage">([^<]+)<')
_LANG_COLOR_RE = re.compile(r'repo-language-color"\s*style="background-color:\s*([^"]+)"')
_STARS_RE = re.compile(r'/stargazers"[^>]*>.*?</svg>\s*([\d,\.kKmM]+)', re.S)
_FORKS_RE = re.compile(r'/forks"[^>]*>.*?</svg>\s*([\d,\.kKmM]+)', re.S)
_PERIOD_RE = re.compile(r'([\d,\.kKmM]+)(?:\s*</span>)?\s*stars\s+(today|this week|this month)', re.S)

_PERIOD_LABEL = {"today": "今日新增", "this week": "本周新增", "this month": "本月新增"}
_FALLBACK_LABEL = {"daily": "今日新增", "weekly": "本周新增", "monthly": "本月新增"}


def _to_int(token: str) -> int:
    token = (token or "").strip().lower().replace(",", "")
    if not token:
        return 0
    mult = 1
    if token.endswith("k"):
        mult, token = 1_000, token[:-1]
    elif token.endswith("m"):
        mult, token = 1_000_000, token[:-1]
    try:
        return int(float(token) * mult)
    except ValueError:
        return 0


def _clean(text: str) -> str:
    return html.unescape((text or "").strip())


def parse_trending(html_text: str) -> list[dict[str, Any]]:
    """把 trending 页面 HTML 解析成结构化排行榜（纯函数，便于单测）。"""
    out: list[dict[str, Any]] = []
    for i, block in enumerate(_ARTICLE_RE.findall(html_text), start=1):
        h2 = _H2_RE.search(block)
        if not h2:
            continue
        owner, name = h2.group(1), h2.group(2)
        full = f"{owner}/{name}"
        desc = _DESC_RE.search(block)
        lang = _LANG_RE.search(block)
        lang_color = _LANG_COLOR_RE.search(block)
        period = _PERIOD_RE.search(block)
        stars_m = _STARS_RE.search(block)
        forks_m = _FORKS_RE.search(block)
        out.append({
            "rank": i,
            "author": owner,
            "name": name,
            "full_name": full,
            "url": f"https://github.com/{full}",
            "avatar": f"https://github.com/{owner}.png?size=40",
            "description": _clean(desc.group(1)) if desc else "",
            "language": _clean(lang.group(1)) if lang else "",
            "language_color": lang_color.group(1).strip() if lang_color else "",
            "stars": _to_int(stars_m.group(1)) if stars_m else 0,
            "forks": _to_int(forks_m.group(1)) if forks_m else 0,
            "period_stars": _to_int(period.group(1)) if period else 0,
            "period_label": _PERIOD_LABEL.get(period.group(2) if period else "", ""),
        })
    return out


def _fetch_search_fallback(since: str, language: str = "", token: str = "") -> list[dict[str, Any]]:
    """抓取失败时的兜底：GitHub Search API 找该时段内新建、Star 最多的仓库。

    github.com/trending 没有 API、偶发 504；Search API 独立且稳定。
    榜上的仓库都在所选时段内创建，其 Star 增量约等于总 Star，可以按新增展示。

    token：登录会话 / 服务端兜底令牌。匿名 Search 只有 10 次/分钟，
    排行榜又是高频页面 —— 带上令牌（30 次/分钟）别让它把整台机器的匿名配额烧穿。
    """
    days = {"daily": 1, "weekly": 7, "monthly": 30}.get(since, 7)
    since_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    query = f"created:>{since_date}"
    if language:
        query += f" language:{language}"
    headers = {"User-Agent": _UA, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = httpx.get(
        "https://api.github.com/search/repositories",
        params={"q": query, "sort": "stars", "order": "desc", "per_page": 30},
        headers=headers,
        timeout=18.0,
    )
    resp.raise_for_status()
    items: list[dict[str, Any]] = []
    for i, r in enumerate(resp.json().get("items", []), start=1):
        owner = r.get("owner") or {}
        stars = int(r.get("stargazers_count") or 0)
        items.append({
            "rank": i,
            "author": owner.get("login", ""),
            "name": r.get("name", ""),
            "full_name": r.get("full_name", ""),
            "url": r.get("html_url", ""),
            "avatar": owner.get("avatar_url", ""),
            "description": (r.get("description") or "").strip(),
            "language": r.get("language") or "",
            "language_color": "",
            "stars": stars,
            "forks": int(r.get("forks_count") or 0),
            "period_stars": stars,
            "period_label": _FALLBACK_LABEL.get(since, "本周新增"),
            "source": "search",
        })
    return items


def fetch_trending(since: str = "weekly", language: str = "", token: str = "") -> list[dict[str, Any]]:
    """抓 GitHub 趋势榜；since ∈ daily/weekly/monthly；language 为空则全部语言。

    token 用于 Search 兜底（登录会话优先，其次服务端兜底令牌）。
    来源会写进 last_source()：trending = 抓页面，search = 网页不可达时的近似榜单。
    """
    global _source
    if since not in {"daily", "weekly", "monthly"}:
        since = "weekly"
    key = (since, language.lower())
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_TTL:
        _source = cached[2]
        return cached[1]
    path = f"/trending/{language}" if language else "/trending"
    try:
        resp = httpx.get(
            f"{_GITHUB}{path}",
            params={"since": since},
            headers={"User-Agent": _UA, "Accept": "text/html"},
            follow_redirects=True,
            timeout=18.0,
        )
        resp.raise_for_status()
        items = parse_trending(resp.text)
        if not items:  # 页面结构变了，正则一条都没解析到，按失败处理
            raise ValueError("trending 页面解析为空")
        _source = "trending"
    except Exception:
        if cached:  # 抖动 / 限流时先给上一次的榜单，比整页报错强
            _source = cached[2]
            return cached[1]
        items = _fetch_search_fallback(since, language, token)
        _source = "search"
        if not items:
            raise
    if items:
        _cache[key] = (time.time(), items, _source)
    return items
