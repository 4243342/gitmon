"""对话语音（TTS）：把剧情台词合成为音频。

三条音源：

- **local**：`sherpa-onnx` + Kokoro-82M 中文模型，纯本地 CPU 合成，免 key 免联网
  （默认推荐；模型没装时明确报 503，不静默降级）
- **cloud**：走用户已绑定的 OpenAI 兼容端点 `POST {baseUrl}/audio/speech`
  （key 只在内存里转发一次，与 `/api/story/text` 同一套 BYOK 凭据）
- **edge**：可选的 `edge-tts`（免 key，音色接近商用），未安装时明确报 503，
  默认关闭，用户在设置里主动开启才用

设计见 docs/TTS.md。这里只负责「拿到文本 → 返回音频字节」，不放任何剧情逻辑。
"""

from __future__ import annotations

import array
import asyncio
import hashlib
import io
import os
import threading
import time
import wave
from pathlib import Path
from typing import Any

import httpx

from .config import settings
from .llm import http_request

# 单条台词的上限：剧情一屏最多 4 句，单句 200 字足够
MAX_TEXT = 200
# 语音文件的磁盘上限，超了按最旧的删
CACHE_LIMIT_BYTES = 200 * 1024 * 1024

# 角色声线表：前端只传角色名，换音源时改这里
ROLE_VOICES: dict[str, dict[str, Any]] = {
    "narrator": {
        "label": "旁白",
        "cloud": "onyx",
        "edge": "zh-CN-YunjianNeural",
        "pitch": 0.95,
        "rate": 0.98,
    },
    "pet": {
        "label": "主角",
        "cloud": "alloy",
        "edge": "zh-CN-YunxiNeural",
        "pitch": 1.15,
        "rate": 1.05,
    },
    "scout": {
        "label": "引路人",
        "cloud": "echo",
        "edge": "zh-CN-YunyangNeural",
        "pitch": 0.88,
        "rate": 1.0,
    },
    "boss": {
        "label": "宿敌",
        "cloud": "fable",
        "edge": "zh-CN-YunyeNeural",
        "pitch": 0.75,
        "rate": 0.92,
    },
}

# 云端先试 tts-1（便宜、最通用），失败再试新模型名
CLOUD_MODELS = ("tts-1", "gpt-4o-mini-tts")

# 各音源返回的音频格式：云端/edge 给 mp3，本地给 wav
MIME_TYPES = {"cloud": "audio/mpeg", "edge": "audio/mpeg", "local": "audio/wav"}
CACHE_SUFFIX = {"cloud": ".mp3", "edge": ".mp3", "local": ".wav"}

# ---------------------------------------------------------------- 本地音源配置

# 模型目录：backend/models/kokoro-multi-lang-v1_1，可用环境变量指到别处
LOCAL_MODEL_DIR_NAME = "kokoro-multi-lang-v1_1"
# 6 线程在 M 系列上 RTF≈0.43（14 核手动调到 8 反而更慢，别贪多）
LOCAL_THREADS = 6

# 中文音色：kokoro-multi-lang-v1_1 的 sid 45–52 就是 v1.0 那八个中文音色。
# 45 zf_xiaobei / 46 zf_xiaoni / 47 zf_xiaoxiao / 48 zf_xiaoyi
# 49 zm_yunjian / 50 zm_yunxi / 51 zm_yunxia / 52 zm_yunyang
# 四角色按「两女两男、音区拉开」配：旁白女声稳、主角年轻男声、引路人清亮女声、宿敌低沉男声。
LOCAL_SPEAKERS: dict[str, int] = {
    "narrator": 47,  # zf_xiaoxiao
    "pet": 50,       # zm_yunxi
    "scout": 46,     # zf_xiaoni
    "boss": 49,      # zm_yunjian
}
LOCAL_SPEAKER_NAMES = {
    45: "zf_xiaobei", 46: "zf_xiaoni", 47: "zf_xiaoxiao", 48: "zf_xiaoyi",
    49: "zm_yunjian", 50: "zm_yunxi", 51: "zm_yunxia", 52: "zm_yunyang",
}


