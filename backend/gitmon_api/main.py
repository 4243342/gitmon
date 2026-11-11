"""应用装配：路由 + CORS + 限流 + 静态托管 + 定时结算。"""

from __future__ import annotations

import asyncio
import contextlib
import math
import re
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, NamedTuple

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


_USER_RE = re.compile(r"[^A-Za-z0-9_-]")

# 不打外部 API、不做重计算的探测 / 轮询不该占掉孵化与扫描的额度。
# 一次孵化按 800ms 轮询 /api/jobs 最多 90 次 ≈ 72 次/分钟，
# 旧版那个「所有请求共吃 120 次」的全局桶，光轮询就吃掉六成。
_CHEAP_GET_PREFIXES = (
    "/api/health",
    "/api/meta",
    "/api/auth/me",
    "/api/auth/providers",
    "/api/jobs/",
)


class RateLimitVerdict(NamedTuple):
    allowed: bool
    retry_after: int = 0       # 秒；429 的 Retry-After 用真实等待时间，不再写死 60
    remaining: int = 0
    reset_at: float = 0.0      # Unix 秒：窗口里最早一条过期、额度回血的时刻
    scope: str = ""            # "" / "client" / "ip"，用于给不同的 429 文案


class RateLimiter:
    """双层滑动窗口限流：身份桶 + IP 总桶。

    旧版只按 IP 记一个桶，本地开发 / 反代后面所有客户端共吃一份
    120 次/分钟额度；而 429 提示却叫人「用 X-Gitmon-User 区分客户端」——
    那个头根本没被读到，提示是假的。现在：

    * 身份桶  ``ip|identity``，额度 = rate_limit_per_min，设备头真正生效；
    * IP 总桶 ``ip``，额度 = rate_limit_per_min × IP_FACTOR，
      兜住「狂换设备头刷额度」，伪造头最多只能把额度放大 IP_FACTOR 倍。

    两层先一起验空位、再一起记账，避免身份桶通过但 IP 桶拒绝时白扣一次。
    """

    WINDOW = 60.0
    IP_FACTOR = 4

    def __init__(self, limit_per_min: int) -> None:
        self.limit = limit_per_min
        self._hits: dict[str, deque[float]] = {}
        self._last_cleanup = time.time()

    def check(self, ip: str, identity: str) -> RateLimitVerdict:
        if self.limit <= 0:
            return RateLimitVerdict(allowed=True, remaining=self.limit)
        now = time.time()
        plans = (
            (f"id:{ip}|{identity}", self.limit, "client"),
            (f"ip:{ip}", self.limit * self.IP_FACTOR, "ip"),
        )
        buckets = []
        for key, cap, scope in plans:
            bucket = self._hits.setdefault(key, deque())
            while bucket and now - bucket[0] > self.WINDOW:
                bucket.popleft()
            buckets.append((bucket, cap, scope))

        blocked = [(bucket, scope) for bucket, cap, scope in buckets if len(bucket) >= cap]
        if blocked:
            # 两层都要有空位才算放行，所以等待时间取较晚回血的那层；
            # 两层都满时文案优先报 IP 总桶 —— 这时换设备头已经救不了了。
            reset_at = max(bucket[0] + self.WINDOW for bucket, _ in blocked)
            retry = max(1, math.ceil(reset_at - now))
            scope = "ip" if any(s == "ip" for _, s in blocked) else "client"
            return RateLimitVerdict(False, retry, 0, reset_at, scope)

        for bucket, _, _ in buckets:
            bucket.append(now)
        remaining = min(cap - len(bucket) for bucket, cap, _ in buckets)
        oldest = min((bucket[0] for bucket, _, _ in buckets if bucket), default=now)
        self._cleanup(now)
        return RateLimitVerdict(True, 0, remaining, oldest + self.WINDOW)

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup > 300:
            self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < 120}
            self._last_cleanup = now


