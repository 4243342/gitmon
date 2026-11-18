"""用登录用户的授权读取本人名下的仓库。"""

from typing import Any

from ..config import settings
from ..errors import AuthError, UpstreamError
from . import gitee, github, token_for
from .http import HttpClient


def list_owned_repos(platform: str, token: str) -> list[dict[str, Any]]:
    if not token_for(token, platform):
        raise AuthError("缺少平台授权，请重新登录后读取项目")
    params = {"per_page": 100, "affiliation": "owner"}
    with HttpClient(timeout=settings.http_timeout, retries=settings.http_retries) as http:
        if platform == "github":
            repos = http.get_json(
                f"{github.API}/user/repos",
                params={**params, "sort": "pushed", "direction": "desc"},
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
        else:
            repos = http.get_json(
                f"{gitee.API}/user/repos",
                params={**params, "sort": "updated", "access_token": token},
                platform="gitee",
            )
    if not isinstance(repos, list):
        raise UpstreamError("平台返回的项目清单格式无效")
    return repos
