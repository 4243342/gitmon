"""对话语音 API：/api/tts/*

local / cloud / edge 都在后端合成；system 朗读由浏览器自己做，不经过这里。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import tts

router = APIRouter(prefix="/api/tts", tags=["tts"])


class LLMIn(BaseModel):
    baseUrl: str = Field(default="", max_length=300)
    model: str = Field(default="", max_length=120)
    apiKey: str = Field(default="", max_length=400)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    role: str = Field(default="narrator", max_length=20)
    rate: float = Field(default=1.0, ge=0.5, le=2.0)
    engine: str = Field(default="local", max_length=10)
    llm: LLMIn = Field(default_factory=LLMIn)


@router.post("/speech", summary="合成一句台词（mp3 / wav）")
async def speech(req: SpeechRequest) -> Response:
    try:
        audio, headers = await tts.speech(
            text=req.text, role=req.role, rate=req.rate,
            engine=req.engine, llm_in=req.llm.model_dump(),
        )
    except tts.TTSError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "hint": exc.hint},
            headers={"X-TTS-Error": "1"},
        )
    return Response(
        content=audio,
        media_type=tts.MIME_TYPES.get(req.engine, "audio/mpeg"),
        headers={**headers, "Cache-Control": "private, max-age=86400"},
    )


@router.post("/warm", summary="预热本地模型（1.2s 加载 + 首句开销）")
async def warm() -> dict[str, Any]:
    ok = await asyncio.to_thread(tts.warm)
    return {"warmed": ok, "local": tts.local_ready()}


@router.get("/voices", summary="角色声线表")
def voices() -> dict[str, Any]:
    return tts.voices()


@router.get("/health", summary="语音缓存与各引擎可用性")
def health() -> dict[str, Any]:
    return tts.health()
