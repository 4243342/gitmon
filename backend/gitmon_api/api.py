"""REST API 层：只做参数校验、错误翻译和序列化。"""

from __future__ import annotations

import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from . import auth, cloud, engine, growth, services
from .badge import badge_svg, card_svg, placeholder_badge
from .config import settings
from .errors import AuthError, PetNotFound, ScanError
from .queue import Job, scan_queue
from .repo import InvalidRepo, parse_repo, ref_from_parts

router = APIRouter()

_USER_RE = re.compile(r"[^A-Za-z0-9_-]")


def owner_key(x_gitmon_user: str | None = Header(default=None, alias="X-Gitmon-User")) -> str:
    """匿名用户标识：前端 localStorage 生成的设备 ID，没有就落到公共图鉴。"""
    if not x_gitmon_user:
        return "public"
    cleaned = _USER_RE.sub("", x_gitmon_user)[:64]
    return cleaned or "public"


def session_token(request: Request) -> str:
    """登录用户的 GitHub 令牌；未登录返回空串，退回服务端兜底令牌。"""
    user = auth.resolve_session(request.cookies.get(auth.SESSION_COOKIE, ""))
    return (user or {}).get("token", "") if user else ""


class HatchRequest(BaseModel):
    repo: str = Field(min_length=2, max_length=400, description="仓库地址，支持 GitHub / Gitee")
    refresh: bool = Field(default=False, description="忽略 6 小时快照缓存，强制重新扫描")

    @field_validator("repo")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class JobResponse(BaseModel):
    jobId: str
    status: str
    repo: str
    petId: str | None = None
    pet: dict[str, Any] | None = None
    error: str = ""
    hint: str = ""


def _svg(content: str, max_age: int = 21600) -> Response:
    return Response(
        content=content,
        media_type="image/svg+xml; charset=utf-8",
        headers={"Cache-Control": f"public, max-age={max_age}", "X-Content-Type-Options": "nosniff"},
    )


# ---------------------------------------------------------------- 健康与元信息

@router.get("/api/health", tags=["meta"])
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "version": "0.2.0",
        "tokens": {"github": bool(settings.github_token), "gitee": bool(settings.gitee_token)},
        "login": {
            "githubOAuth": auth.oauth_enabled(),
            "giteeOAuth": auth.gitee_oauth_enabled(),
            "callback": auth.callback_url(),
        },
        "queue": scan_queue.pending(),
        "cacheTtl": settings.cache_ttl,
        "scc": settings.use_scc,
        "time": int(time.time()),
    }


@router.get("/api/meta", tags=["meta"])
def meta() -> dict[str, Any]:
    return {
        "elements": [{"key": e["key"], "name": e["name"], "color": e["color"], "trait": e["trait"]} for e in engine.ELEMENTS],
        "species": [{"key": s["key"], "name": s["name"], "type": s["type"], "body": s["body"]} for s in engine.SPECIES],
        "qualities": engine.QUALITIES,
        "qualityWeights": engine.QUALITY_WEIGHTS,
        "xpRules": growth.XP_RULES,
        "statNames": engine.STAT_NAMES,
        "stages": engine.STAGE_NAMES,
    }


# ---------------------------------------------------------------- 孵化

@router.post("/api/hatch", status_code=202, tags=["hatch"])
def hatch_async(payload: HatchRequest, user: str = Depends(owner_key),
                token: str = Depends(session_token)) -> dict[str, Any]:
    """提交扫描任务，立即返回 jobId；前端轮询 /api/jobs/{jobId}。"""
    ref = parse_repo(payload.repo)  # 先校验，非法地址不进队列
    job = scan_queue.submit("hatch", ref.html_url, user, refresh=payload.refresh, token=token)
    return {"jobId": job.id, "status": job.status, "repo": ref.full_name, "platform": ref.platform}


@router.post("/api/hatch/sync", tags=["hatch"])
def hatch_now(payload: HatchRequest, user: str = Depends(owner_key),
              token: str = Depends(session_token)) -> dict[str, Any]:
    """同步孵化：小仓库通常 1~3 秒，适合脚本/冷启动预热。"""
    return services.hatch(payload.repo, user, refresh=payload.refresh, token=token)


@router.get("/api/jobs/{job_id}", response_model=JobResponse, tags=["hatch"])
def job_status(job_id: str) -> dict[str, Any]:
    job = scan_queue.get(job_id)
    if job is None or job.kind in {"cloud-preview", "cloud-box"}:
        raise PetNotFound("任务不存在或已过期")
    return job.to_dict()


# ---------------------------------------------------------------- 登录用户孵化与云图鉴

# 用途属性版本开启新一轮云图鉴，旧收藏与预览不进入本轮。
_CLOUD_COLLECTION_VERSION = 2

def cloud_user(request: Request) -> dict[str, Any]:
    user = auth.resolve_session(request.cookies.get(auth.SESSION_COOKIE, ""))
    if not user:
        raise AuthError("请登录后使用云图鉴")
    return user


