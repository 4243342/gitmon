"""任务模式 API：/api/quest/*"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field

from . import quest
from .api import owner_key, session_tokens

router = APIRouter(prefix="/api/quest", tags=["quest"])


def platform_tokens(
    tokens: dict[str, str] = Depends(session_tokens),
    x_github_token: str | None = Header(default=None, alias="X-GitHub-Token"),
    x_gitee_token: str | None = Header(default=None, alias="X-Gitee-Token"),
) -> dict[str, str]:
    """玩家自己的平台令牌，按平台分桶。

    归因核对（``GET /user/starred``）必须用**玩家自己**的令牌 —— 用服务端兜底令牌
    问出来的是「站点账号收藏了没」，跟玩家无关。服务端兜底令牌只在
    ``fetch_repo_meta`` 里当配额垫底用。

    优先级：前端本地令牌（游客 / 本机登录）> 登录会话令牌。
    """
    out = {k: str(v or "")[:300] for k, v in (tokens or {}).items()}
    if x_github_token:
        out["github"] = x_github_token.strip()[:300]
    if x_gitee_token:
        out["gitee"] = x_gitee_token.strip()[:300]
    return out


class IssueRequest(BaseModel):
    goal_key: str = Field(default="star", min_length=1, max_length=40)
    # 目标固定：前端带上只是校验用，留空也行（后端按配置的目标走）
    target: str = Field(default="", max_length=200, description="目标仓库，如 github-owner/repo")


class VerifyRequest(BaseModel):
    id: str = Field(min_length=4, max_length=64, description="任务实例 ID")


@router.get("/board", summary="任务板：今天能领什么、额度还剩多少")
def get_board(key: str = Depends(owner_key)) -> dict[str, Any]:
    return quest.board(key)


@router.post("/issue", summary="领取任务（记录基线星数）")
def post_issue(req: IssueRequest, key: str = Depends(owner_key),
               tokens: dict[str, str] = Depends(platform_tokens)) -> dict[str, Any]:
    # QuestError 由 api.install_error_handlers 统一转成 {"error", "hint"}
    return quest.issue(key, req.goal_key, req.target, tokens=tokens)


@router.post("/verify", summary="提交复审（重新拉星数比对）")
def post_verify(req: VerifyRequest, key: str = Depends(owner_key),
                tokens: dict[str, str] = Depends(platform_tokens)) -> dict[str, Any]:
    return quest.verify(key, req.id, tokens=tokens)


@router.get("/history", summary="历史记录与通过率")
def get_history(key: str = Depends(owner_key)) -> dict[str, Any]:
    return quest.history(key)
