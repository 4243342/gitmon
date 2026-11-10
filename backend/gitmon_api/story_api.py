"""剧情模式 API：/api/story/*"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field

from . import story
from .api import owner_key, session_token

router = APIRouter(prefix="/api/story", tags=["story"])


def github_token(
    token: str = Depends(session_token),
    x_github_token: str | None = Header(default=None, alias="X-GitHub-Token"),
) -> str:
    """GitHub 令牌：OAuth 会话优先，其次前端本地令牌（游客 / 本机登录时浏览器自己存的那枚）。"""
    return (x_github_token or token or "").strip()[:300]


class LLMIn(BaseModel):
    baseUrl: str = Field(default="", max_length=300)
    apiKey: str = Field(default="", max_length=500, description="只在本次请求中使用，不落库")
    model: str = Field(default="", max_length=120)


class PreviewRequest(BaseModel):
    pet: dict[str, Any] = Field(description="主角精灵（完整卡面字段）")
    llm: LLMIn = Field(default_factory=LLMIn)
    seed: int | None = None
    refresh: bool = False


class BossCheckRequest(BaseModel):
    full_name: str = Field(min_length=3, max_length=200, description="owner/repo 或 GitHub / Gitee 地址")
    platform: str = Field(default="github", max_length=20)


class ScriptsRequest(BaseModel):
    pet: dict[str, Any]
    boss: dict[str, Any]
    llm: LLMIn = Field(default_factory=LLMIn)


class CustomScriptRequest(BaseModel):
    pet: dict[str, Any]
    boss: dict[str, Any]
    input: str = Field(min_length=1, max_length=200)
    llm: LLMIn = Field(default_factory=LLMIn)


class StartRequest(BaseModel):
    pet: dict[str, Any]
    boss: dict[str, Any]
    script: dict[str, Any]
    track: str = Field(default="", max_length=60)
    rationale: str = Field(default="", max_length=240)
    queries: list[str] = Field(default_factory=list, max_length=8)
    selection_source: str = Field(default="ai", max_length=20)
    seed: int | None = None
    llm: LLMIn = Field(default_factory=LLMIn)


class TextRequest(BaseModel):
    scene_id: str = Field(default="", max_length=60)
    keys: list[str] = Field(default_factory=list, max_length=6)
    vars: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    llm: LLMIn = Field(default_factory=LLMIn)


class ProgressRequest(BaseModel):
    run_id: str = Field(min_length=4, max_length=40)
    step: int
    scene_id: str = Field(default="", max_length=60)
    ink_state: str = Field(default="", max_length=200000)
    vars: dict[str, Any] = Field(default_factory=dict)
    visited: list[str] = Field(default_factory=list, max_length=200)
    history: list[Any] = Field(default_factory=list, max_length=100)
    rollback_state: str = Field(default="", max_length=200000)
    ending_id: str = Field(default="", max_length=40)


class SaveRequest(BaseModel):
    run_id: str = Field(min_length=4, max_length=40)
    slot: int = Field(ge=1, le=5)
    scene_id: str = Field(default="", max_length=60)
    vars: dict[str, Any] = Field(default_factory=dict)
    visited: list[str] = Field(default_factory=list, max_length=200)
    ink_state: str = Field(default="", max_length=200000)


class LoadRequest(BaseModel):
    run_id: str = Field(min_length=4, max_length=40)
    slot: int = Field(ge=1, le=5)


class RunRequest(BaseModel):
    run_id: str = Field(min_length=4, max_length=40)


class CloseRequest(BaseModel):
    run_id: str = Field(min_length=4, max_length=40)
    reason: str = Field(default="abandon", max_length=20)


@router.post("/preview", summary="选 Boss 预演（不落库）")
async def preview(req: PreviewRequest, user: str = Depends(owner_key),
                  token: str = Depends(github_token)) -> dict[str, Any]:
    return await story.preview(
        req.pet, req.llm.model_dump(), seed=story._seed(req.seed),
        token=token or "", refresh=req.refresh,
    )


@router.post("/boss/check", summary="自选 Boss 校验")
def boss_check(req: BossCheckRequest, token: str = Depends(github_token)) -> dict[str, Any]:
    return story.boss_card(req.full_name, token or "", platform=req.platform, reason="你的自选方向")


@router.post("/scripts", summary="Boss 选定后生成 3 个剧本方案（不落库）")
async def scripts(req: ScriptsRequest) -> dict[str, Any]:
    return await story.scripts(req.pet, req.boss, req.llm.model_dump())


@router.post("/scripts/custom", summary="自选剧本 / 小说桥接")
async def custom_script(req: CustomScriptRequest) -> dict[str, Any]:
    return await story.custom_script(req.pet, req.boss, req.input, req.llm.model_dump())


@router.post("/start", summary="建线（C1：已有 active 返回 409）")
def start(req: StartRequest, user: str = Depends(owner_key), token: str = Depends(github_token)) -> dict[str, Any]:
    return story.create_run(
        user,
        pet=req.pet,
        boss=req.boss,
        script=req.script,
        track=req.track,
        rationale=req.rationale,
        queries=req.queries,
        selection_source=req.selection_source,
        seed=story._seed(req.seed),
        token=token or "",
        llm_in=req.llm.model_dump(),
    )


@router.get("/current", summary="当前剧情线 + 存档槽")
def current(user: str = Depends(owner_key)) -> dict[str, Any]:
    from .db import db

    with db.connect() as conn:
        run = story.active_run(conn, user)
        saves = story.list_saves(conn, run["id"]) if run else []
        latest = None if run else story.latest_run(conn, user)
    return {
        "run": run,
        "latest": latest,
        "saves": saves,
        "desk": {"key": run["pet_key"] if run else None, "locked": bool(run)},
    }


@router.post("/text", summary="实时生成 / 取缓存当前屏台词")
async def text(req: TextRequest) -> dict[str, Any]:
    return await story.generate_text(
        scene_id=req.scene_id, keys=req.keys, vars_=req.vars,
        context=req.context, llm_in=req.llm.model_dump(),
    )


@router.post("/progress", summary="推进并持久化 ink 状态")
def progress(req: ProgressRequest, user: str = Depends(owner_key)) -> dict[str, Any]:
    return story.progress(user, req.run_id, req.model_dump())


@router.post("/save", summary="存档（5 槽）")
def save(req: SaveRequest, user: str = Depends(owner_key)) -> dict[str, Any]:
    return story.save_slot(user, req.run_id, req.model_dump())


@router.post("/load", summary="读档")
def load(req: LoadRequest, user: str = Depends(owner_key)) -> dict[str, Any]:
    return story.load_slot(user, req.run_id, req.slot)


@router.post("/rollback", summary="回滚到上一个选择之前")
def rollback(req: RunRequest, user: str = Depends(owner_key)) -> dict[str, Any]:
    return story.rollback(user, req.run_id)


@router.get("/endings", summary="结局收集册（跨周目）")
def endings(user: str = Depends(owner_key)) -> dict[str, Any]:
    items = story.endings(user)
    return {"items": items, "total": len(items), "all": story.ENDING_TITLES}


@router.get("/archive", summary="历史剧情线")
def archive(user: str = Depends(owner_key)) -> dict[str, Any]:
    return {"items": story.archive(user)}


@router.post("/close", summary="结案 / 放弃")
def close(req: CloseRequest, user: str = Depends(owner_key)) -> dict[str, Any]:
    return story.close_run(user, req.run_id, req.reason)
