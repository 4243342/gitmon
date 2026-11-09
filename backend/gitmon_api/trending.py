"""GitHub 趋势榜抓取：把 github.com/trending 的排行榜拉成结构化数据。

GitHub 没有公开的 trending API，只能抓页面用正则解析。趋势榜更新很慢，
结果在进程内缓存 30 分钟，避免每次请求都去打 GitHub（匿名还会被限流）。
"""

from __future__ import annotations

import html
import re
import time
from typing import Any

import httpx

_TRENDING = "https://github.com/trending"
_UA = "GitMon/0.2 (+https://github.com/4243342/gitmon)"
_CACHE_TTL = 1800  # 30 分钟

_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}

_ARTICLE_RE = re.compile(r'<article class="Box-row">(.*?)</article>', re.S)
_H2_RE = re.compile(r'<h2[^>]*>\s*<a[^>]*href="/([^"/?#]+)/([^"/?#]+)"', re.S)
_DESC_RE = re.compile(r'<p class="col-9[^"]*">\s*(.*?)\s*</p>', re.S)
_LANG_RE = re.compile(r'itemprop="programmingLanguage">([^<]+)<')
_LANG_COLOR_RE = re.compile(r'repo-language-color"\s*style="background-color:\s*([^"]+)"')
_STARS_RE = re.compile(r'/stargazers"[^>]*>.*?</svg>\s*([\d,\.kKmM]+)', re.S)
_FORKS_RE = re.compile(r'/forks"[^>]*>.*?</svg>\s*([\d,\.kKmM]+)', re.S)
_PERIOD_RE = re.compile(r'([\d,\.kKmM]+)(?:\s*</span>)?\s*stars\s+(today|this week|this month)', re.S)

_PERIOD_LABEL = {"today": "今日新增", "this week": "本周新增", "this month": "本月新增"}


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


def fetch_trending(since: str = "weekly", language: str = "") -> list[dict[str, Any]]:
    """抓 GitHub 趋势榜；since ∈ daily/weekly/monthly；language 为空则全部语言。"""
    if since not in {"daily", "weekly", "monthly"}:
        since = "weekly"
    key = (since, language.lower())
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_TTL:
        return cached[1]
    path = f"/trending/{language}" if language else "/trending"
    resp = httpx.get(
        f"{_TRENDING}{path}",
        params={"since": since},
        headers={"User-Agent": _UA, "Accept": "text/html"},
        follow_redirects=True,
        timeout=18.0,
    )
    resp.raise_for_status()
    items = parse_trending(resp.text)
    _cache[key] = (time.time(), items)
    return items
