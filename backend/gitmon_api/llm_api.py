"""高级模式 API：/api/llm/*

密钥只出现在请求体里，服务端转发一次即丢弃；不写日志、不入库、不回传。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import byok, llm

router = APIRouter(prefix="/api/llm", tags=["llm"])

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"


class LLMEvalRequest(BaseModel):
    repo: str = Field(min_length=1, max_length=200, description="仓库地址或 owner/repo")
    baseUrl: str = Field(default=DEFAULT_BASE_URL, max_length=300)
    apiKey: str = Field(default="", max_length=500, description="只在本次请求中使用")
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=120)
    hint: str = Field(default="", max_length=1000, description="用户补充的线索/额外要求")
    platform: str = Field(default="github", max_length=20)

    @field_validator("repo", "model")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("platform")
    @classmethod
    def _platform(cls, value: str) -> str:
        return "gitee" if value.strip().lower() == "gitee" else "github"


class CustomEndpoint(BaseModel):
    baseUrl: str = Field(max_length=300)
    label: str = Field(default="自定义端点", max_length=40)
    model: str = Field(default="", max_length=120)


class BindRequest(BaseModel):
    apiKey: str = Field(min_length=8, max_length=500, description="裸密钥 / 厂商id=密钥 / .env 片段")
    custom: CustomEndpoint | None = Field(default=None, description="自托管端点，填了就只探测它")


@router.get("/config", summary="高级模式默认配置与可选枚举")
def config() -> dict[str, Any]:
    return {
        "defaultBaseUrl": DEFAULT_BASE_URL,
        "defaultModel": DEFAULT_MODEL,
        "elements": sorted(llm.ELEMENT_KEYS),
        "species": sorted(llm.SPECIES_KEYS),
        "qualities": sorted(llm.QUALITY_KEYS),
        "statNames": llm.STAT_NAMES,
        "qualityDimKeys": llm.QUALITY_DIM_KEYS,
        "providers": [{"id": p["id"], "label": p["label"]} for p in byok.PROVIDERS],
        "note": "只填密钥即可自动识别厂商与模型；API Key 只在本标签页保存，服务端不落盘",
    }


@router.post("/bind", summary="只给密钥，自动识别厂商 / 接口 / 模型")
async def bind(req: BindRequest) -> dict[str, Any]:
    try:
        return await byok.bind(req.apiKey, custom=req.custom.model_dump() if req.custom else None)
    except llm.LLMError as exc:
        raise HTTPException(status_code=400, detail={"error": exc.message, "hint": exc.hint}) from None


@router.post("/evaluate", summary="让模型推测仓库画像并完成全部评测")
async def evaluate(req: LLMEvalRequest) -> dict[str, Any]:
    try:
        return await llm.evaluate_repo(
            repo=req.repo,
            base_url=req.baseUrl,
            api_key=req.apiKey,
            model=req.model,
            hint=req.hint,
            platform=req.platform,
        )
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail={"error": exc.message, "hint": exc.hint}) from None
