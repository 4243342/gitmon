"""登录授权路由：GitHub OAuth 与个人访问令牌。"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, field_validator

from . import auth
from .config import settings
from .errors import AuthError

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_PATH = "/"
# 配额查询结果缓存 2 分钟，避免每次刷新页面都打一次 GitHub
_quota_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _session_sid(request: Request) -> str:
    return request.cookies.get(auth.SESSION_COOKIE, "")


def _current_user(request: Request) -> dict[str, Any] | None:
    return auth.resolve_session(_session_sid(request))


def _set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        auth.SESSION_COOKIE,
        sid,
        max_age=settings.session_ttl,
        httponly=True,
        samesite="lax",
        secure=settings.public_base_url.startswith("https://"),
        path=COOKIE_PATH,
    )


def _safe_next(raw: str | None) -> str:
    """只允许站内相对路径，避免开放重定向。"""
    value = (raw or "").strip()
    if not value.startswith("/") or value.startswith("//"):
        return "/"
    return value[:300]


class TokenLogin(BaseModel):
    token: str = Field(min_length=8, max_length=300, description="GitHub 个人访问令牌（ghp_ / github_pat_）")

    @field_validator("token")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


# ---------------------------------------------------------------- 元信息

@router.get("/providers", summary="登录方式可用性")
def providers() -> dict[str, Any]:
    return {
        "github": {
            "oauth": auth.oauth_enabled(),
            "loginUrl": "/api/auth/github/start",
            "callback": auth.callback_url(),
            "scopes": auth.DEFAULT_SCOPES,
            "console": "https://github.com/settings/developers",
            "tokenUrl": "https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitMon",
        },
        "anonymous": {"quotaPerHour": 60, "authenticatedPerHour": 5000},
    }


@router.get("/me", summary="当前登录用户")
def me(request: Request, quota: bool = Query(default=False, description="是否顺带查一次配额")) -> JSONResponse:
    user = _current_user(request)
    quota_info: dict[str, Any] = {}
    if user and quota and user.get("token"):
        cached = _quota_cache.get(user["id"])
        if cached and time.time() - cached[0] < 120:
            quota_info = cached[1]
        else:
            quota_info = auth.github_quota(user["token"])
            if quota_info:
                _quota_cache[user["id"]] = (time.time(), quota_info)
    payload = auth.public_profile(user, quota=quota_info)
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.get("/token", summary="取回令牌（浏览器直连 GitHub 用）")
def token(request: Request) -> JSONResponse:
    user = _current_user(request)
    if not user:
        raise AuthError("未登录", hint="先完成 GitHub 授权")
    return JSONResponse(
        {"token": user.get("token", ""), "login": user.get("login", "")},
        headers={"Cache-Control": "no-store"},
    )


# ---------------------------------------------------------------- OAuth

@router.get("/github/start", summary="跳转 GitHub 授权页")
def github_start(next: str = Query(default="/", alias="next")) -> RedirectResponse:
    state = auth.sign_state(_safe_next(next))
    response = RedirectResponse(auth.authorize_url(state), status_code=302)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/github/callback", summary="GitHub 授权回调")
def github_callback(
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
    error_description: str = Query(default=""),
) -> RedirectResponse:
    fallback = "/?auth=failed"
    if error:
        reason = quote(error_description or error)
        return RedirectResponse(f"{fallback}&reason={reason}", status_code=302)
    try:
        next_path = auth.verify_state(state)
        if not code:
            raise AuthError("缺少授权码")
        token_value, scopes = auth.exchange_code(code)
        profile = auth.github_profile(token_value)
        user = auth.upsert_user(
            provider="github",
            login=str(profile.get("login") or ""),
            name=str(profile.get("name") or ""),
            avatar=str(profile.get("avatar_url") or ""),
            email=str(profile.get("email") or ""),
            token=token_value,
            scopes=scopes,
            source="oauth",
        )
        sid = auth.create_session(user["id"])
    except AuthError as exc:
        reason = quote(exc.message)
        return RedirectResponse(f"{fallback}&reason={reason}", status_code=302)

    target = settings.web_url or next_path
    response = RedirectResponse(f"{target}?auth=ok", status_code=302)
    _set_session_cookie(response, sid)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/github/token", summary="用个人访问令牌登录")
def github_token_login(payload: TokenLogin) -> JSONResponse:
    profile = auth.github_profile(payload.token)
    login = str(profile.get("login") or "")
    if not login:
        raise AuthError("令牌无效：GitHub 没有返回用户信息")
    scopes = ""
    user = auth.upsert_user(
        provider="github",
        login=login,
        name=str(profile.get("name") or ""),
        avatar=str(profile.get("avatar_url") or ""),
        email=str(profile.get("email") or ""),
        token=payload.token,
        scopes=scopes,
        source="pat",
    )
    sid = auth.create_session(user["id"])
    quota_info = auth.github_quota(payload.token)
    _quota_cache[user["id"]] = (time.time(), quota_info)
    response = JSONResponse(auth.public_profile(user, quota=quota_info), headers={"Cache-Control": "no-store"})
    _set_session_cookie(response, sid)
    return response


@router.post("/logout", summary="退出登录")
def logout(request: Request) -> JSONResponse:
    user = _current_user(request)
    auth.logout(user, _session_sid(request))
    if user:
        _quota_cache.pop(user.get("id", ""), None)
    response = JSONResponse({"ok": True})
    response.delete_cookie(auth.SESSION_COOKIE, path=COOKIE_PATH)
    return response


@router.get("/github/repo-scope", summary="令牌能否读私有仓库")
def repo_scope(request: Request, x_github_token: str | None = Header(default=None, alias="X-GitHub-Token")) -> dict[str, Any]:
    """给前端一个自检：令牌能不能访问私有仓库（决定图鉴里能不能放私有项目）。"""
    user = _current_user(request)
    probe = x_github_token or (user or {}).get("token", "")
    if not probe:
        raise AuthError("未登录")
    headers = {"Authorization": f"Bearer {probe}"}
    import httpx

    try:
        with httpx.Client(timeout=10.0, headers={"User-Agent": "GitMon/0.2"}) as client:
            resp = client.get("https://api.github.com/user", headers=headers)
    except httpx.HTTPError:
        raise AuthError("连接 GitHub 失败") from None
    scopes = resp.headers.get("x-oauth-scopes", "")
    return {"login": (resp.json() or {}).get("login", ""), "scopes": [s.strip() for s in scopes.split(",") if s.strip()]}
