"""登录授权：令牌加密、state 签名、OAuth 回调、PAT 登录与会话。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gitmon_api import auth, auth_api, config
from gitmon_api.main import create_app


@pytest.fixture()
def client(tmp_dir, monkeypatch):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "cors_origins", [])
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    monkeypatch.setattr(settings, "session_ttl", 3600)
    monkeypatch.setattr(settings, "github_client_id", "")
    monkeypatch.setattr(settings, "github_client_secret", "")
    monkeypatch.setattr(settings, "web_url", "")
    settings.ensure_dirs()
    auth._secret_cache = None
    auth_api._quota_cache.clear()
    app = create_app(start_queue=False)
    with TestClient(app) as test_client:
        yield test_client


def test_token_encryption_roundtrip() -> None:
    cipher = auth.encrypt_token("ghp_secret_value")
    assert cipher.startswith("v1.")
    assert "ghp_secret_value" not in cipher
    assert auth.decrypt_token(cipher) == "ghp_secret_value"
    # 同样的明文每次密文都不同（随机 nonce）
    assert auth.encrypt_token("ghp_secret_value") != cipher
    assert auth.decrypt_token("v1.bad") == ""
    assert auth.decrypt_token("") == ""


def test_state_sign_and_verify() -> None:
    state = auth.sign_state("/workspace")
    assert auth.verify_state(state) == "/workspace"
    with pytest.raises(auth.AuthError):
        auth.verify_state(state + "x")
    with pytest.raises(auth.AuthError):
        auth.verify_state("not-a-state")


def test_state_expired() -> None:
    import time

    payload = f"{int(time.time()) - 3600}.abcd.{auth.base64.urlsafe_b64encode(b'/x').decode()}"
    import hashlib
    import hmac

    sig = hmac.new(auth.secret_bytes(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    with pytest.raises(auth.AuthError) as exc:
        auth.verify_state(f"{payload}.{sig}")
    assert "超时" in exc.value.message


def test_anonymous_me(client: TestClient) -> None:
    payload = client.get("/api/auth/me").json()
    assert payload["authenticated"] is False
    assert payload["oauth"] is False
    assert payload["quota"]["limit"] == 60
    assert client.get("/api/auth/token").status_code == 401


def test_oauth_start_requires_config(client: TestClient) -> None:
    response = client.get("/api/auth/github/start", follow_redirects=False)
    assert response.status_code == 400
    assert "GITHUB_CLIENT_ID" in response.json()["hint"]


def test_oauth_start_redirect(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "github_client_id", "cid")
    monkeypatch.setattr(config.settings, "github_client_secret", "secret")
    response = client.get("/api/auth/github/start?next=/app", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith(auth.GITHUB_AUTHORIZE)
    assert "client_id=cid" in location
    assert "state=" in location


def test_pat_login_and_logout(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(auth, "github_profile", lambda token: {
        "login": "octocat", "name": "The Octocat", "avatar_url": "https://x/a.png", "email": "o@x.com",
    })
    monkeypatch.setattr(auth, "github_quota", lambda token: {"limit": 5000, "remaining": 4990, "resetAt": 0})

    response = client.post("/api/auth/github/token", json={"token": "ghp_abcdefghij"})
    assert response.status_code == 200
    profile = response.json()
    assert profile["authenticated"] is True
    assert profile["login"] == "octocat"
    assert profile["quota"]["limit"] == 5000
    assert profile["hasToken"] is True
    assert "token" not in profile  # 不回传令牌本身

    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True and me["login"] == "octocat"

    token = client.get("/api/auth/token").json()
    assert token["token"] == "ghp_abcdefghij"

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/api/auth/token").status_code == 401


def test_pat_login_rejects_bad_token(client: TestClient, monkeypatch) -> None:
    def boom(token: str):
        raise auth.AuthError("令牌无效或已过期")

    monkeypatch.setattr(auth, "github_profile", boom)
    response = client.post("/api/auth/github/token", json={"token": "ghp_badtoken"})
    assert response.status_code == 401
    assert "令牌无效" in response.json()["error"]


def test_oauth_callback_creates_session(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "github_client_id", "cid")
    monkeypatch.setattr(config.settings, "github_client_secret", "secret")
    monkeypatch.setattr(auth, "exchange_code", lambda code: ("gho_token", "read:user repo"))
    monkeypatch.setattr(auth, "github_profile", lambda token: {
        "login": "hubot", "name": "Hubot", "avatar_url": "", "email": "",
    })

    state = auth.sign_state("/")
    response = client.get(f"/api/auth/github/callback?code=abc&state={state}", follow_redirects=False)
    assert response.status_code == 302
    assert "auth=ok" in response.headers["location"]
    assert auth.SESSION_COOKIE in response.cookies

    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["login"] == "hubot"
    assert me["source"] == "oauth"
    assert client.get("/api/auth/token").json()["token"] == "gho_token"


def test_oauth_callback_bad_state_redirects(client: TestClient) -> None:
    response = client.get("/api/auth/github/callback?code=abc&state=tampered", follow_redirects=False)
    assert response.status_code == 302
    assert "auth=failed" in response.headers["location"]
    assert "reason=" in response.headers["location"]


def test_session_token_used_for_scan(client: TestClient, monkeypatch) -> None:
    """登录后服务端扫描应优先用用户令牌。"""
    from gitmon_api import services

    seen: dict[str, str] = {}

    def fake_scan(ref, since=None, token=None):
        seen["token"] = token or ""
        from conftest import make_snapshot

        return make_snapshot(f"{ref.platform}.com/{ref.full_name}")

    monkeypatch.setattr(services, "_scan", fake_scan)
    monkeypatch.setattr(auth, "github_profile", lambda token: {"login": "octocat", "name": "", "avatar_url": ""})
    monkeypatch.setattr(auth, "github_quota", lambda token: {})

    client.post("/api/auth/github/token", json={"token": "ghp_usertokenxx"})
    assert client.post("/api/hatch/sync", json={"repo": "acme/widget"}).status_code == 200
    assert seen["token"] == "ghp_usertokenxx"
