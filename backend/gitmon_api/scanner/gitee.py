"""Gitee 扫描器。

Gitee OpenAPI v5 与 GitHub 有差异：没有 /languages，树要用分支 sha 拉，
分页 Link 的页码从 0 开始。语言占比统一由文件树体积推导。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from ..config import settings
from ..errors import PrivateRepo, RateLimited, ScanError
from ..repo import RepoRef
from .http import HttpClient, link_last_page
from .manifests import normalize_dependencies, parse_manifest
from .purpose import PurposeFiles, PurposeOption, base64_text
from .snapshot import RepoSnapshot
from .tree import analyze_tree

API = "https://gitee.com/api/v5"


class GiteeScanner:
    platform = "gitee"

    def __init__(self, http: HttpClient, *, timeout: float, max_tree_entries: int = 20000,
                 token: str | None = None) -> None:
        self.http = http
        self.timeout = timeout
        self.max_tree_entries = max_tree_entries
        self.token = token or ""
        self._limit_hits = 0

    def scan(self, ref: RepoRef, *, allow_private: bool = False, purpose: PurposeOption = False,
             quality: bool = False) -> RepoSnapshot:
        base = f"{API}/repos/{ref.full_name}"
        meta = self._json(base)
        private = bool(meta.get("private") or meta.get("internal")) or meta.get("public") is False
        if private and not (allow_private and self.token):
            raise PrivateRepo("无法访问该私有仓库")
        canonical = meta.get("full_name")
        if canonical and "/" in canonical:
            owner, name = canonical.split("/", 1)
            ref = RepoRef(ref.platform, owner, name)
            base = f"{API}/repos/{ref.full_name}"
        snap = RepoSnapshot(ref=ref, fetched_at=datetime.now(timezone.utc).timestamp(),
                            repo_id=str(meta.get("id") or ""), private=private)
        snap.default_branch = meta.get("default_branch") or "master"
        snap.description = (meta.get("description") or "").strip()
        snap.homepage = (meta.get("homepage") or "").strip()
        snap.topics = [str(t) for t in (meta.get("topics") or [])]
        license_info = meta.get("license")
        snap.license = str(license_info or "")
        snap.archived = bool(meta.get("archived"))
        snap.is_fork = bool(meta.get("fork"))
        snap.set_recognition_counts(meta)
        snap.watchers = int(meta.get("watchers_count") or 0)
        snap.open_issues = int(meta.get("open_issues_count") or 0)
        snap.size_kb = int(meta.get("size") or 0)
        snap.created_at = meta.get("created_at") or ""
        snap.pushed_at = meta.get("pushed_at") or meta.get("updated_at") or ""
        snap.language = meta.get("language") or ""
        want_purpose = purpose(snap) if callable(purpose) else purpose

        # 文件树
        branch_sha = self._default_branch_sha(base, snap.default_branch, allow_fallback=not quality)
        entries, truncated, tree_available = self._tree(base, branch_sha)
        snap.tree = analyze_tree(entries, self.max_tree_entries)
        purpose_files = None
        if want_purpose or quality:
            purpose_files = PurposeFiles(entries, self.max_tree_entries, revision=branch_sha,
                                         complete=tree_available and not truncated)
        if not entries:
            snap.degraded = True
            snap.notes.append("Gitee 文件树接口未返回内容，结构类指标按元数据估算")
        if truncated:
            snap.degraded = True
            snap.notes.append("仓库文件过多，文件树被截断")
        if not snap.tree.get("primary_language") and snap.language:
            snap.tree["primary_language"] = snap.language
            snap.tree.setdefault("lang_share", {})[snap.language] = 1.0

        # 贡献者：Gitee 的 contributors 不分页，直接取前 100 条计数
        contributors = self._safe(f"{base}/contributors", params={"per_page": 100}, default=[])
        snap.contributors = len(contributors) if isinstance(contributors, list) else 1
        if snap.contributors >= 100:
            snap.notes.append("贡献者数按 100 封顶统计")

        # Gitee 的 commits 接口不给 Link 头，只能翻页数（3 页封顶 300）
        snap.commits_total = self._count_commits(base, snap.pushed_at)
        since = (datetime.now(timezone.utc) - timedelta(weeks=52)).isoformat()
        recent = self._safe(f"{base}/commits", params={"since": since, "per_page": 100}, default=[])
        snap.commits_52w = _bucket_weeks(recent if isinstance(recent, list) else [])

        releases, total = self._releases(base)
        snap.releases_total = total
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        snap.releases_last_year = sum(
            1 for item in releases if (_parse_iso(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff
        )
        if releases:
            snap.latest_release_at = releases[0].get("created_at") or ""

        snap.issues_closed = self._count(f"{base}/issues", {"state": "closed", "per_page": 1}) or 0
        snap.prs_closed = self._count(f"{base}/pulls", {"state": "closed", "per_page": 1}) or 0
        snap.prs_merged = self._count(f"{base}/pulls", {"state": "merged", "per_page": 1}) or 0

        original_readme_path = snap.tree.get("readme_path") or "README.md"
        evidence_readme_path = purpose_files.readme_path() if purpose_files is not None else ""
        if not evidence_readme_path and quality:
            evidence_readme_path = snap.tree.get("readme_path") or ""
        evidence_readme = ""
        if purpose_files is not None and evidence_readme_path and purpose_files.can_fetch(evidence_readme_path):
            evidence_readme = self._purpose_file(base, evidence_readme_path, purpose_files)
        quality_readme = evidence_readme if original_readme_path == evidence_readme_path else ""
        if not quality_readme:
            quality_readme = self._file(base, original_readme_path)
        snap.readme_chars = len(quality_readme)
        manifest_texts: dict[str, str] = {}
        snap.dependencies = self._deps(base, snap.tree, purpose_files, manifest_texts)
        snap.notes.append(f"由 Gitee API v5 扫描 · {len(snap.tree.get('manifests') or [])} 份依赖清单")

        if self._limit_hits >= 3:
            raise RateLimited(
                "Gitee API 配额不足，扫描数据不完整",
                hint="配置 GITEE_TOKEN 可提高配额",
            )
        if purpose_files is not None:
            # With no root README path in the tree, the fallback is useful only when it is itself a root file.
            if not evidence_readme_path and "/" not in original_readme_path:
                evidence_readme_path, evidence_readme = original_readme_path, quality_readme
            purpose_files.populate(
                snap, releases, readme=evidence_readme, readme_path=evidence_readme_path,
                manifests=manifest_texts, fetch=lambda path: self._purpose_file(base, path, purpose_files),
                purpose=want_purpose, quality=quality,
            )
        return snap

    # ---------- 内部 ----------
    def count_commits_since(self, ref: RepoRef, since: str) -> int:
        data = self._safe(
            f"{API}/repos/{ref.full_name}/commits",
            params={"since": since, "per_page": 100},
            default=None,
        )
        return len(data) if isinstance(data, list) else -1

    def _params(self) -> dict[str, str]:
        token = self.token or settings.gitee_token
        return {"access_token": token} if token else {}

    def _json(self, url: str, params: dict[str, Any] | None = None) -> Any:
        merged = {**self._params(), **(params or {})}
        return self.http.get_json(url, params=merged, platform="gitee")

    def _safe(self, url: str, *, params: dict[str, Any] | None = None, default: Any = None) -> Any:
        try:
            return self._json(url, params)
        except RateLimited:
            self._limit_hits += 1
            return default
        except ScanError:
            return default

    def _count(self, url: str, params: dict[str, Any]) -> int | None:
        merged = {**self._params(), **params}
        try:
            resp = self.http.get(url, params=merged, platform="gitee")
        except RateLimited:
            self._limit_hits += 1
            return None
        except ScanError:
            return None
        try:
            payload = resp.json()
        except ValueError:
            return None
        length = len(payload) if isinstance(payload, list) else 0
        last = link_last_page(resp)
        if last and last > 1:
            return last
        return length

    def _count_commits(self, base: str, pushed_at: str) -> int:
        """翻页数提交总量，最多 3 页；不足 300 时是精确值。"""
        total = 0
        for page in range(1, 4):
            batch = self._safe(f"{base}/commits", params={"per_page": 100, "page": page}, default=[])
            if not isinstance(batch, list) or not batch:
                break
            total += len(batch)
            if len(batch) < 100:
                break
        return total

    def _default_branch_sha(self, base: str, branch: str, *, allow_fallback: bool = True) -> str:
        branches = self._safe(f"{base}/branches", default=[])
        if isinstance(branches, list):
            for item in branches:
                if item.get("name") == branch:
                    return ((item.get("commit") or {}).get("sha")) or ""
            if branches and allow_fallback:
                return ((branches[0].get("commit") or {}).get("sha")) or ""
        single = self._safe(f"{base}/branches/{quote(branch, safe='')}", default={})
        if isinstance(single, dict):
            return ((single.get("commit") or {}).get("sha")) or ""
        return ""

    def _tree(self, base: str, sha: str) -> tuple[list[dict[str, Any]], bool, bool]:
        if not sha:
            return [], False, False
        data = self._safe(f"{base}/git/trees/{sha}", params={"recursive": 1}, default={})
        if not isinstance(data, dict):
            return [], False, False
        entries = data.get("tree")
        if not isinstance(entries, list):
            return [], False, False
        return entries, bool(data.get("truncated")), True

    def _releases(self, base: str) -> tuple[list[dict[str, Any]], int]:
        merged = {**self._params(), "per_page": 100}
        try:
            resp = self.http.get(f"{base}/releases", params=merged, platform="gitee")
        except (RateLimited, ScanError):
            return [], 0
        try:
            releases = resp.json()
        except ValueError:
            return [], 0
        if not isinstance(releases, list):
            return [], 0
        last = link_last_page(resp)
        total = last if (last and last > 1 and len(releases) >= 100) else len(releases)
        return releases, total

    def _file(self, base: str, path: str) -> str:
        return base64_text(self._safe(f"{base}/contents/{quote(path)}", default={}))

    def _purpose_file(self, base: str, path: str, files: PurposeFiles) -> str:
        sha = files.sha(path)
        if not sha:
            return self._file(base, path)
        try:
            return base64_text(self._json(f"{base}/git/blobs/{sha}"))
        except ScanError:
            return ""

    def _deps(self, base: str, tree: dict[str, Any], purpose_files: PurposeFiles | None,
              manifest_texts: dict[str, str]) -> list[str]:
        tokens: list[str] = []
        for manifest in tree.get("manifests") or []:
            path = manifest.get("path")
            kind = manifest.get("kind")
            if not path or not kind:
                continue
            text = ""
            if purpose_files is not None and purpose_files.can_fetch(path):
                text = self._purpose_file(base, path, purpose_files)
                manifest_texts[path] = text
            if not text:
                text = self._file(base, path)
            if text:
                tokens.extend(parse_manifest(kind, path, text))
        return normalize_dependencies(tokens)[:120]


def _bucket_weeks(items: list[dict[str, Any]]) -> list[int]:
    buckets = [0] * 52
    now = datetime.now(timezone.utc)
    for item in items:
        commit = item.get("commit") or {}
        dt = _parse_iso((commit.get("author") or {}).get("date"))
        if not dt:
            continue
        weeks_ago = int((now - dt).days / 7)
        if 0 <= weeks_ago < 52:
            buckets[51 - weeks_ago] += 1
    return buckets


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
