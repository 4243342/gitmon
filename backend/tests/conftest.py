"""测试夹具：构造标准 RepoSnapshot，避免联网。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gitmon_api.repo import RepoRef, parse_repo  # noqa: E402
from gitmon_api.scanner.snapshot import RepoSnapshot  # noqa: E402

GOOD_TREE = {
    "total_files": 420,
    "code_files": 120,
    "test_files": 46,
    "doc_files": 30,
    "notebooks": 0,
    "code_bytes": 2_400_000,
    "total_bytes": 3_000_000,
    "loc": 68_000,
    "lang_share": {"TypeScript": 0.62, "JavaScript": 0.18, "CSS": 0.2},
    "primary_language": "TypeScript",
    "language_count": 3,
    "avg_file_bytes": 20_000,
    "largest_files": [],
    "ci_files": [".github/workflows/ci.yml"],
    "lint_files": ["eslint.config.js"],
    "type_files": ["tsconfig.json"],
    "manifests": [{"path": "package.json", "kind": "npm"}],
    "readme_path": "README.md",
    "docs_md_bytes": 40_000,
    "code_ratio": 0.6,
    "md_ratio": 0.2,
    "flags": {"has_license": True, "has_docs_dir": True, "has_changelog": True, "has_workflows": True},
}

WEAK_TREE = {
    "total_files": 12,
    "code_files": 9,
    "test_files": 0,
    "doc_files": 1,
    "notebooks": 0,
    "code_bytes": 30_000,
    "total_bytes": 32_000,
    "loc": 700,
    "lang_share": {"Python": 0.9, "Shell": 0.1},
    "primary_language": "Python",
    "language_count": 2,
    "avg_file_bytes": 3_300,
    "largest_files": [],
    "ci_files": [],
    "lint_files": [],
    "type_files": [],
    "manifests": [{"path": "requirements.txt", "kind": "python"}],
    "readme_path": "",
    "docs_md_bytes": 200,
    "code_ratio": 0.75,
    "md_ratio": 0.1,
    "flags": {},
}


def make_snapshot(
    ref: RepoRef | str = "github.com/acme/widget",
    *,
    tree: dict | None = None,
    deps: list[str] | None = None,
    **overrides,
) -> RepoSnapshot:
    if isinstance(ref, str):
        ref = parse_repo(ref)
    snapshot = RepoSnapshot(ref=ref, fetched_at=0.0)
    snapshot.default_branch = "main"
    snapshot.description = overrides.pop("description", "A fast web app built with react")
    snapshot.topics = overrides.pop("topics", ["react", "web"])
    snapshot.license = overrides.pop("license", "MIT")
    snapshot.stars = overrides.pop("stars", 1800)
    snapshot.forks = overrides.pop("forks", 220)
    snapshot.watchers = overrides.pop("watchers", 90)
    snapshot.open_issues = overrides.pop("open_issues", 12)
    snapshot.created_at = overrides.pop("created_at", "2019-01-01T00:00:00Z")
    snapshot.pushed_at = overrides.pop("pushed_at", "2026-11-01T00:00:00Z")
    snapshot.language = overrides.pop("language", "TypeScript")
    snapshot.contributors = overrides.pop("contributors", 42)
    snapshot.commits_total = overrides.pop("commits_total", 3200)
    snapshot.commits_52w = overrides.pop("commits_52w", [4] * 52)
    snapshot.releases_total = overrides.pop("releases_total", 12)
    snapshot.releases_last_year = overrides.pop("releases_last_year", 4)
    snapshot.issues_closed = overrides.pop("issues_closed", 300)
    snapshot.prs_closed = overrides.pop("prs_closed", 260)
    snapshot.prs_merged = overrides.pop("prs_merged", 210)
    snapshot.readme_chars = overrides.pop("readme_chars", 5200)
    snapshot.dependencies = deps if deps is not None else ["react", "jest", "eslint", "typescript"]
    snapshot.tree = tree if tree is not None else dict(GOOD_TREE)
    for key, value in overrides.items():
        setattr(snapshot, key, value)
    return snapshot


@pytest.fixture()
def good_snapshot() -> RepoSnapshot:
    return make_snapshot()


@pytest.fixture()
def tmp_dir():
    """不用 pytest 的 tmp_path：沙箱里它的 mkdir brokered 行为会抛 EEXIST。"""
    import shutil
    import tempfile

    path = Path(tempfile.mkdtemp(prefix="gitmon-test-"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


@pytest.fixture()
def weak_snapshot() -> RepoSnapshot:
    return make_snapshot(
        "github.com/acme/script",
        tree=dict(WEAK_TREE),
        deps=["requests"],
        description="small utility",
        topics=[],
        license="",
        stars=3,
        forks=0,
        watchers=0,
        open_issues=30,
        contributors=1,
        commits_total=14,
        commits_52w=[0] * 52,
        releases_total=0,
        releases_last_year=0,
        issues_closed=0,
        prs_closed=0,
        prs_merged=0,
        readme_chars=120,
        pushed_at="2024-01-01T00:00:00Z",
        created_at="2023-01-01T00:00:00Z",
        language="Python",
    )
