"""运行配置：全部来自环境变量，缺省值面向本地开发。

设计上只有一个 Settings 实例（settings），单进程后端不需要更复杂的配置层。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str] | None = None) -> list[str]:
    raw = _env(name)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    data_dir: Path
    # 平台凭证
    github_token: str = ""
    gitee_token: str = ""
    # 缓存与网络
    cache_ttl: int = 6 * 3600
    http_timeout: float = 18.0
    http_retries: int = 2
    # 行为开关
    daily_sync: bool = False
    daily_sync_hour: int = 3
    rate_limit_per_min: int = 120
    use_scc: bool = False
    # 是否在浅克隆后跑一次离线 AI 味检测（依赖 use_scc 的克隆）
    ai_trace: bool = False
    cors_origins: list[str] = field(default_factory=lambda: ["http://127.0.0.1:5173"])
    static_dir: Path | None = None
    # 立绘风格：classic（16×16，与前端 canvas 一致）/ rich（32×32，细节更多）
    sprite_style: str = "rich"
    # 单次扫描最多分析的文件条目，防止超大 monorepo 拖垮判定
    max_tree_entries: int = 20000

    @property
    def db_path(self) -> Path:
        return self.data_dir / "gitmon.db"

    @property
    def sprite_dir(self) -> Path:
        return self.data_dir / "sprites"

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sprite_dir.mkdir(parents=True, exist_ok=True)


def load_settings() -> Settings:
    data_dir = Path(_env("GITMON_DATA_DIR") or str(BASE_DIR / "data")).expanduser()
    if not data_dir.is_absolute():
        data_dir = (BASE_DIR / data_dir).resolve()

    static_raw = _env("GITMON_STATIC_DIR")
    static_dir: Path | None = None
    if static_raw:
        static_dir = Path(static_raw).expanduser()
        if not static_dir.is_absolute():
            static_dir = (BASE_DIR / static_dir).resolve()
    elif (BASE_DIR.parent / "dist" / "index.html").exists():
        # 默认托管同级前端的构建产物（单容器部署）
        static_dir = BASE_DIR.parent / "dist"

    settings = Settings(
        data_dir=data_dir,
        github_token=_env("GITHUB_TOKEN"),
        gitee_token=_env("GITEE_TOKEN"),
        cache_ttl=_env_int("GITMON_CACHE_TTL", 6 * 3600),
        http_timeout=float(_env_int("GITMON_HTTP_TIMEOUT", 18)),
        daily_sync=_env_bool("GITMON_DAILY_SYNC", False),
        daily_sync_hour=_env_int("GITMON_DAILY_SYNC_HOUR", 3),
        rate_limit_per_min=_env_int("GITMON_RATE_LIMIT", 120),
        use_scc=_env_bool("GITMON_USE_SCC", False),
        ai_trace=_env_bool("GITMON_AI_TRACE", False),
        cors_origins=_env_list("GITMON_CORS_ORIGINS", ["http://127.0.0.1:5173"]),
        static_dir=static_dir,
        sprite_style=(_env("GITMON_SPRITE_STYLE") or "rich").lower(),
        max_tree_entries=_env_int("GITMON_MAX_TREE_ENTRIES", 20000),
    )
    settings.ensure_dirs()
    return settings


settings = load_settings()