class TTSError(Exception):
    def __init__(self, message: str, *, status_code: int = 502, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.hint = hint


def cache_dir() -> Path:
    path = settings.data_dir / "tts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_key(engine: str, voice: str, rate: float, text: str) -> str:
    raw = f"{engine}|{voice}|{rate:.2f}|{text}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _prune(limit: int = CACHE_LIMIT_BYTES) -> None:
    """超限时按修改时间删最旧的语音文件，别把磁盘吃满。"""
    files = []
    total = 0
    for pattern in ("*.mp3", "*.wav"):
        for item in cache_dir().glob(pattern):
            try:
                stat = item.stat()
            except OSError:
                continue
            files.append((stat.st_mtime, stat.st_size, item))
            total += stat.st_size
    if total <= limit:
        return
    for _mtime, size, item in sorted(files):
        try:
            item.unlink()
        except OSError:
            pass
        total -= size
        if total <= limit:
            break


def _clean_text(text: str) -> str:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        raise TTSError("没有可朗读的文本", status_code=400)
    return cleaned[:MAX_TEXT]


def _role_of(role: str) -> dict[str, Any]:
    key = str(role or "narrator").strip().lower()
    if key not in ROLE_VOICES:
        raise TTSError(f"未知角色：{role}", status_code=400, hint="只支持 narrator / pet / scout / boss")
    return {"role": key, **ROLE_VOICES[key]}


def _clamp_rate(rate: Any) -> float:
    try:
        value = float(rate)
    except (TypeError, ValueError):
        return 1.0
    return max(0.6, min(1.6, value))


def _llm_key(llm_in: dict[str, Any] | None) -> tuple[str, str]:
    data = llm_in or {}
    base = str(data.get("baseUrl") or "").strip().rstrip("/")
    key = str(data.get("apiKey") or "").strip()
    return base or "https://api.openai.com/v1", key


async def _cloud_speech(text: str, voice: str, rate: float, llm_in: dict[str, Any] | None) -> bytes:
    base, key = _llm_key(llm_in)
    if not key:
        raise TTSError(
            "没有绑定模型，无法使用在线语音", status_code=503,
            hint="去「AI 高级版入口」粘贴密钥，或在设置里把语音切成系统朗读",
        )
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    timeout = httpx.Timeout(12.0, connect=8.0)
    last: str = ""
    for index, model in enumerate(CLOUD_MODELS):
        payload = {
            "model": model,
            "input": text,
            "voice": voice,
            "speed": rate,
            "response_format": "mp3",
        }
        try:
            resp = await http_request(
                "POST", f"{base}/audio/speech",
                timeout=timeout, headers=headers, json_body=payload,
            )
        except httpx.TimeoutException:
            raise TTSError("语音合成超时", status_code=504, hint="网络慢或端点排队，已自动改用系统朗读") from None
        except httpx.ConnectError as exc:
            raise TTSError(
                "连不上语音接口", status_code=502, hint=f"{type(exc).__name__}：检查 Base URL 与代理",
            ) from None
        except httpx.HTTPError as exc:
            raise TTSError("语音接口请求失败", status_code=502, hint=str(exc)[:120]) from None

        if resp.status_code == 200 and resp.content:
            return resp.content

        last = resp.text[:200]
        # 404 = 这个端点根本没有 /audio/speech；不要伪装成"合成失败"
        if resp.status_code == 404:
            raise TTSError(
                "当前 Base URL 不提供语音合成（404）", status_code=404,
                hint="这个端点只有对话模型；语音已自动改用系统朗读，或换成支持 /audio/speech 的端点",
            )
        if resp.status_code in (401, 403):
            raise TTSError(
                "语音接口鉴权失败", status_code=502, hint="密钥无效或没有音频权限，重新粘贴一次密钥",
            )
        # 400 多半是模型名不被支持：换下一个模型再试一次
        if resp.status_code == 400 and index + 1 < len(CLOUD_MODELS):
            continue
        break

    raise TTSError("语音合成失败", status_code=502, hint=last or "端点返回了空音频")


# ---------------------------------------------------------------- 本地引擎

_local: dict[str, Any] = {"tts": None, "error": ""}
_load_lock = threading.Lock()
_synth_lock = threading.Lock()


def local_model_dir() -> Path:
    """模型目录默认在 backend/models/，可用 GITMON_TTS_MODEL_DIR 指到别处。"""
    raw = os.environ.get("GITMON_TTS_MODEL_DIR", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path(__file__).resolve().parent.parent / "models" / LOCAL_MODEL_DIR_NAME


def local_ready() -> bool:
    folder = local_model_dir()
    return all((folder / name).exists() for name in ("model.onnx", "voices.bin", "tokens.txt"))


def _load_local() -> Any:
    """加载一次常驻内存：320MB 模型、约 1.2s，别在每次请求里重建。"""
    with _load_lock:
        if _local["tts"] is not None:
            return _local["tts"]
        if not local_ready():
            raise TTSError(
                "本地语音模型没装", status_code=503,
                hint=f"把 {LOCAL_MODEL_DIR_NAME} 放到 {local_model_dir()}，或在设置里换成在线/系统朗读",
            )
        try:
            import sherpa_onnx  # 可选依赖，没装就走 503
        except Exception:
            raise TTSError(
                "未安装 sherpa-onnx", status_code=503,
                hint="pip install sherpa-onnx 后重启后端，或在设置里换成在线/系统朗读",
            ) from None
        folder = local_model_dir()
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=str(folder / "model.onnx"),
                    voices=str(folder / "voices.bin"),
                    tokens=str(folder / "tokens.txt"),
                    lexicon=f"{folder / 'lexicon-us-en.txt'},{folder / 'lexicon-zh.txt'}",
                ),
                num_threads=LOCAL_THREADS,
                provider="cpu",
            ),
            max_num_sentences=1,
            rule_fsts=",".join(
                str(folder / name) for name in ("date-zh.fst", "number-zh.fst", "phone-zh.fst")
            ),
        )
        try:
            if not cfg.validate():
                raise RuntimeError("模型配置校验失败")
            engine = sherpa_onnx.OfflineTts(cfg)
        except Exception as exc:
            _local["error"] = f"{type(exc).__name__}: {str(exc)[:120]}"
            raise TTSError(
                "本地语音模型加载失败", status_code=503, hint=_local["error"],
            ) from None
        _local["tts"] = engine
        _local["error"] = ""
        return engine