def _client_ip(request: Request, cfg: Settings) -> str:
    """反代后面 request.client.host 全是反代 IP，可选地信任 X-Forwarded-For。

    默认关闭：随便信 XFF 等于让伪造头绕过限流，只有明确部署在可信反代后才开。
    """
    if cfg.trust_proxy:
        first = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        if first:
            return first[:64]
    return request.client.host if request.client else "anonymous"


def _limit_identity(request: Request) -> str:
    """限流维度是「客户端」，与 api.owner_key 的设备头清洗规则保持一致。

    不解析会话 cookie：登录态的跨设备归属归 owner_key 管，这里只按设备分流；
    没带头一律落 public，所以前端所有 /api/* 请求都必须带 X-Gitmon-User（SSOT §2）。
    """
    cleaned = _USER_RE.sub("", request.headers.get("x-gitmon-user", ""))[:64]
    return cleaned or "public"


def _is_limited(path: str, method: str) -> bool:
    if not (path.startswith("/api/") or path.startswith("/badge") or path.startswith("/card")):
        return False
    # CORS 预检浏览器自己发的，不该由玩家买单（旧版一次 POST 要吃两格额度）
    if method == "OPTIONS":
        return False
    if method in ("GET", "HEAD") and path.startswith(_CHEAP_GET_PREFIXES):
        return False
    return True


def _rate_hint(verdict: RateLimitVerdict) -> str:
    if verdict.scope == "ip":
        return (
            "当前网络（IP）下所有客户端的请求总量超过上限，稍后再试；"
            "请确认每个客户端都带了各自的 X-Gitmon-User 头，或调高 GITMON_RATE_LIMIT"
        )
    return (
        f"当前客户端一分钟内请求太多，约 {verdict.retry_after} 秒后可重试；"
        "多个客户端请各自使用不同的 X-Gitmon-User 头分流，或调高 GITMON_RATE_LIMIT"
    )


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

    limiter = RateLimiter(cfg.rate_limit_per_min)

    @app.middleware("http")
    async def _guard(request: Request, call_next):
        rate_headers: dict[str, str] = {}
        if cfg.rate_limit_per_min > 0 and _is_limited(request.url.path, request.method):
            # 配置可能在运行期 / 测试里被改；limiter 是 create_app 时构造的，得同步
            limiter.limit = cfg.rate_limit_per_min
            verdict = limiter.check(_client_ip(request, cfg), _limit_identity(request))
            rate_headers = {
                "X-RateLimit-Limit": str(cfg.rate_limit_per_min),
                "X-RateLimit-Remaining": str(verdict.remaining),
                "X-RateLimit-Reset": str(int(math.ceil(verdict.reset_at))),
            }
            if not verdict.allowed:
                rate_headers["Retry-After"] = str(verdict.retry_after)
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "请求过于频繁",
                        "hint": _rate_hint(verdict),
                        "retryAfter": verdict.retry_after,
                    },
                    headers=rate_headers,
                )
        response = await call_next(request)
        response.headers.setdefault("X-Gitmon-Version", "0.2.0")
        for key, value in rate_headers.items():
            response.headers.setdefault(key, value)
        return response

    # CORS 必须最后注册：Starlette 后加的中间件在最外层，这样预检 OPTIONS
    # 会被它直接短路（不吃限流额度），而且限流返回的 429 也能带上跨域响应头，
    # 否则浏览器只会看见一个含糊的 CORS 错误，根本读不到「请求过于频繁」。
    if cfg.cors_origins:
        allow_all = "*" in cfg.cors_origins
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"] if allow_all else cfg.cors_origins,
            allow_credentials=not allow_all,
            allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["*"],
            expose_headers=[
                "Retry-After",
                "X-RateLimit-Limit",
                "X-RateLimit-Remaining",
                "X-RateLimit-Reset",
                "X-Gitmon-Version",
            ],
        )

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
