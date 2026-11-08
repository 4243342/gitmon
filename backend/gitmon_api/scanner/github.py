"""GitHub 扫描器：只读公开仓库，单次扫描约 12~17 个请求。"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Any

from ..errors import RateLimited, ScanError
from ..repo import RepoRef
from .http import HttpClient, link_last_page
from .manifests import normalize_dependencies, parse_manifest
from .snapshot import RepoSnapshot
from .tree import analyze_tree

API = "https://api.github.com"
_ACCEPT = "application/vnd.github+json"
_RAW_ACCEPT = "application/vnd.github.raw+json"


class GitHubScanner:
    platform = "github"

    def __init__(self, http: HttpClient, *, timeout: float, max_tree_entries: int = 20000) -> None:
        self.http = http
        self.timeout = timeout
        self.max_tree_entries = max_tree_entries
        self._limit_hits = 0

    # ---------- 公共入口 ----------
    def scan(self, ref: RepoRef) -> RepoSnapshot:
        headers = self._headers()
        meta = self.http.get_json(f"{API}/repos/{ref.full_name}", headers=headers)
        if meta.get("private"):
            from ..errors import PrivateRepo

            raise PrivateRepo("暂不支持私有仓库")

        snap = RepoSnapshot(ref=ref, fetched_at=datetime.now(timezone.utc).timestamp())
        snap.default_branch = meta.get("default_branch") or "main"
        snap.description = (meta.get("description") or "").strip()
        snap.homepage = (meta.get("homepage") or "").strip()
        snap.topics = [str(t) for t in (meta.get("topics") or [])]
        license_info = meta.get("license") or {}
        snap.license = (license_info.get("spdx_id") or license_info.get("name") or "") if isinstance(license_info, dict) else ""
        snap.archived = bool(meta.get("archived"))
        snap.is_fork = bool(meta.get("fork"))
        snap.stars = int(meta.get("stargazers_count") or 0)
        snap.forks = int(meta.get("forks_count") or 0)
        snap.watchers = int(meta.get("subscribers_count") or meta.get("watchers_count") or 0)
        snap.open_issues = int(meta.get("open_issues_count") or 0)
        snap.size_kb = int(meta.get("size") or 0)
        snap.created_at = meta.get("created_at") or ""
        snap.pushed_at = meta.get("pushed_at") or ""
        snap.language = meta.get("language") or ""
        canonical = meta.get("full_name")
        if canonical and "/" in canonical and canonical.lower() != ref.full_name.lower():
            owner, name = canonical.split("/", 1)
            ref = RepoRef(ref.platform, owner, name)
            snap.ref = ref

        base = f"{API}/repos/{ref.full_name}"

        # 文件树（结构判定的主数据源）
        entries, truncated = self._fetch_tree(base, snap.default_branch, headers)
        snap.tree = analyze_tree(entries, self.max_tree_entries)
        if truncated:
            snap.degraded = True
            snap.notes.append("仓库文件过多，文件树被截断，LOC 与测试占比为下限估计")
        if not snap.tree.get("primary_language") and snap.language:
            snap.tree["primary_language"] = snap.language
            snap.tree.setdefault("lang_share", {})[snap.language] = 1.0

        # 计数类指标
        snap.contributors = self._count(f"{base}/contributors", headers, {"per_page": 1, "anon": "true"}) or 1
        snap.commits_total = self._count(f"{base}/commits", headers, {"per_page": 1}) or 0

        participation = self._safe_json(f"{base}/stats/participation", headers)
        if isinstance(participation, dict) and isinstance(participation.get("all"), list):
            snap.commits_52w = [int(x) for x in participation["all"][-52:]]
        else:
            snap.commits_52w = self._recent_commit_weeks(base, headers)

        releases, releases_total = self._fetch_releases(base, headers)
        snap.releases_total = releases_total
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        recent = 0
        for item in releases:
            published = _parse_iso(item.get("published_at") or item.get("created_at"))
            if published and published >= cutoff:
                recent += 1
        snap.releases_last_year = recent
        if releases:
            snap.latest_release_at = releases[0].get("published_at") or releases[0].get("created_at") or ""

        # issue 关闭数走搜索接口（/issues 会把 PR 也算进来），失败则退回列表计数
        closed_issue_search = self._safe_json(
            f"{API}/search/issues", headers,
            params={"q": f"repo:{ref.full_name} is:issue is:closed", "per_page": 1},
        )
        if isinstance(closed_issue_search, dict) and isinstance(closed_issue_search.get("total_count"), int):
            snap.issues_closed = closed_issue_search["total_count"]
        else:
            snap.issues_closed = self._count(f"{base}/issues", headers, {"state": "closed", "per_page": 1}) or 0

        snap.prs_closed = self._count(f"{base}/pulls", headers, {"state": "closed", "per_page": 1}) or 0
        merged = self._safe_json(
            f"{API}/search/issues", headers,
            params={"q": f"repo:{ref.full_name} is:pr is:merged", "per_page": 1},
        )
        if isinstance(merged, dict) and isinstance(merged.get("total_count"), int):
            snap.prs_merged = merged["total_count"]
        elif snap.prs_closed:
            snap.prs_merged = int(snap.prs_closed * 0.6)  # 无搜索配额时的保守估计
            snap.notes.append("合并 PR 数按经验比例估算")

        readme = self._safe_json(f"{base}/readme", headers)
        if isinstance(readme, dict):
            snap.readme_chars = int(readme.get("size") or 0)

        snap.dependencies = self._fetch_dependencies(base, headers, snap.tree)
        snap.notes.append(f"由 GitHub API 扫描 · {len(snap.tree.get('manifests') or [])} 份依赖清单")

        if self._limit_hits >= 3:
            raise RateLimited(
                "GitHub API 配额不足，扫描数据不完整",
                hint="配置 GITHUB_TOKEN 后可稳定扫描（5000 次/小时）",
            )
        return snap

    # ---------- 内部 ----------
    def count_commits_since(self, ref: RepoRef, since: str) -> int:
        """上次同步以来的提交数，用于精确结算 commit XP（单页封顶 100）。"""
        headers = self._headers()
        data = self._safe_json(
            f"{API}/repos/{ref.full_name}/commits", headers,
            params={"since": since, "per_page": 100},
        )
        if not isinstance(data, list):
            return -1
        return len(data)

    def _headers(self, accept: str = _ACCEPT) -> dict[str, str]:
        headers = {"Accept": accept, "X-GitHub-Api-Version": "2022-11-28"}
        token = _github_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _fetch_tree(self, base: str, branch: str, headers: dict[str, str]) -> tuple[list[dict[str, Any]], bool]:
        data = self._safe_json(f"{base}/git/trees/{branch}", headers, params={"recursive": 1}, default={})
        if not isinstance(data, dict):
            return [], False
        entries = data.get("tree") or []
        return entries, bool(data.get("truncated"))

    def _count(self, url: str, headers: dict[str, str], params: dict[str, Any]) -> int | None:
        try:
            resp = self.http.get(url, params=params, headers=headers, platform="github")
        except RateLimited:
            self._limit_hits += 1
            return None
        except ScanError:
            return None
        last = link_last_page(resp)
        if last:
            if last == 1:
                try:
                    payload = resp.json()
                except ValueError:
                    return 1
                return len(payload) if isinstance(payload, list) else 1
            return last
        try:
            payload = resp.json()
        except ValueError:
            return None
        return len(payload) if isinstance(payload, list) else None

    def _safe_json(self, url: str, headers: dict[str, str], *, params: dict[str, Any] | None = None,
                   default: Any = None) -> Any:
        try:
            return self.http.get_json(url, params=params, headers=headers, platform="github")
        except RateLimited:
            self._limit_hits += 1
            return default
        except ScanError:
            return default

    def _fetch_releases(self, base: str, headers: dict[str, str]) -> tuple[list[dict[str, Any]], int]:
        try:
            resp = self.http.get(f"{base}/releases", params={"per_page": 100}, headers=headers, platform="github")
        except RateLimited:
            self._limit_hits += 1
            return [], 0
        except ScanError:
            return [], 0
        try:
            releases = resp.json()
        except ValueError:
            return [], 0
        if not isinstance(releases, list):
            return [], 0
        last = link_last_page(resp)
        total = last if (last and len(releases) >= 100) else len(releases)
        return releases, total

    def _recent_commit_weeks(self, base: str, headers: dict[str, str]) -> list[int]:
        since = (datetime.now(timezone.utc) - timedelta(weeks=52)).isoformat()
        data = self._safe_json(f"{base}/commits", headers, params={"since": since, "per_page": 100}, default=[])
        if not isinstance(data, list):
            return []
        buckets = [0] * 52
        now = datetime.now(timezone.utc)
        for item in data:
            commit = item.get("commit") or {}
            dt = _parse_iso((commit.get("author") or {}).get("date"))
            if not dt:
                continue
            weeks_ago = int((now - dt).days / 7)
            if 0 <= weeks_ago < 52:
                buckets[51 - weeks_ago] += 1
        return buckets

    def _fetch_dependencies(self, base: str, headers: dict[str, str], tree: dict[str, Any]) -> list[str]:
        tokens: list[str] = []
        for manifest in tree.get("manifests") or []:
            path = manifest.get("path")
            kind = manifest.get("kind")
            if not path or not kind:
                continue
            text = self._fetch_file(base, path, headers)
            if text:
                tokens.extend(parse_manifest(kind, path, text))
        return normalize_dependencies(tokens)[:120]

    def _fetch_file(self, base: str, path: str, headers: dict[str, str]) -> str:
        try:
            resp = self.http.get(f"{base}/contents/{path}", headers=self._headers(_RAW_ACCEPT), platform="github")
        except RateLimited:
            self._limit_hits += 1
            return ""
        except ScanError:
            return ""
        if resp.headers.get("content-type", "").startswith("application/json"):
            try:
                payload = resp.json()
            except ValueError:
                return ""
            if isinstance(payload, dict) and payload.get("encoding") == "base64":
                try:
                    return base64.b64decode(payload.get("content") or "").decode("utf-8", "replace")
                except (ValueError, TypeError):
                    return ""
            return ""
        return resp.text[:200_000]


def _github_token() -> str:
    from ..config import settings

    return settings.github_token


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
