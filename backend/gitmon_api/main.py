"""应用装配：路由 + CORS + 限流 + 静态托管 + 定时结算。"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import services
from .api import install_error_handlers
from .api import router as api_router
from .auth_api import router as auth_router
from .config import Settings, settings as default_settings
from .db import db


class RateLimiter:
    """按 IP 的滑动窗口限流，够挡住恶意刷扫描配额就行。"""

    def __init__(self, limit_per_min: int) -> None:
        self.limit = limit_per_min
        self._hits: dict[str, deque[float]] = {}
        self._last_cleanup = time.time()

    def check(self, key: str) -> bool:
        if self.limit <= 0:
            return True
        now = time.time()
        bucket = self._hits.setdefault(key, deque())
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        if now - self._last_cleanup > 300:
            self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < 120}
            self._last_cleanup = now
        return True


def create_app(settings: Settings | None = None, *, start_queue: bool = True) -> FastAPI:
    cfg = settings or default_settings
    cfg.ensure_dirs()
    if cfg.db_path != db.path:
        db.path = cfg.db_path
        db._ready = False

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        db.init()
        from .queue import scan_queue

        application.state.scan_queue = scan_queue
        if start_queue:
            scan_queue.start()
        _warm_tts_in_background()
        scheduler = asyncio.create_task(_daily_loop(cfg)) if cfg.daily_sync else None
        try:
            yield
        finally:
            if scheduler is not None:
                scheduler.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await scheduler

    app = FastAPI(
        title="GitMon API",
        version="0.2.0",
        description="把任意 GitHub / Gitee 仓库孵化为一只精灵：扫描 → 判定 → 养成。",
        openapi_tags=[
            {"name": "auth", "description": "GitHub 登录授权（OAuth / 个人访问令牌）"},
            {"name": "hatch", "description": "孵化与扫描任务"},
            {"name": "pets", "description": "图鉴、详情与同步结算"},
            {"name": "render", "description": "立绘 PNG、徽章与分享卡片 SVG"},
            {"name": "meta", "description": "健康检查与判定常量"},
        ],
        lifespan=lifespan,
    )
    app.state.settings = cfg

    if cfg.cors_origins:
        allow_all = "*" in cfg.cors_origins
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"] if allow_all else cfg.cors_origins,
            allow_credentials=not allow_all,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=["Retry-After", "X-Gitmon-Version"],
        )

    limiter = RateLimiter(cfg.rate_limit_per_min)

    @app.middleware("http")
    async def _guard(request: Request, call_next):
        path = request.url.path
        if cfg.rate_limit_per_min > 0 and (path.startswith("/api") or path.startswith("/badge") or path.startswith("/card")):
            client = request.client.host if request.client else "anonymous"
            if not limiter.check(client):
                return JSONResponse(
                    status_code=429,
                    content={"error": "请求过于频繁", "hint": "稍后再试，或用 X-Gitmon-User 区分客户端"},
                    headers={"Retry-After": "60"},
                )
        response = await call_next(request)
        response.headers.setdefault("X-Gitmon-Version", "0.2.0")
        return response

    app.include_router(api_router)
    app.include_router(auth_router)
    from .inventory_api import router as inventory_router
    app.include_router(inventory_router)
    from .llm_api import router as llm_router
    app.include_router(llm_router)
    from .story_api import router as story_router
    app.include_router(story_router)
    from .quest_api import router as quest_router
    app.include_router(quest_router)
    from .tts_api import router as tts_router
    app.include_router(tts_router)
    install_error_handlers(app)

    # 前端构建产物（单容器部署）：必须在 API 路由之后挂载
    if cfg.static_dir and (cfg.static_dir / "index.html").exists():
        app.mount("/", StaticFiles(directory=str(cfg.static_dir), html=True), name="web")

    return app


def _warm_tts_in_background() -> None:
    """本地语音模型冷启动要 1.2s，进程起来先热一遍，别让玩家第一句台词干等。

    测试里不加载（320MB 模型会把 pytest 拖慢），可用 GITMON_TTS_WARM=0 关掉。
    """
    import os
    import sys
    import threading

    if os.environ.get("GITMON_TTS_WARM", "1") == "0":
        return
    if "pytest" in sys.modules:
        return

    def run() -> None:
        try:
            from . import tts

            if tts.local_ready():
                tts.warm()
        except Exception:  # 预热失败不影响主流程，第一句会自己再试
            pass

    threading.Thread(target=run, name="tts-warm", daemon=True).start()


async def _daily_loop(cfg: Settings) -> None:
    """每天固定小时结算一次已登记仓库（进程内，无需 APScheduler）。"""
    while True:
        now = time.localtime()
        target_hour = cfg.daily_sync_hour
        seconds_today = now.tm_hour * 3600 + now.tm_min * 60 + now.tm_sec
        delay = (target_hour * 3600 - seconds_today) % 86400 or 86400
        await asyncio.sleep(delay)
        try:
            await asyncio.to_thread(services.daily_sync, 30)
        except Exception:  # 定时任务失败不能拖垮进程
            continue


app = create_app()


def __getattr__(name: str) -> Any:  # pragma: no cover - 便于 uvicorn 反射
    if name == "application":
        return app
    raise AttributeError(name)
