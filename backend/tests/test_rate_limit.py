"""限流中间件回归测试。

旧版四个真实缺陷（都会让正常使用撞 429，且提示让人做无用功）：

1. 只按 IP 记一个全局桶，本地开发 / 反代后所有客户端共吃 120 次/分钟；
2. 429 提示「用 X-Gitmon-User 区分客户端」，但代码根本没读这个头；
3. CORS 预检 OPTIONS 也占一格额度，跨域 POST 等于双倍消耗，
   且预检被 429 挡掉时浏览器只看见 CORS 错误，读不到真实报错；
4. Retry-After 写死 60，滑动窗口可能 1 秒后就放行。

这里用 TestClient 走完整中间件栈（含 CORS），逐条锁住修复后的行为。
"""

from __future__ import annotations

import time as real_time

import pytest
from fastapi.testclient import TestClient

from gitmon_api import config, main

# /api/pets 会真正过限流；/api/health 等探测路由在豁免名单里
BILLABLE = "/api/pets?limit=1"
ORIGIN = "http://example.com"
LIMIT = 5


class FakeClock:
    """只替换 main 模块看到的 time，别动全局 time 模块（starlette / httpx 也用）。"""

    def __init__(self, start: float) -> None:
        self.now = start

    def time(self) -> float:
        return self.now

    def localtime(self):
        return real_time.localtime(self.now)

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture()
def clock(monkeypatch):
    fake = FakeClock(1_700_000_000.0)
    monkeypatch.setattr(main, "time", fake)
    return fake


@pytest.fixture()
def client(tmp_dir, monkeypatch, clock):
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", LIMIT)
    monkeypatch.setattr(settings, "daily_sync", False)
    monkeypatch.setattr(settings, "trust_proxy", False)
    monkeypatch.setattr(settings, "cors_origins", [ORIGIN])
    settings.ensure_dirs()
    app = main.create_app(start_queue=False)
    with TestClient(app) as test_client:
        yield test_client


def dev(name: str) -> dict[str, str]:
    return {"X-Gitmon-User": name}


def hit(client: TestClient, headers: dict[str, str] | None = None):
    return client.get(BILLABLE, headers=headers or {})


# ---------------------------------------------------------------- 身份分流

def test_device_header_really_splits_the_bucket(client: TestClient) -> None:
    """同一个 IP 下，不同 X-Gitmon-User 各自有完整额度 —— 429 的 hint 必须说真话。"""
    for _ in range(LIMIT):
        assert hit(client, dev("alice")).status_code == 200
    blocked = hit(client, dev("alice"))
    assert blocked.status_code == 429
    assert blocked.json()["error"] == "请求过于频繁"

    # 旧版这里也会被挡：所有请求挤在同一个 IP 桶里
    for _ in range(LIMIT):
        assert hit(client, dev("bob")).status_code == 200
    assert hit(client, dev("bob")).status_code == 429


def test_missing_header_falls_back_to_public_bucket(client: TestClient) -> None:
    """没带头的前端请求统一落 public，互相共享一份（SSOT §2 要求前端必带）。"""
    for _ in range(LIMIT):
        assert hit(client).status_code == 200
    assert hit(client).status_code == 429
    assert hit(client, dev("alice")).status_code == 200


def test_identity_is_sanitized_like_owner_key(client: TestClient) -> None:
    """头里的冒号 / 斜杠要按 owner_key 的规则清洗，别造出无限个桶。"""
    for _ in range(LIMIT):
        assert hit(client, dev("dev:one")).status_code == 200
    assert hit(client, dev("dev/one")).status_code == 429  # 清洗后同为 devone


# ---------------------------------------------------------------- IP 天花板

