"""对话语音：参数校验、缓存命中、端点不支持语音时的降级语义。"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

import httpx
import pytest

from gitmon_api import tts
from gitmon_api.config import settings


@pytest.fixture(autouse=True)
def temp_data(monkeypatch):
    """语音缓存写进临时目录，别污染 backend/data。"""
    path = Path(tempfile.mkdtemp(prefix="gitmon-tts-"))
    monkeypatch.setattr(settings, "data_dir", path)
    yield path
    shutil.rmtree(path, ignore_errors=True)


def run(coro):
    return asyncio.run(coro)


def test_unknown_role_is_400() -> None:
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="npc", rate=1.0, engine="cloud", llm_in={"apiKey": "k"}))
    assert err.value.status_code == 400


def test_blank_text_is_400() -> None:
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="   ", role="pet", rate=1.0, engine="cloud", llm_in={"apiKey": "k"}))
    assert err.value.status_code == 400


def test_missing_key_is_503() -> None:
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="pet", rate=1.0, engine="cloud", llm_in={}))
    assert err.value.status_code == 503
    assert "密钥" in err.value.hint


def test_second_call_hits_disk_cache(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_cloud(text: str, voice: str, rate: float, llm_in) -> bytes:
        calls.append(text)
        return b"ID3-fake-mp3"

    monkeypatch.setattr(tts, "_cloud_speech", fake_cloud)
    first, head1 = run(tts.speech(text="那天夜里，整条榜单都在传一件事。", role="narrator",
                                  rate=1.0, engine="cloud", llm_in={"apiKey": "k"}))
    second, head2 = run(tts.speech(text="那天夜里，整条榜单都在传一件事。", role="narrator",
                                   rate=1.0, engine="cloud", llm_in={"apiKey": "k"}))
    assert first == second == b"ID3-fake-mp3"
    assert head1["X-TTS-Cache"] == "miss"
    assert head2["X-TTS-Cache"] == "hit"
    assert len(calls) == 1


def test_rate_change_busts_cache(monkeypatch) -> None:
    calls: list[float] = []

    async def fake_cloud(text: str, voice: str, rate: float, llm_in) -> bytes:
        calls.append(rate)
        return f"ID3-{rate}".encode()

    monkeypatch.setattr(tts, "_cloud_speech", fake_cloud)
    run(tts.speech(text="再来一次。", role="pet", rate=1.0, engine="cloud", llm_in={"apiKey": "k"}))
    run(tts.speech(text="再来一次。", role="pet", rate=1.3, engine="cloud", llm_in={"apiKey": "k"}))
    assert calls == [1.0, 1.3]


def test_endpoint_without_speech_is_404(monkeypatch) -> None:
    """端点没有 /audio/speech 时必须是 404，不能吞成「合成失败」。"""

    async def fake_request(*_args, **_kwargs) -> httpx.Response:
        return httpx.Response(404, json={"error": "no route"})

    monkeypatch.setattr(tts, "http_request", fake_request)
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="boss", rate=1.0, engine="cloud",
                       llm_in={"baseUrl": "http://127.0.0.1:9/v1", "apiKey": "k"}))
    assert err.value.status_code == 404
    assert "系统朗读" in err.value.hint


def test_auth_failure_is_502(monkeypatch) -> None:
    async def fake_request(*_args, **_kwargs) -> httpx.Response:
        return httpx.Response(401, json={"error": "bad key"})

    monkeypatch.setattr(tts, "http_request", fake_request)
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="pet", rate=1.0, engine="cloud",
                       llm_in={"baseUrl": "http://127.0.0.1:9/v1", "apiKey": "bad"}))
    assert err.value.status_code == 502


def test_bad_engine_is_400() -> None:
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="pet", rate=1.0, engine="piper", llm_in={"apiKey": "k"}))
    assert err.value.status_code == 400


def test_edge_reports_missing_package(monkeypatch) -> None:
    try:
        import edge_tts  # noqa: F401
    except Exception:
        with pytest.raises(tts.TTSError) as err:
            run(tts.speech(text="你好", role="pet", rate=1.0, engine="edge", llm_in={"apiKey": "k"}))
        assert err.value.status_code == 503
    else:
        pytest.skip("本机装了 edge-tts，跳过未安装分支")


def test_health_shape() -> None:
    data = tts.health()
    assert data["cache_limit_mb"] == 200
    assert isinstance(data["edge"], bool)
    assert isinstance(data["local"], bool)
    assert tts.voices()["roles"][0]["role"] == "narrator"


def test_local_missing_model_is_503(monkeypatch, tmp_dir) -> None:
    """模型没装时必须是 503 且说清缺什么，不能静默返回空音频。"""
    monkeypatch.setattr(tts, "local_model_dir", lambda: tmp_dir / "no-model-here")
    monkeypatch.setattr(tts, "_local", {"tts": None, "error": ""})
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="pet", rate=1.0, engine="local", llm_in={}))
    assert err.value.status_code == 503
    assert "kokoro" in err.value.hint
    assert tts.health()["local"] is False


def test_local_writes_wav_cache(monkeypatch) -> None:
    """本地音源写 .wav、命中缓存后不再合成，voice 报的是 speaker 名。"""
    calls: list[tuple[str, int, float]] = []

    async def fake_local(text: str, sid: int, speed: float) -> bytes:
        calls.append((text, sid, speed))
        return b"RIFF-fake-wav"

    monkeypatch.setattr(tts, "_local_speech", fake_local)
    first, head1 = run(tts.speech(text="山顶风大。", role="pet", rate=1.0, engine="local", llm_in={}))
    second, head2 = run(tts.speech(text="山顶风大。", role="pet", rate=1.0, engine="local", llm_in={}))
    assert first == second == b"RIFF-fake-wav"
    assert head1["X-TTS-Cache"] == "miss" and head2["X-TTS-Cache"] == "hit"
    assert head1["X-TTS-Voice"] == tts.LOCAL_SPEAKER_NAMES[tts.LOCAL_SPEAKERS["pet"]]
    assert len(calls) == 1
    assert calls[0][1] == tts.LOCAL_SPEAKERS["pet"]
    assert list((settings.data_dir / "tts").glob("*.wav"))


def test_local_needs_no_api_key(monkeypatch) -> None:
    """本地音源不看密钥：空 llm 也不能因为「没绑定模型」被拒。"""
    async def fake_local(text: str, sid: int, speed: float) -> bytes:
        return b"RIFF"

    monkeypatch.setattr(tts, "_local_speech", fake_local)
    _audio, head = run(tts.speech(text="云端也能念。", role="boss", rate=1.0, engine="local", llm_in={}))
    assert head["X-TTS-Provider"] == "local"
    assert tts.MIME_TYPES["local"] == "audio/wav"


def test_system_engine_is_rejected_backend_side() -> None:
    """system 由浏览器自己念，后端不该收。"""
    with pytest.raises(tts.TTSError) as err:
        run(tts.speech(text="你好", role="pet", rate=1.0, engine="system", llm_in={}))
    assert err.value.status_code == 400
