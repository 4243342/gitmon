"""HTTP 小工具：统一超时、重试、限流与错误翻译。

两个平台的扫描器共用它，避免每个端点都写一遍 try/except。
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from ..errors import PrivateRepo, RateLimited, RepoNotFound, ScanError, UpstreamError

_LINK_PAGE_RE = re.compile(r"[?&]page=(\d+)[^>]*>;\s*rel=[\"']?last", re.I)


class HttpClient:
    def __init__(self, *, timeout: float = 18.0, retries: int = 2, user_agent: str = "GitMon/0.2") -> None:
        self.timeout = timeout
        self.retries = retries
        self.user_agent = user_agent
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout, connect=min(8.0, timeout)),
            follow_redirects=True,
            headers={"User-Agent": user_agent, "Accept": "application/json"},
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HttpClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def get(self, url: str, *, params: dict[str, Any] | None = None,
            headers: dict[str, str] | None = None, platform: str = "github") -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                resp = self._client.get(url, params=params, headers=headers)
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < self.retries:
                    time.sleep(0.6 * (attempt + 1))
                    continue
                raise UpstreamError(f"无法连接 {platform}，请稍后重试") from exc

            if resp.status_code == 200:
                return resp
            if resp.status_code == 404:
                raise RepoNotFound("仓库不存在或已转为私有")
            if resp.status_code in {401, 403}:
                remaining = resp.headers.get("x-ratelimit-remaining")
                if resp.status_code == 429 or remaining == "0":
                    raise RateLimited(
                        f"{platform} API 配额已用尽",
                        hint="配置 GITHUB_TOKEN / GITEE_TOKEN 可将配额提升到 5000 次/小时",
                        retry_after=_retry_after(resp),
                    )
                raise PrivateRepo("无法访问该仓库（可能为私有仓库）")
            if resp.status_code == 429:
                raise RateLimited(
                    f"{platform} API 触发限流",
                    hint="稍后重试，或配置平台 token",
                    retry_after=_retry_after(resp),
                )
            if resp.status_code >= 500:
                last_error = UpstreamError(f"{platform} 服务异常（{resp.status_code}）")
                if attempt < self.retries:
                    time.sleep(0.8 * (attempt + 1))
                    continue
                raise last_error
            raise UpstreamError(f"{platform} 返回异常状态 {resp.status_code}")
        raise last_error or ScanError("扫描失败")

    def get_json(self, url: str, *, params: dict[str, Any] | None = None,
                 headers: dict[str, str] | None = None, platform: str = "github") -> Any:
        resp = self.get(url, params=params, headers=headers, platform=platform)
        try:
            return resp.json()
        except ValueError as exc:
            raise UpstreamError(f"{platform} 返回内容无法解析") from exc


def _retry_after(resp: httpx.Response) -> int | None:
    raw = resp.headers.get("retry-after")
    if raw and raw.isdigit():
        return int(raw)
    reset = resp.headers.get("x-ratelimit-reset")
    if reset and reset.isdigit():
        delta = int(reset) - int(time.time())
        if 0 < delta < 3600:
            return delta
    return None


def link_last_page(resp: httpx.Response) -> int | None:
    """从 Link 头取最后一页页码，用于"1 次请求数出总量"。"""
    link = resp.headers.get("link") or resp.headers.get("Link") or ""
    if not link:
        return None
    match = _LINK_PAGE_RE.search(link)
    if match:
        return int(match.group(1))
    # 有些实现把 last 放在前面，兜底再宽松解析一次
    match = re.search(r"page=(\d+)", link)
    return int(match.group(1)) if match else None
