"""运行配置：全部来自环境变量，缺省值面向本地开发。

设计上只有一个 Settings 实例（settings），单进程后端不需要更复杂的配置层。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path | None = None) -> None:
    """极简 .env 读取：只认 KEY=VALUE，不覆盖已存在的环境变量。

    不引第三方依赖（python-dotenv 是可用，但这里只需要十几行）。
    """
    target = path or (BASE_DIR / ".env")
    if not target.exists():
        return
    try:
        for line in target.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        return


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
    # 平台凭证（服务端兜底令牌；登录用户的令牌优先）
    github_token: str = ""
    gitee_token: str = ""
    # GitHub OAuth 应用（登录授权用；不配置则只能粘贴个人访问令牌）
    github_client_id: str = ""
    github_client_secret: str = ""
    # Gitee OAuth 应用（可选；不配置则只支持 Gitee 私人令牌）
    gitee_client_id: str = ""
    gitee_client_secret: str = ""
    # 对外地址：OAuth 回调前缀，例如 http://127.0.0.1:8000
    public_base_url: str = "http://127.0.0.1:8000"
    # 回调地址覆盖：平台后台登记的和上面拼出来的不一致时，直接写完整地址对齐
    # （Gitee 报「无效的登录回调地址」基本都是这一项没对上）
    github_callback_override: str = ""
    gitee_callback_override: str = ""
    # 登录成功后跳回的页面（默认回根路径，本地用 vite 代理也成立）
    web_url: str = ""
    # 会话密钥：为空则自动生成并落到 data/secret.key，用于签名与令牌加密
    secret_key: str = ""
    session_ttl: int = 30 * 24 * 3600
    # 本机已登录（gh CLI）直接登录：只对 127.0.0.1 请求生效，部署到公网时关掉
    local_login: bool = True
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
    # 活动任务「给项目仓库点一颗星」的目标仓库。
    # 只有一个固定目标（就是本项目自己的仓库），玩家没有得挑 ——
    # 挑目标会让「我要不要点这个」变成「有没有别的可选」，反而稀释了任务的号召力。
    # 格式 owner/repo（默认 GitHub）；改成 gitee/owner/repo 可以指向 Gitee 上的同名仓库。
    quest_target: str = "4243342/gitmon"

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
    load_dotenv()
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
        github_client_id=_env("GITHUB_CLIENT_ID"),
        github_client_secret=_env("GITHUB_CLIENT_SECRET"),
        gitee_client_id=_env("GITEE_CLIENT_ID"),
        gitee_client_secret=_env("GITEE_CLIENT_SECRET"),
        public_base_url=(_env("GITMON_PUBLIC_URL") or "http://127.0.0.1:8000").rstrip("/"),
        github_callback_override=_env("GITHUB_CALLBACK_URL").rstrip("/"),
        gitee_callback_override=_env("GITEE_CALLBACK_URL").rstrip("/"),
        web_url=_env("GITMON_WEB_URL"),
        secret_key=_env("GITMON_SECRET"),
        session_ttl=_env_int("GITMON_SESSION_TTL", 30 * 24 * 3600),
        local_login=_env_bool("GITMON_LOCAL_LOGIN", True),
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
        quest_target=_env("GITMON_QUEST_TARGET") or "4243342/gitmon",
    )
    settings.ensure_dirs()
    return settings


settings = load_settings()