def _wav_bytes(audio: Any) -> bytes:
    """sherpa 给 float32 PCM，浏览器 decodeAudioData 需要容器头，包成 16bit wav。"""
    pcm = array.array("h", (int(max(-1.0, min(1.0, s)) * 32767) for s in audio.samples))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(int(audio.sample_rate))
        writer.writeframes(pcm.tobytes())
    return buf.getvalue()


async def _local_speech(text: str, sid: int, speed: float) -> bytes:
    def run() -> bytes:
        engine = _load_local()
        # OfflineTts 实例不保证并发安全，串行调用也避免抢占 CPU
        with _synth_lock:
            audio = engine.generate(text, sid=int(sid), speed=float(speed))
        if not audio.samples:
            raise TTSError("本地合成返回空音频", status_code=502)
        return _wav_bytes(audio)

    # 合成是纯 CPU 阻塞调用，丢线程池里跑，别堵住事件循环（剧情接口要同时响应）
    return await asyncio.to_thread(run)


def warm() -> bool:
    """进程启动时后台热一遍：冷启动 1.2s + 首句额外开销，别让玩家等。"""
    if not local_ready():
        return False
    try:
        engine = _load_local()
        with _synth_lock:
            engine.generate("预热。", sid=LOCAL_SPEAKERS["narrator"], speed=1.0)
        return True
    except Exception:
        return False


