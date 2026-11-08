"""仓库地址解析与标识。

支持：完整 URL、SSH 地址、owner/repo 简写、带子路径的树链接。
解析结果是与平台无关的 RepoRef，判定与存储都围绕它。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_OWNER = r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"
_REPO = r"[A-Za-z0-9_.-]{1,100}"

_URL_RE = re.compile(
    rf"(?:github\.com|gitee\.com)[/:](?P<owner>{_OWNER})/(?P<repo>{_REPO}?)(?:\.git)?(?=[/?#]|$)",
    re.IGNORECASE,
)
_SSH_RE = re.compile(rf"git@(?:github\.com|gitee\.com):(?P<owner>{_OWNER})/(?P<repo>{_REPO}?)(?:\.git)?$", re.IGNORECASE)
_SHORT_RE = re.compile(rf"^(?P<owner>{_OWNER})/(?P<repo>{_REPO})$")

_RESERVED_GITHUB = {
    "orgs", "topics", "collections", "trending", "explore", "features", "sponsors",
    "settings", "marketplace", "about", "pricing", "login", "join", "notifications",
}


class InvalidRepo(ValueError):
    """地址无法识别为仓库。"""


@dataclass(frozen=True)
class RepoRef:
    platform: str
    owner: str
    repo: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"

    @property
    def cache_key(self) -> str:
        return f"{self.platform}/{self.full_name}".lower()

    @property
    def html_url(self) -> str:
        host = "github.com" if self.platform == "github" else "gitee.com"
        return f"https://{host}/{self.full_name}"

    def to_dict(self) -> dict[str, str]:
        return {"platform": self.platform, "owner": self.owner, "repo": self.repo, "fullName": self.full_name}


def parse_repo(input_value: str) -> RepoRef:
    raw = (input_value or "").strip()
    if not raw:
        raise InvalidRepo("仓库地址为空")
    if len(raw) > 400:
        raise InvalidRepo("仓库地址过长")

    lowered = raw.lower()
    if "gitee.com" in lowered:
        platform = "gitee"
    elif "github.com" in lowered:
        platform = "github"
    else:
        platform = "github"  # owner/repo 简写默认 GitHub

    match = _URL_RE.search(raw) or _SSH_RE.match(raw)
    if match:
        owner, repo = match.group("owner"), match.group("repo")
        if platform == "github" and owner.lower() in _RESERVED_GITHUB:
            raise InvalidRepo("这不是仓库地址，请输入 github.com/owner/repo")
        if repo.endswith(".git"):
            repo = repo[:-4]
        return RepoRef(platform=platform, owner=owner, repo=repo)

    short = _SHORT_RE.match(raw)
    if short:
        return RepoRef(platform=platform, owner=short.group("owner"), repo=short.group("repo"))

    raise InvalidRepo("无法识别的地址 · 请粘贴 GitHub 或 Gitee 仓库链接")


def ref_from_parts(platform: str, owner: str, repo: str) -> RepoRef:
    platform = (platform or "github").lower()
    if platform not in {"github", "gitee"}:
        raise InvalidRepo("仅支持 GitHub 与 Gitee")
    if not re.fullmatch(_OWNER, owner or "") or not re.fullmatch(_REPO, repo or ""):
        raise InvalidRepo("owner / repo 格式不正确")
    if repo.endswith(".git"):
        repo = repo[:-4]
    return RepoRef(platform=platform, owner=owner, repo=repo)
