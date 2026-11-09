"""高级模式 API：/api/llm/*

密钥只出现在请求体里，服务端转发一次即丢弃；不写日志、不入库、不回传。
"""

from __future__ import annotations

import json
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
    evidence: dict[str, Any] | None = Field(
        default=None,
        description="深度审计流水线真实抓取的证据（languages/commits/CI…），注入提示词且优先于模型记忆",
    )

    @field_validator("repo", "model")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("platform")
    @classmethod
    def _platform(cls, value: str) -> str:
        return "gitee" if value.strip().lower() == "gitee" else "github"

    @field_validator("evidence")
    @classmethod
    def _evidence_size(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        if len(json.dumps(value, ensure_ascii=False)) > 8192:
            raise ValueError("evidence 超过 8KB，请由前端截断后再发")
        return value


class CustomEndpoint(BaseModel):
    baseUrl: str = Field(max_length=300)
    label: str = Field(default="自定义端点", max_length=40)
    model: str = Field(default="", max_length=120)


class BindRequest(BaseModel):
    apiKey: str = Field(min_length=8, max_length=500, description="裸密钥 / 厂商id=密钥 / .env 片段")
    custom: CustomEndpoint | None = Field(default=None, description="自托管端点，填了就只探测它")


class PingRequest(BaseModel):
    baseUrl: str = Field(default=DEFAULT_BASE_URL, max_length=300)
    apiKey: str = Field(default="", max_length=500, description="只在本次请求中使用")
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=120)


class BattleRequest(BaseModel):
    player: dict[str, Any] = Field(description="我方项目画像（前端卡面字段）")
    opponent: dict[str, Any] = Field(description="对手项目画像")
    difficulty: str = Field(default="normal", max_length=16)
    baseUrl: str = Field(default=DEFAULT_BASE_URL, max_length=300)
    apiKey: str = Field(default="", max_length=500, description="只在本次请求中使用")
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=120)

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, value: str) -> str:
        return value if value in {"easy", "normal", "hard"} else "normal"

    @field_validator("player", "opponent")
    @classmethod
    def _profile_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False)) > 4096:
            raise ValueError("画像超过 4KB，请由前端截断后再发")
        return value


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


@router.post("/ping", summary="连接测试：高级模式开启前先确认模型接口真的能通")
async def ping(req: PingRequest) -> dict[str, Any]:
    try:
        return await llm.ping(base_url=req.baseUrl, api_key=req.apiKey, model=req.model)
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail={"error": exc.message, "hint": exc.hint}) from None


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
            evidence=req.evidence,
        )
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail={"error": exc.message, "hint": exc.hint}) from None


@router.post("/battle", summary="高级竞技场：模型对比两个项目水平，推演回合对战并出审计报告")
async def battle(req: BattleRequest) -> dict[str, Any]:
    try:
        return await llm.battle_simulation(
            player=req.player,
            opponent=req.opponent,
            difficulty=req.difficulty,
            base_url=req.baseUrl,
            api_key=req.apiKey,
            model=req.model,
        )
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail={"error": exc.message, "hint": exc.hint}) from None