def _cloud_owner(user: dict[str, Any]) -> str:
    return f"cloud:v{_CLOUD_COLLECTION_VERSION}:{user['id']}"


def _cloud_scan_token(user: dict[str, Any], platform: str) -> str:
    if user["provider"] != platform:
        return ""
    if platform == "gitee" and user["source"] == "oauth":
        return auth.ensure_gitee_token(user)
    return user["token"]


def _cloud_job(job_id: str, user: dict[str, Any], *, kind: str = "cloud-preview") -> Job:
    job = scan_queue.get(job_id)
    if (job is None or job.kind != kind or job.owner_key != _cloud_owner(user)
            or (job.finished_at is not None and time.time() - job.finished_at > 3600)):
        message = "卡箱不存在或已过期，请重新读取我的项目" if kind == "cloud-box" else "孵化预览不存在或已过期"
        raise PetNotFound(message)
    return job


def _preview_pet(job: Job) -> dict[str, Any]:
    if job.status != "done" or job.pet is None:
        raise PetNotFound("孵化预览尚未完成")
    return job.pet


def _cloud_image(pet: dict[str, Any], stage: int) -> Response:
    return Response(cloud.image(pet, stage), media_type="image/png", headers={"Cache-Control": "private, no-store"})


@router.post("/api/cloud/previews", status_code=202, tags=["hatch"])
def start_cloud_preview(payload: HatchRequest, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, str]:
    ref = parse_repo(payload.repo)
    token = _cloud_scan_token(user, ref.platform)
    job = scan_queue.submit("cloud-preview", ref.html_url, _cloud_owner(user), token=token)
    return {"jobId": job.id}


