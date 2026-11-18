"""GitHub 登录授权：OAuth 授权码 + 个人访问令牌两条路。

为什么需要登录：GitHub 匿名 API 只有 60 次/小时，一次扫描要 5~17 个请求，
基本扫三四个仓库就废了；带上令牌是 5000 次/小时。

两条路产出的东西一样——一个 GitHub access token：
1. OAuth（推荐）：/api/auth/github/start → 用户在 GitHub 点「授权」→ 回调换 token。
   需要注册 OAuth App，填 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET。
2. 个人访问令牌：用户自己生成 ghp_xxx 贴进来，服务端校验一次就能用。
   没配 OAuth App 也能工作，部署成本为零。

安全取舍：
- 令牌用 HMAC-SHA256 计数器模式做流加密后落库（零第三方依赖），密钥来自
  GITMON_SECRET 或 data/secret.key（首次启动自动生成 0600 文件）。
- 浏览器会话只存 HttpOnly cookie，里面是随机 sid，库里存它的 sha256。
- 令牌本身只在 /api/auth/token 这个同源接口、且带会话 cookie 时下发一次，
  因为前端 scan.js 是直连 GitHub API 的（浏览器端用令牌最省事）。
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import os
import secrets
import sqlite3
import subprocess
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, urlencode, urlsplit

import httpx

from .config import settings
from .db import db, utcnow_iso
from .errors import AuthError, OAuthNotConfigured

GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN = "https://github.com/login/oauth/access_token"
GITHUB_API = "https://api.github.com"
# read:user 拿昵称头像；repo 让私有仓库也能孵化；read:org 让组织仓库可见
DEFAULT_SCOPES = "read:user repo read:org"

GITEE_AUTHORIZE = "https://gitee.com/oauth/authorize"
GITEE_TOKEN = "https://gitee.com/oauth/token"
GITEE_API = "https://gitee.com/api/v5"
# user_info 拿昵称头像；projects 让私有仓库也能孵化
GITEE_SCOPES = "user_info projects"

SESSION_COOKIE = "gitmon_sid"
STATE_TTL = 600


# ---------------------------------------------------------------- 密钥与加密

_secret_cache: bytes | None = None


def secret_bytes() -> bytes:
    """会话密钥：优先环境变量，否则生成并持久化到 data/secret.key。"""
    global _secret_cache
    if _secret_cache is not None:
        return _secret_cache
    raw = settings.secret_key or ""
    if not raw:
        path = settings.data_dir / "secret.key"
        if path.exists():
            raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            raw = secrets.token_urlsafe(48)
            settings.data_dir.mkdir(parents=True, exist_ok=True)
            path.write_text(raw, encoding="utf-8")
            with contextlib.suppress(OSError):
                os.chmod(path, 0o600)
    _secret_cache = raw.encode("utf-8")
    return _secret_cache


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def encrypt_token(raw: str) -> str:
    if not raw:
        return ""
    nonce = os.urandom(12)
    data = raw.encode("utf-8")
    stream = _keystream(secret_bytes(), nonce, len(data))
    return "v1." + nonce.hex() + "." + bytes(a ^ b for a, b in zip(data, stream)).hex()


def decrypt_token(blob: str) -> str:
    if not blob or not blob.startswith("v1."):
        return ""
    try:
        _, nonce_hex, payload_hex = blob.split(".", 2)
        nonce = bytes.fromhex(nonce_hex)
        payload = bytes.fromhex(payload_hex)
    except ValueError:
        return ""
    stream = _keystream(secret_bytes(), nonce, len(payload))
    try:
        return bytes(a ^ b for a, b in zip(payload, stream)).decode("utf-8")
    except UnicodeDecodeError:
        return ""


# ---------------------------------------------------------------- OAuth state

def sign_state(next_path: str = "/") -> str:
    """无状态 state：时间戳 + 随机串 + HMAC，回调时验签并限时。"""
    payload = f"{int(time.time())}.{secrets.token_hex(8)}.{base64.urlsafe_b64encode(next_path.encode()).decode()}"
    sig = hmac.new(secret_bytes(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"


def verify_state(state: str) -> str:
    try:
        ts, nonce, next_b64, sig = state.split(".", 3)
    except ValueError:
        raise AuthError("授权状态无效，请重新登录") from None
    payload = f"{ts}.{nonce}.{next_b64}"
    expect = hmac.new(secret_bytes(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expect, sig):
        raise AuthError("授权状态校验失败，请重新登录")
    if time.time() - int(ts) > STATE_TTL:
        raise AuthError("授权超时，请重新登录")
    try:
        return base64.urlsafe_b64decode(next_b64.encode()).decode() or "/"
    except Exception:
        return "/"


def oauth_enabled() -> bool:
    return bool(settings.github_client_id and settings.github_client_secret)


LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _split_host(value: str) -> tuple[str, int | None]:
    """把 Host 头拆成 (主机名, 端口)。没写端口时端口为 None。"""
    host = (value or "").strip()
    if not host:
        return "", None
    if host.startswith("["):  # [::1]:8000
        pure, _, rest = host.partition("]")
        return pure[1:].lower(), int(rest[1:]) if rest[1:].isdigit() else None
    pure, _, port = host.partition(":")
    return pure.lower(), int(port) if port.isdigit() else None


def request_origin(request: Any) -> str:
    """本次请求自己的 origin（含协议），拿不到就返回空串。"""
    try:
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip()
        if not host:
            return ""
        scheme = (request.headers.get("x-forwarded-proto") or request.url.scheme or "http")
        return f"{scheme.split(',')[0].strip()}://{host}"
    except Exception:  # noqa: BLE001 — Host 头缺失时不值得报错
        return ""


def _backend_port() -> int | None:
    return _split_host(urlsplit(settings.public_base_url).netloc)[1]


def _callback_base(request: Any = None) -> str:
    """回调前缀。

    平台后台只登记一个回调地址，所以这个前缀必须等于后端自己的对外地址：
    请求是从别的端口转发过来的（页面开在 vite 的 5173、由代理转给 8000）时
    Host 是 5173，但 OAuth 平台只会把浏览器送回 8000 —— 端口不一致就一律
    回退到 GITMON_PUBLIC_URL，否则平台会报「无效的登录回调地址」。

    端口一致时允许 127.0.0.1 与 localhost 互换：本机开发常见的两个 origin，
    后台登记了哪一个都能对上。公网部署仍以 GITMON_PUBLIC_URL 为准。
    """
    base = settings.public_base_url
    if request is not None:
        try:
            host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip()
            pure, port = _split_host(host)
            if pure in LOOPBACK_HOSTS and port is not None and port == _backend_port():
                base = request_origin(request)
        except Exception:  # noqa: BLE001 — Host 头缺失时不值得报错，退回配置值
            pass
    return base.rstrip("/")


def page_origin(request: Any = None) -> str:
    """页面所在的 origin —— 仅在「页面端口 ≠ 后端端口」时返回。

    前后端分开跑时页面在 5173，登录回调只能落在 8000，登完相对路径一跳就把
    用户带离了 dev 页面。把页面 origin 塞进签名 state，回调时才知道送回哪。
    只认回环地址，所以伪造 Host 头没法把用户带去外部站点。
    """
    if request is None:
        return ""
    origin = request_origin(request)
    if not origin:
        return ""
    try:
        pure, port = _split_host(origin.split("://", 1)[1])
        if pure not in LOOPBACK_HOSTS or port is None or port == _backend_port():
            return ""
    except Exception:  # noqa: BLE001
        return ""
    return origin


def callback_url(request: Any = None) -> str:
    return settings.github_callback_override or f"{_callback_base(request)}/api/auth/github/callback"


def authorize_url(state: str, request: Any = None) -> str:
    if not oauth_enabled():
        raise OAuthNotConfigured(
            "GitHub OAuth 未配置",
            hint="设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET，或改用个人访问令牌登录",
        )
    query = urlencode({
        "client_id": settings.github_client_id,
        "redirect_uri": callback_url(request),
        "scope": DEFAULT_SCOPES,
        "state": state,
        "allow_signup": "true",
    })
    return f"{GITHUB_AUTHORIZE}?{query}"


# ---------------------------------------------------------------- GitHub 调用

def _client() -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(15.0, connect=8.0),
        follow_redirects=True,
        headers={"User-Agent": "GitMon/0.2", "Accept": "application/json"},
    )


def exchange_code(code: str, request: Any = None) -> tuple[str, str]:
    """授权码换 access_token，返回 (token, scopes)。"""
    if not oauth_enabled():
        raise OAuthNotConfigured("GitHub OAuth 未配置")
    with _client() as client:
        resp = client.post(
            GITHUB_TOKEN,
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": callback_url(request),
            },
            headers={"Accept": "application/json"},
        )
    if resp.status_code >= 500:
        raise AuthError("GitHub 授权服务暂时不可用，请稍后重试")
    try:
        data = resp.json()
    except ValueError:
        raise AuthError("GitHub 授权返回内容无法解析") from None
    if data.get("error"):
        desc = str(data.get("error_description") or data["error"])
        if data["error"] in {"bad_verification_code", "invalid_grant"}:
            raise AuthError("授权码已失效，请重新授权", hint=desc)
        raise AuthError(f"GitHub 授权失败：{desc}")
    token = str(data.get("access_token") or "")
    if not token:
        raise AuthError("GitHub 没有返回访问令牌")
    return token, str(data.get("scope") or "")


def github_profile(token: str) -> dict[str, Any]:
    """用令牌取用户信息；令牌无效会是 401。"""
    if not token:
        raise AuthError("令牌为空")
    try:
        with _client() as client:
            resp = client.get(f"{GITHUB_API}/user", headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        raise AuthError("连接 GitHub 失败，请检查网络后重试") from None
    if resp.status_code == 401:
        raise AuthError("令牌无效或已过期", hint="重新生成一个有 read:user 权限的令牌")
    if resp.status_code == 403:
        raise AuthError("该令牌被 GitHub 拒绝（可能已被撤销）", hint="重新生成令牌")
    if resp.status_code >= 400:
        raise AuthError(f"GitHub 返回异常状态 {resp.status_code}")
    try:
        return resp.json()
    except ValueError:
        raise AuthError("GitHub 用户信息无法解析") from None


def github_quota(token: str) -> dict[str, Any]:
    """查当前令牌的配额。/rate_limit 不计入配额，可以放心调。"""
    if not token:
        return {}
    try:
        with _client() as client:
            resp = client.get(f"{GITHUB_API}/rate_limit", headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            return {}
        core = (resp.json() or {}).get("resources", {}).get("core", {})
        return {
            "limit": int(core.get("limit") or 0),
            "remaining": int(core.get("remaining") or 0),
            "resetAt": int(core.get("reset") or 0),
        }
    except (httpx.HTTPError, ValueError, TypeError):
        return {}


# ---------------------------------------------------------------- Gitee

def gitee_oauth_enabled() -> bool:
    return bool(settings.gitee_client_id and settings.gitee_client_secret)


def gitee_callback_url(request: Any = None) -> str:
    return settings.gitee_callback_override or f"{_callback_base(request)}/api/auth/gitee/callback"


def gitee_authorize_url(state: str, request: Any = None) -> str:
    if not gitee_oauth_enabled():
        raise OAuthNotConfigured(
            "Gitee OAuth 未配置",
            hint="设置 GITEE_CLIENT_ID / GITEE_CLIENT_SECRET，或改用 Gitee 私人令牌登录",
        )
    # Gitee 要求 scope 用 %20 分隔空格，并且「上次授权过的用户」再次进来时
    # scope 必须与上次完全一致，否则它会跳过授权页却只给旧权限。
    query = urlencode({
        "client_id": settings.gitee_client_id,
        "redirect_uri": gitee_callback_url(request),
        "response_type": "code",
        "scope": GITEE_SCOPES,
        "state": state,
    }, quote_via=quote)
    return f"{GITEE_AUTHORIZE}?{query}"


def exchange_gitee_code(code: str, request: Any = None) -> tuple[str, str, str]:
    """授权码换令牌，返回 (access_token, scope, refresh_token)。

    Gitee 的文档把参数写在 query 上、同时建议 client_secret 放 body，
    所以这里两边都放一份（值相同），避免它只认其中一处。
    access_token 只有 **1 天** 有效期，refresh_token 必须一起存下来。
    """
    if not gitee_oauth_enabled():
        raise OAuthNotConfigured("Gitee OAuth 未配置")
    params = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.gitee_client_id,
        "redirect_uri": gitee_callback_url(request),
    }
    with _client() as client:
        resp = client.post(
            GITEE_TOKEN,
            params=params,
            data={**params, "client_secret": settings.gitee_client_secret},
            headers={"Accept": "application/json"},
        )
    return _parse_gitee_token(resp)


def refresh_gitee_token(refresh_token: str) -> tuple[str, str]:
    """用 refresh_token 换新的 access_token，返回 (access_token, refresh_token)。

    Gitee 每次刷新都会连 refresh_token 一起换掉，必须把新的也存回去。
    """
    if not refresh_token:
        raise AuthError("缺少 Gitee 刷新令牌", hint="请重新授权一次")
    with _client() as client:
        resp = client.post(
            GITEE_TOKEN,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.gitee_client_id,
                "client_secret": settings.gitee_client_secret,
            },
            headers={"Accept": "application/json"},
        )
    access, _, new_refresh = _parse_gitee_token(resp)
    return access, new_refresh or refresh_token


def _parse_gitee_token(resp: httpx.Response) -> tuple[str, str, str]:
    if resp.status_code == 403:
        raise AuthError("Gitee 拒绝了令牌请求", hint="检查应用回调地址与权限设置，或稍后重试")
    if resp.status_code >= 500:
        raise AuthError("Gitee 授权服务暂时不可用，请稍后重试")
    try:
        data = resp.json()
    except ValueError:
        raise AuthError("Gitee 授权返回内容无法解析") from None
    if data.get("error"):
        desc = str(data.get("error_description") or data["error"])
        code = str(data["error"])
        if code == "invalid_client":
            raise AuthError("Gitee 应用的 Client ID / Secret 不正确", hint="检查 backend/.env 里的凭证")
        if code.startswith("authorization_code"):
            raise AuthError(
                "Gitee 授权码无效或已使用（也可能是应用回调地址不一致）",
                hint=f"确认 Gitee 应用后台填的回调地址是 {gitee_callback_url()}；{desc}",
            )
        if "refresh" in code or "validate_token" in code:
            raise AuthError("Gitee 授权已过期，请重新登录一次", hint=desc)
        raise AuthError(f"Gitee 授权失败：{desc}")
    access = str(data.get("access_token") or "")
    if not access:
        raise AuthError("Gitee 没有返回访问令牌", hint="请重新授权一次")
    return access, str(data.get("scope") or ""), str(data.get("refresh_token") or "")


# Gitee 令牌 1 天就过期：会话还在但令牌已失效时，前端会拿着废令牌直连 API。
# 取令牌时做一次有效性校验（结果缓存 10 分钟），失效就静默刷新。
_GITEE_CHECK_TTL = 600
_gitee_check_cache: dict[str, tuple[float, str]] = {}


def _gitee_token_status(token: str) -> str:
    """ok / expired / unknown（网络不通时不判死刑，免得误刷令牌）。"""
    try:
        with _client() as client:
            resp = client.get(f"{GITEE_API}/user", params={"access_token": token})
    except httpx.HTTPError:
        return "unknown"
    if resp.status_code == 401:
        return "expired"
    if resp.status_code >= 400:
        return "unknown"
    return "ok"


def ensure_gitee_token(user: dict[str, Any]) -> str:
    """给 /api/auth/token 用：返回一个当下可用的 Gitee 令牌，必要时静默刷新。"""
    token = user.get("token") or ""
    if not token:
        return token
    user_id = user.get("id", "")
    cached = _gitee_check_cache.get(user_id)
    if cached and time.time() - cached[0] < _GITEE_CHECK_TTL and cached[1] == token:
        return token
    status = _gitee_token_status(token)
    if status == "ok":
        _gitee_check_cache[user_id] = (time.time(), token)
        return token
    if status != "expired":
        return token
    new_token, new_refresh = refresh_gitee_token(user.get("refresh_token") or "")
    upsert_user(
        provider="gitee",
        login=user.get("login", ""),
        name=user.get("name", ""),
        avatar=user.get("avatar", ""),
        email=user.get("email", ""),
        token=new_token,
        refresh_token=new_refresh,
        scopes=user.get("scopes", ""),
        source=user.get("source", "oauth"),
    )
    _gitee_check_cache[user_id] = (time.time(), new_token)
    return new_token


def gitee_profile(token: str) -> dict[str, Any]:
    """Gitee 私人令牌 / OAuth 令牌都能用，统一返回用户信息。"""
    if not token:
        raise AuthError("令牌为空")
    try:
        with _client() as client:
            # Gitee v5 只认 access_token 参数；不额外发 Authorization 头，
            # 免得某些网关把不认识的头当成冲突的凭据。
            resp = client.get(f"{GITEE_API}/user", params={"access_token": token})
    except httpx.HTTPError:
        raise AuthError("连接 Gitee 失败，请检查网络后重试") from None
    if resp.status_code == 401:
        raise AuthError("Gitee 令牌无效或已过期", hint="重新生成一个带 user_info 权限的私人令牌")
    if resp.status_code == 403:
        raise AuthError("Gitee 拒绝了该令牌（可能是配额或权限问题）", hint="稍后重试，或换一个私人令牌")
    if resp.status_code >= 400:
        raise AuthError(f"Gitee 返回异常状态 {resp.status_code}")
    try:
        return resp.json()
    except ValueError:
        raise AuthError("Gitee 用户信息无法解析") from None


# ---------------------------------------------------------------- 本机已登录（gh CLI）
# 本地开发时最常见的场景：这台机器的 gh 已经登录过了，没必要再建 OAuth App、
# 也不用把令牌复制到网页里。这里直接复用 gh 存的令牌，但**只对 127.0.0.1 生效**。

_local_token: tuple[float, str] | None = None
_local_profile: tuple[float, dict[str, Any]] | None = None


def local_gh_token() -> str:
    """服务端兜底令牌优先；没有就读本机 gh CLI 的登录令牌（缓存 5 分钟）。"""
    global _local_token
    if settings.github_token:
        return settings.github_token
    now = time.time()
    if _local_token and now - _local_token[0] < 300:
        return _local_token[1]
    token = ""
    try:
        proc = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=8)
        if proc.returncode == 0:
            token = proc.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        token = ""
    _local_token = (now, token)
    return token


def local_login_available() -> dict[str, Any]:
    """给首页用：本机是否有一个可直接进入的 GitHub 账号（结果缓存 60 秒）。"""
    global _local_profile
    if not settings.local_login:
        return {"available": False}
    token = local_gh_token()
    if not token:
        return {"available": False}
    now = time.time()
    if _local_profile and now - _local_profile[0] < 60:
        return {"available": True, **_local_profile[1]}
    try:
        profile = github_profile(token)
    except AuthError:
        return {"available": False}
    summary = {
        "login": str(profile.get("login") or ""),
        "name": str(profile.get("name") or ""),
        "avatar": str(profile.get("avatar_url") or ""),
    }
    _local_profile = (now, summary)
    return {"available": bool(summary["login"]), **summary}


# ---------------------------------------------------------------- 用户与会话

def _user_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    user = dict(row)
    user["token"] = decrypt_token(user.pop("token_cipher", ""))
    user["refresh_token"] = decrypt_token(user.pop("refresh_cipher", ""))
    return user


def upsert_user(*, provider: str, login: str, name: str, avatar: str, email: str,
                token: str, scopes: str, source: str,
                refresh_token: str = "") -> dict[str, Any]:
    now = utcnow_iso()
    user_id = hashlib.sha1(f"{provider}:{login.lower()}".encode()).hexdigest()[:16]
    cipher = encrypt_token(token)
    refresh_cipher = encrypt_token(refresh_token)
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO users (id, provider, login, name, avatar, email, token_cipher, refresh_cipher,"
            " scopes, source, created_at, updated_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, email=excluded.email,"
            " token_cipher=excluded.token_cipher, refresh_cipher=excluded.refresh_cipher,"
            " scopes=excluded.scopes, source=excluded.source,"
            " updated_at=excluded.updated_at, last_login_at=excluded.last_login_at",
            (user_id, provider, login, name, avatar, email, cipher, refresh_cipher,
             scopes, source, now, now, now),
        )
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    user = _user_row(row) or {}
    user["id"] = user_id
    return user


def get_user(user_id: str) -> dict[str, Any] | None:
    with db.connect() as conn:
        return _user_row(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())


def create_session(user_id: str, ttl: int | None = None) -> str:
    sid = secrets.token_urlsafe(32)
    expire = datetime.now(timezone.utc) + timedelta(seconds=ttl or settings.session_ttl)
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO sessions (sid_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (_hash_sid(sid), user_id, utcnow_iso(), expire.replace(microsecond=0).isoformat()),
        )
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (utcnow_iso(),))
    return sid


def resolve_session(sid: str) -> dict[str, Any] | None:
    if not sid:
        return None
    with db.connect() as conn:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE sid_hash=?", (_hash_sid(sid),)
        ).fetchone()
        if row is None:
            return None
        if str(row["expires_at"]) < utcnow_iso():
            conn.execute("DELETE FROM sessions WHERE sid_hash=?", (_hash_sid(sid),))
            return None
        return _user_row(conn.execute("SELECT * FROM users WHERE id=?", (row["user_id"],)).fetchone())


def drop_session(sid: str) -> None:
    if not sid:
        return
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE sid_hash=?", (_hash_sid(sid),))


def _hash_sid(sid: str) -> str:
    return hashlib.sha256(sid.encode("utf-8")).hexdigest()


def public_profile(user: dict[str, Any] | None, *, quota: dict[str, Any] | None = None) -> dict[str, Any]:
    """给前端的用户画像：不含令牌本身。"""
    if not user:
        return {
            "authenticated": False,
            "oauth": oauth_enabled(),
            "oauthByProvider": {"github": oauth_enabled(), "gitee": gitee_oauth_enabled()},
            "quota": {"limit": 60, "remaining": None, "resetAt": 0},
        }
    return {
        "authenticated": True,
        "id": user["id"],
        "provider": user.get("provider", "github"),
        "login": user.get("login", ""),
        "name": user.get("name") or user.get("login", ""),
        "avatar": user.get("avatar", ""),
        "email": user.get("email", ""),
        "scopes": user.get("scopes", ""),
        "source": user.get("source", "oauth"),
        "hasToken": bool(user.get("token")),
        "quota": quota or {},
        "oauth": oauth_enabled(),
        "oauthByProvider": {"github": oauth_enabled(), "gitee": gitee_oauth_enabled()},
    }


def logout(user: dict[str, Any] | None, sid: str) -> None:
    drop_session(sid)
    if not user:
        return
    token = user.get("token") or ""
    # 只撤销 GitHub OAuth 令牌：Gitee 没有对应的撤销端点，
    # 更不能把 Gitee 令牌发到 api.github.com 去（那等于把凭据送给另一家）。
    if user.get("provider", "github") == "gitee":
        _gitee_check_cache.pop(user.get("id", ""), None)
        return
    # OAuth 令牌撤销需要 client 凭证；个人令牌（PAT）无法远程撤销，只清本地会话
    if token and user.get("source") == "oauth" and oauth_enabled():
        try:
            with _client() as client:
                client.delete(
                    f"{GITHUB_API}/applications/{settings.github_client_id}/token",
                    json={"access_token": token},
                    auth=(settings.github_client_id, settings.github_client_secret),
                )
        except httpx.HTTPError:
            pass
