"""扫描层入口：按平台选实现，统一产出 RepoSnapshot。"""

from __future__ import annotations

from ..config import settings
from ..repo import RepoRef
from . import scc
from .gitee import GiteeScanner
from .github import GitHubScanner
from .http import HttpClient
from .meta import check_starred, fetch_repo_meta
from .snapshot import RepoSnapshot
from .tokens import token_for

__all__ = [
    "RepoSnapshot",
    "scan",
    "GitHubScanner",
    "GiteeScanner",
    "HttpClient",
    "token_for",
    "fetch_repo_meta",
    "check_starred",
]


def scan(ref: RepoRef, *, use_scc: bool | None = None, since: str | None = None,
         token: str | None = None) -> RepoSnapshot:
    token = token_for(token, ref.platform)
    with HttpClient(timeout=settings.http_timeout, retries=settings.http_retries) as http:
        if ref.platform == "gitee":
            scanner = GiteeScanner(http, timeout=settings.http_timeout, max_tree_entries=settings.max_tree_entries, token=token)
        else:
            scanner = GitHubScanner(http, timeout=settings.http_timeout, max_tree_entries=settings.max_tree_entries, token=token)
        snapshot = scanner.scan(ref)
        if since:
            snapshot.commits_since = scanner.count_commits_since(ref, since)

    want_scc = settings.use_scc if use_scc is None else use_scc
    if want_scc:
        stats = scc.collect(ref, with_ai=settings.ai_trace)
        if stats:
            scc.merge_into_tree(snapshot.tree, stats)
            snapshot.notes.append("代码行与复杂度由 scc 精确统计")
            if snapshot.tree.get("ai_rate") is not None:
                snapshot.notes.append(f"AI 味检测：{snapshot.tree['ai_rate']}/100（离线规则）")
        else:
            scc.annotate_failure(snapshot)
    return snapshot