@router.get("/api/cloud/previews/{job_id}", response_model=JobResponse, tags=["hatch"])
def cloud_preview_status(job_id: str, response: Response,
                         user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    job = _cloud_job(job_id, user)
    payload = job.to_dict()
    payload["pet"] = cloud.presentation(job.pet, f"previews/{job_id}") if job.status == "done" and job.pet else None
    response.headers["Cache-Control"] = "private, no-store"
    return payload


@router.get("/api/cloud/previews/{job_id}/sprite.png", tags=["render"])
def cloud_preview_sprite(job_id: str, stage: int = Query(ge=1, le=3),
                         user: dict[str, Any] = Depends(cloud_user)) -> Response:
    return _cloud_image(_preview_pet(_cloud_job(job_id, user)), stage)


@router.post("/api/cloud/previews/{job_id}/collect", tags=["pets"])
def collect_preview(job_id: str, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    return cloud.presentation(cloud.collect(_preview_pet(_cloud_job(job_id, user))))


@router.post("/api/cloud/boxes", status_code=202, tags=["hatch"])
def start_cloud_box(user: dict[str, Any] = Depends(cloud_user)) -> dict[str, str]:
    platform = user["provider"]
    token = _cloud_scan_token(user, platform)
    if not token:
        raise AuthError("请重新登录后读取项目")
    job = scan_queue.submit("cloud-box", f"{platform}/{user['login']}", _cloud_owner(user), token=token)
    return {"jobId": job.id}


@router.get("/api/cloud/boxes/{job_id}", tags=["hatch"])
def cloud_box_status(job_id: str, response: Response, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    job = _cloud_job(job_id, user, kind="cloud-box")
    response.headers["Cache-Control"] = "private, no-store"
    payload = {"status": job.status, "progress": job.progress, "error": job.error}
    if job.status == "done" and job.box is not None:
        payload["box"] = {
            **job.box,
            "owner": {
                "platform": user["provider"],
                "owner": user["login"],
                "displayName": user["name"] or user["login"],
                "avatar": user["avatar"],
            },
            "pets": cloud.presentations(job.box["pets"], lambda pet: f"boxes/{job_id}/pets/{pet['id']}"),
        }
    return payload


def _box_pets(job_id: str, user: dict[str, Any]) -> list[dict[str, Any]]:
    job = _cloud_job(job_id, user, kind="cloud-box")
    if job.status != "done" or job.box is None:
        raise PetNotFound("卡箱尚未准备好")
    return job.box["pets"]


def _box_pet(job_id: str, pet_id: str, user: dict[str, Any]) -> dict[str, Any]:
    for pet in _box_pets(job_id, user):
        if pet["id"] == pet_id:
            return pet
    raise PetNotFound("卡箱里没有这只精灵")


@router.get("/api/cloud/boxes/{job_id}/pets/{pet_id}/sprite.png", tags=["render"])
def cloud_box_sprite(job_id: str, pet_id: str, stage: int = Query(ge=1, le=3),
                     user: dict[str, Any] = Depends(cloud_user)) -> Response:
    return _cloud_image(_box_pet(job_id, pet_id, user), stage)


@router.post("/api/cloud/boxes/{job_id}/pets/{pet_id}/collect", tags=["pets"])
def collect_box_pet(job_id: str, pet_id: str, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    return cloud.presentation(cloud.collect(_box_pet(job_id, pet_id, user)))


@router.post("/api/cloud/boxes/{job_id}/collect", tags=["pets"])
def collect_box(job_id: str, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    pets = cloud.collect_many(_box_pets(job_id, user))
    return {"items": cloud.presentations(pets)}


@router.get("/api/cloud/pets", tags=["pets"])
def cloud_collection(response: Response, limit: int = Query(60, ge=1, le=200), offset: int = Query(0, ge=0),
                     user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    response.headers["Cache-Control"] = "private, no-store"
    return cloud.collection(_cloud_owner(user), limit, offset)


@router.get("/api/cloud/pets/{pet_id}/sprite.png", tags=["render"])
def cloud_pet_sprite(pet_id: str, stage: int = Query(ge=1, le=3),
                     user: dict[str, Any] = Depends(cloud_user)) -> Response:
    return _cloud_image(cloud.collected_pet(pet_id, _cloud_owner(user)), stage)


@router.post("/api/cloud/pets/{pet_id}/refresh", tags=["pets"])
def refresh_cloud_pet(pet_id: str, user: dict[str, Any] = Depends(cloud_user)) -> dict[str, Any]:
    pet = cloud.collected_pet(pet_id, _cloud_owner(user))
    return cloud.presentation(cloud.refresh(pet, _cloud_scan_token(user, pet["platform"])))


# ---------------------------------------------------------------- 图鉴

@router.get("/api/pets", tags=["pets"])
def list_collection(
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: str = Depends(owner_key),
) -> dict[str, Any]:
    return services.collection(user, limit, offset)


@router.get("/api/pets/{pet_id}", tags=["pets"])
def pet_detail(pet_id: str) -> dict[str, Any]:
    return services.detail(pet_id)


@router.delete("/api/pets/{pet_id}", status_code=204, tags=["pets"])
def delete_pet(pet_id: str) -> Response:
    services.remove(pet_id)
    return Response(status_code=204)


@router.post("/api/pets/{pet_id}/sync", tags=["pets"])
def sync_pet(pet_id: str, token: str = Depends(session_token)) -> dict[str, Any]:
    return services.sync(pet_id, token=token)


@router.get("/api/pets/{pet_id}/growth", tags=["pets"])
def pet_growth(pet_id: str, limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    from .db import db, get_pet, list_growth

    with db.connect() as conn:
        if get_pet(conn, pet_id) is None:
            raise PetNotFound()
        return {"items": list_growth(conn, pet_id, limit)}


@router.get("/api/leaderboard", tags=["pets"])
def leaderboard(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    return services.leaderboard(limit)


# ---------------------------------------------------------------- 立绘与卡片

@router.get("/api/pets/{pet_id}/sprite.png", tags=["render"])
def pet_sprite(pet_id: str) -> Response:
    path = services.sprite_file(pet_id)
    return Response(
        content=path.read_bytes(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@router.get("/api/sprites/{platform}/{owner}/{repo}.png", tags=["render"])
def sprite_by_repo(platform: str, owner: str, repo: str,
                   stage: int | None = Query(default=None, ge=1, le=3)) -> Response:
    ref = ref_from_parts(platform, owner, repo)
    payload, _ = services.sprite_by_ref(ref, stage=stage)
    return Response(
        content=payload,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@router.get("/badge/{platform}/{owner}/{repo}.svg", tags=["render"])
def repo_badge(platform: str, owner: str, repo: str, token: str = Depends(session_token)) -> Response:
    try:
        ref = ref_from_parts(platform, owner, repo)
    except InvalidRepo:
        return _svg(placeholder_badge("invalid repo"), max_age=300)
    api = services.ensure_pet_for_badge(ref, token=token)
    if api is None:
        return _svg(placeholder_badge("scan pending"), max_age=300)
    return _svg(badge_svg(api))


@router.get("/card/{platform}/{owner}/{repo}.svg", tags=["render"])
def repo_card(platform: str, owner: str, repo: str, token: str = Depends(session_token)) -> Response:
    ref = ref_from_parts(platform, owner, repo)
    api = services.ensure_pet_for_badge(ref, token=token)
    if api is None:
        return _svg(placeholder_badge("scan pending"), max_age=300)
    return _svg(card_svg(api))


# ---------------------------------------------------------------- 错误处理

def install_error_handlers(app) -> None:
    @app.exception_handler(ScanError)
    async def _scan_error(request: Request, exc: ScanError) -> JSONResponse:
        headers = {}
        if exc.retry_after:
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=getattr(exc, "status_code", 502),
            content={"error": exc.message, "hint": exc.hint},
            headers=headers,
        )

    @app.exception_handler(InvalidRepo)
    async def _invalid_repo(request: Request, exc: InvalidRepo) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": str(exc), "hint": "示例：https://github.com/facebook/react"})
