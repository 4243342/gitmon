"""仓库元信息与收藏状态：任务验真用的两个轻量接口。

不复用完整扫描（12~17 个请求）：点星任务只需要两件事——

1. 这个仓库现在有多少星（``stargazers_count``）
2. 当前登录的账号收藏了它没有（``GET /user/starred/{owner}/{repo}``）

第二个接口是「归因核对」：只对比星数涨没涨，分不清是本人点的还是别人点的；
它能把「这次点星确实是这个人做的」钉死。

两个平台都有对应的收藏查询接口：
- GitHub：``GET /user/starred/{owner}/{repo}`` → 204 已收藏 / 404 没收藏
- Gitee：``GET /api/v5/user/starred/{owner}/{repo}`` → 204 已收藏 / 404 没收藏
"""

from __future__ import annotations

from typing import Any

from ..config import settings
from ..errors import ScanError
from ..repo import RepoRef
from .http import HttpClient
from .tokens import token_for

GITHUB_API = "https://api.github.com"
GITEE_API = "https://gitee.com/api/v5"


def _headers(token: str | None, platform: str) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_repo_meta(ref: RepoRef, token: str | None = None) -> dict[str, Any]:
    """拉仓库元信息。任务验真只取其中的 ``stargazers_count``。

    令牌优先用玩家的（配额高、能看到私有仓库），没有就用服务端兜底令牌。
    """
    with HttpClient(timeout=settings.http_timeout, retries=settings.http_retries) as http:
        if ref.platform == "gitee":
            auth = token_for(token, "gitee") or settings.gitee_token
            params = {"access_token": auth} if auth else {}
            data = http.get_json(f"{GITEE_API}/repos/{ref.full_name}", params=params, platform="gitee")
        else:
            auth = token_for(token, "github") or settings.github_token
            data = http.get_json(
                f"{GITHUB_API}/repos/{ref.full_name}",
                headers=_headers(auth, "github"),
                platform="github",
            )
    return data if isinstance(data, dict) else {}


def check_starred(ref: RepoRef, token: str | None) -> bool | None:
    """当前令牌的账号是否收藏了该仓库。

    返回 ``True``（确认收藏）/ ``False``（确认没收藏）/ ``None``（查不出来）。

    ``None`` 必须和 ``False`` 区分开：查不出来（没令牌、令牌失效、接口抽风）不等于
    「没收藏」—— 前者只能给部分奖励，后者说明玩家压根没点。
    """
    if not token:
        return None
    try:
        with HttpClient(timeout=settings.http_timeout, retries=settings.http_retries) as http:
            if ref.platform == "gitee":
                auth = token_for(token, "gitee")
                if not auth:
                    return None
                resp = http.get(
                    f"{GITEE_API}/user/starred/{ref.full_name}",
                    params={"access_token": auth},
                    platform="gitee",
                    accept=(204, 404),
                )
            else:
                auth = token_for(token, "github")
                if not auth:
                    return None
                resp = http.get(
                    f"{GITHUB_API}/user/starred/{ref.full_name}",
                    headers=_headers(auth, "github"),
                    platform="github",
                    accept=(204, 404),
                )
    except ScanError:
        return None
    # 204 = 已收藏，404 = 没收藏（或仓库不存在）
    if resp.status_code == 204:
        return True
    if resp.status_code == 404:
        return False
    return None