def test_ip_bucket_caps_forged_device_headers(client: TestClient) -> None:
    """狂换设备头最多放大 IP_FACTOR 倍，不能无限绕过。"""
    cap = LIMIT * main.RateLimiter.IP_FACTOR
    for i in range(cap // LIMIT):
        for _ in range(LIMIT):
            assert hit(client, dev(f"forged-{i}")).status_code == 200
    blocked = hit(client, dev("forged-99"))
    assert blocked.status_code == 429
    assert "网络" in blocked.json()["hint"]  # 命中的是 IP 总桶，文案要区分

    # 两层同时打满（该身份自己的额度也用完了），文案仍要报更根本的 IP 层，
    # 否则会误导玩家去换设备头，而换头这时已经救不了了
    both_full = hit(client, dev("forged-0"))
    assert both_full.status_code == 429
    assert "网络" in both_full.json()["hint"]


# ---------------------------------------------------------------- 豁免

def test_options_preflight_does_not_consume_quota(client: TestClient) -> None:
    """跨域预检由最外层 CORS 短路，不吃额度；否则一次 POST 要花两格。"""
    preflight = {
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-gitmon-user,content-type",
        **dev("alice"),
    }
    for _ in range(LIMIT * 3):
        res = client.options("/api/quest/issue", headers=preflight)
        assert res.status_code == 200
    # 额度一格没动
    for _ in range(LIMIT):
        assert hit(client, dev("alice")).status_code == 200
    assert hit(client, dev("alice")).status_code == 429


def test_cheap_probes_and_job_polling_are_free(client: TestClient) -> None:
    """健康检查 / 登录态探测 / 孵化轮询不该占掉扫描额度。"""
    for _ in range(30):
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/meta").status_code == 200
        assert client.get("/api/auth/providers").status_code == 200
        client.get("/api/jobs/does-not-exist")  # 404 也无所谓，只看不计费
    for _ in range(LIMIT):
        assert hit(client, dev("alice")).status_code == 200


def test_429_response_carries_cors_headers(client: TestClient) -> None:
    """429 从限流中间件直接返回，也必须带 CORS 头，否则浏览器只看得见 CORS 错误。"""
    headers = {**dev("alice"), "Origin": ORIGIN}
    for _ in range(LIMIT):
        assert client.get(BILLABLE, headers=headers).status_code == 200
    blocked = client.get(BILLABLE, headers=headers)
    assert blocked.status_code == 429
    assert blocked.headers["access-control-allow-origin"] == ORIGIN
    assert "Retry-After" in blocked.headers["access-control-expose-headers"]


# ---------------------------------------------------------------- 响应头与回血

def test_rate_headers_and_real_retry_after(client: TestClient, clock: FakeClock) -> None:
    for i in range(LIMIT):
        res = hit(client, dev("alice"))
        assert res.status_code == 200
        assert res.headers["X-RateLimit-Limit"] == str(LIMIT)
        assert res.headers["X-RateLimit-Remaining"] == str(LIMIT - i - 1)
        assert int(res.headers["X-RateLimit-Reset"]) > clock.time()

    blocked = hit(client, dev("alice"))
    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == "60"
    assert blocked.headers["X-RateLimit-Remaining"] == "0"
    assert blocked.json()["retryAfter"] == 60

    # 59 秒后只差 1 秒就回血 —— 旧版这里仍会写死 60
    clock.advance(59)
    soon = hit(client, dev("alice"))
    assert soon.status_code == 429
    assert soon.headers["Retry-After"] == "1"
    assert soon.json()["retryAfter"] == 1

    clock.advance(1.1)
    assert hit(client, dev("alice")).status_code == 200  # 最老一条过期，滑动窗口回血


def test_config_change_takes_effect_without_restart(client: TestClient, monkeypatch) -> None:
    """limiter 在 create_app 时构造，运行期改配置也要同步（测试夹具常用）。"""
    for _ in range(LIMIT):
        assert hit(client, dev("alice")).status_code == 200
    assert hit(client, dev("alice")).status_code == 429

    monkeypatch.setattr(config.settings, "rate_limit_per_min", LIMIT * 2)
    for _ in range(LIMIT):
        assert hit(client, dev("alice")).status_code == 200
    assert hit(client, dev("alice")).status_code == 429


# ---------------------------------------------------------------- 反代

def test_trust_proxy_splits_by_forwarded_for(tmp_dir, monkeypatch, clock) -> None:
    """部署在可信反代后，按 XFF 区分客户端；默认关闭时不认这个头。"""
    settings = config.settings
    monkeypatch.setattr(settings, "data_dir", tmp_dir)
    monkeypatch.setattr(settings, "static_dir", None)
    monkeypatch.setattr(settings, "rate_limit_per_min", LIMIT)
    monkeypatch.setattr(settings, "daily_sync", False)
    monkeypatch.setattr(settings, "trust_proxy", True)
    monkeypatch.setattr(settings, "cors_origins", [])
    settings.ensure_dirs()
    with TestClient(main.create_app(start_queue=False)) as client:
        left = {"X-Forwarded-For": "10.0.0.1, 10.0.0.9"}
        right = {"X-Forwarded-For": "10.0.0.2"}
        for _ in range(LIMIT):
            assert client.get(BILLABLE, headers=left).status_code == 200
        assert client.get(BILLABLE, headers=left).status_code == 429
        # IP 不同 → 独立额度（连设备头都不用带）
        assert client.get(BILLABLE, headers=right).status_code == 200
