"""标准化仓库快照 RepoSnapshot —— 扫描层与判定层之间唯一的契约。

两个平台各自实现 scanner，但都必须产出这个结构；engine 只认它，与平台无关。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..repo import RepoRef


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass
class RepoSnapshot:
    ref: RepoRef
    fetched_at: float

    # ---- 仓库元信息 ----
    default_branch: str = ""
    description: str = ""
    homepage: str = ""
    topics: list[str] = field(default_factory=list)
    license: str = ""
    archived: bool = False
    is_fork: bool = False
    stars: int = 0
    forks: int = 0
    watchers: int = 0
    open_issues: int = 0
    size_kb: int = 0
    created_at: str = ""
    pushed_at: str = ""
    language: str = ""

    # ---- 活跃度与协作 ----
    contributors: int = 0
    commits_total: int = 0
    commits_52w: list[int] = field(default_factory=list)
    releases_total: int = 0
    releases_last_year: int = 0
    latest_release_at: str = ""
    issues_closed: int = 0
    prs_closed: int = 0
    prs_merged: int = 0
    readme_chars: int = 0
    dependencies: list[str] = field(default_factory=list)

    # ---- 文件树分析结果 ----
    tree: dict[str, Any] = field(default_factory=dict)

    # 距上次同步以来的提交数（-1 = 未知；只有同步结算时才会去数）
    commits_since: int = -1

    # ---- 扫描质量 ----
    degraded: bool = False
    notes: list[str] = field(default_factory=list)

    # ---------- 派生指标 ----------
    @property
    def commits_90d(self) -> int:
        return sum(self.commits_52w[-13:]) if self.commits_52w else 0

    @property
    def days_since_push(self) -> int:
        dt = _parse_dt(self.pushed_at)
        if dt is None:
            return 999
        return max(0, int((datetime.now(timezone.utc) - dt).total_seconds() // 86400))

    @property
    def age_months(self) -> int:
        dt = _parse_dt(self.created_at)
        if dt is None:
            return 0
        return max(0, int((datetime.now(timezone.utc) - dt).days // 30))

    @property
    def active_months(self) -> int:
        """近两年内有提交的周数折算成月。"""
        if not self.commits_52w:
            return 0
        return round(sum(1 for c in self.commits_52w if c > 0) / 4.33)

    @property
    def test_ratio(self) -> float:
        code_files = int(self.tree.get("code_files") or 0)
        test_files = int(self.tree.get("test_files") or 0)
        if code_files <= 0:
            return 0.0
        return min(1.0, test_files / code_files)

    @property
    def issue_close_ratio(self) -> float:
        total = self.issues_closed + self.open_issues
        if total <= 0:
            return 0.5
        return min(1.0, self.issues_closed / total)

    @property
    def merged_ratio(self) -> float:
        if self.prs_closed <= 0:
            return 0.5 if self.prs_merged <= 0 else 1.0
        return max(0.0, min(1.0, self.prs_merged / max(self.prs_closed, self.prs_merged)))

    def to_dict(self) -> dict[str, Any]:
        data = self.__dict__.copy()
        data["ref"] = self.ref.to_dict()
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RepoSnapshot":
        data = dict(payload)
        ref = data.pop("ref")
        return cls(ref=RepoRef(ref["platform"], ref["owner"], ref["repo"]), **data)

    def metrics(self) -> dict[str, Any]:
        """参与增量 XP 结算的关键计数。"""
        return {
            "commits_total": self.commits_total,
            "releases_total": self.releases_total,
            "stars": self.stars,
            "forks": self.forks,
            "issues_closed": self.issues_closed,
            "prs_merged": self.prs_merged,
            "contributors": self.contributors,
        }
