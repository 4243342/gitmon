"""仓库地址解析。"""

from __future__ import annotations

import pytest

from gitmon_api.repo import InvalidRepo, parse_repo, ref_from_parts


@pytest.mark.parametrize(
    "raw,platform,full_name",
    [
        ("https://github.com/facebook/react", "github", "facebook/react"),
        ("https://github.com/facebook/react.git", "github", "facebook/react"),
        ("https://github.com/facebook/react/tree/main/packages", "github", "facebook/react"),
        ("http://github.com/vercel/next.js/", "github", "vercel/next.js"),
        ("git@github.com:rust-lang/rust.git", "github", "rust-lang/rust"),
        ("facebook/react", "github", "facebook/react"),
        ("https://gitee.com/mirrors/vue", "gitee", "mirrors/vue"),
        ("gitee.com/mirrors/vue.git", "gitee", "mirrors/vue"),
        ("  https://github.com/psf/requests  ", "github", "psf/requests"),
    ],
)
def test_parse_repo_variants(raw: str, platform: str, full_name: str) -> None:
    ref = parse_repo(raw)
    assert ref.platform == platform
    assert ref.full_name == full_name
    assert ref.cache_key == f"{platform}/{full_name}".lower()


@pytest.mark.parametrize(
    "raw",
    ["", "   ", "hello world", "https://github.com/orgs/gitmon", "https://example.com/a/b", "a" * 500],
)
def test_parse_repo_rejects(raw: str) -> None:
    with pytest.raises(InvalidRepo):
        parse_repo(raw)


def test_ref_from_parts_validates_platform() -> None:
    ref = ref_from_parts("gitee", "mirrors", "vue")
    assert ref.html_url == "https://gitee.com/mirrors/vue"
    with pytest.raises(InvalidRepo):
        ref_from_parts("bitbucket", "a", "b")
    with pytest.raises(InvalidRepo):
        ref_from_parts("github", "a b", "c")