async def _edge_speech(text: str, voice: str, rate: float) -> bytes:
    try:
        import edge_tts  # 可选依赖，没装就走 503
    except Exception:
        raise TTSError(
            "未安装 edge-tts", status_code=503,
            hint="pip install edge-tts 后重启后端，或在设置里用在线/系统朗读",
        ) from None
    percent = int(round((rate - 1) * 100))
    rate_arg = f"{percent:+d}%"
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate_arg)
        chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                chunks.append(chunk["data"])
    except Exception as exc:
        raise TTSError(
            "edge-tts 合成失败", status_code=502, hint=f"{type(exc).__name__}: {str(exc)[:100]}",
        ) from None
    if not chunks:
        raise TTSError("edge-tts 返回空音频", status_code=502)
    return b"".join(chunks)


async def speech(
    *, text: str, role: str, rate: float, engine: str, llm_in: dict[str, Any] | None,
) -> tuple[bytes, dict[str, str]]:
    """合成一条台词。返回 (mp3 字节, 响应头)。命中缓存时不打模型。"""
    cleaned = _clean_text(text)
    info = _role_of(role)
    speed = _clamp_rate(rate)
    mode = str(engine or "local").strip().lower()
    if mode not in MIME_TYPES:
        raise TTSError(f"不支持的音源：{engine}", status_code=400, hint="只支持 local / cloud / edge")

    if mode == "local":
        sid = int(LOCAL_SPEAKERS.get(info["role"], LOCAL_SPEAKERS["narrator"]))
        voice = LOCAL_SPEAKER_NAMES.get(sid, f"sid-{sid}")
    else:
        sid = 0
        voice = str(info["edge"] if mode == "edge" else info["cloud"])
    key = _cache_key(mode, voice, speed, cleaned)
    path = cache_dir() / f"{key}{CACHE_SUFFIX[mode]}"
    if path.exists():
        try:
            data = path.read_bytes()
            if data:
                return data, {"X-TTS-Cache": "hit", "X-TTS-Provider": mode, "X-TTS-Voice": voice}
        except OSError:
            pass

    if mode == "local":
        audio = await _local_speech(cleaned, sid, speed)
    elif mode == "edge":
        audio = await _edge_speech(cleaned, voice, speed)
    else:
        audio = await _cloud_speech(cleaned, voice, speed, llm_in)
    try:
        path.write_bytes(audio)
        _prune()
    except OSError:
        # 写缓存失败不影响本次播放
        pass
    return audio, {"X-TTS-Cache": "miss", "X-TTS-Provider": mode, "X-TTS-Voice": voice}


def voices() -> dict[str, Any]:
    """角色 → 音色映射，设置页做试听与说明用。"""
    return {
        "roles": [
            {
                "role": key,
                "label": value["label"],
                "cloud": value["cloud"],
                "edge": value["edge"],
                "local": LOCAL_SPEAKER_NAMES.get(LOCAL_SPEAKERS.get(key, 0), ""),
            }
            for key, value in ROLE_VOICES.items()
        ],
    }


def health() -> dict[str, Any]:
    total = 0
    count = 0
    for pattern in ("*.mp3", "*.wav"):
        for item in cache_dir().glob(pattern):
            try:
                total += item.stat().st_size
                count += 1
            except OSError:
                continue
    try:
        import edge_tts  # noqa: F401
        edge_ready = True
    except Exception:
        edge_ready = False
    ready = local_ready()
    try:
        import sherpa_onnx  # noqa: F401
        local_pkg = True
    except Exception:
        local_pkg = False
    return {
        "edge": edge_ready,
        "local": bool(ready and local_pkg),
        "local_reason": "" if ready and local_pkg else (
            f"缺少模型目录 {local_model_dir()}" if not ready else "缺少 sherpa-onnx"
        ),
        "local_loaded": _local["tts"] is not None,
        "cache_files": count,
        "cache_bytes": round(total / 1024 / 1024, 2),
        "cache_limit_mb": round(CACHE_LIMIT_BYTES / 1024 / 1024),
        "checked_at": int(time.time()),
    }
