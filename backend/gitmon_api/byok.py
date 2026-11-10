"""BYOK 自动绑定：只给一枚 API Key，自动认出厂商、接口地址和可用模型。

移植自 byok-auto-match-module.zip（modstore_server/llm_key_resolver.py 的厂商根地址表、
llm_catalog_part04.py 的 /models 并行探测、market/src/byokEnvImport.ts 的 .env/厂商=密钥解析）。
按本项目做了裁剪：
  * 只保留 OpenAI 兼容厂商（本项目后端统一走 /chat/completions）；
  * 不落库、不加密存储、不需要登录态 —— 密钥只活在一次请求里；
  * 探测只发给表里列出的厂商官方域名，不外发到任意第三方地址。

安全提示：自动识别的本质是「拿这把钥匙依次去各家 /models 试开」，
前端会明确告知用户；某些厂商的失败日志里可能记录一次 401，但密钥不写本地日志。
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx

from .llm import LLMError, http_request

# (id, 展示名, chat/completions 基址, 首选模型, 密钥前缀提示)
# 根地址沿用 zip 里 OPENAI_COMPAT_DEFAULT_ROOT，并把 /v1 等版本段补齐。
PROVIDERS: list[dict[str, Any]] = [
    {"id": "openai", "label": "OpenAI", "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o-mini", "prefixes": ("sk-proj-", "sk-")},
    {"id": "openrouter", "label": "OpenRouter", "baseUrl": "https://openrouter.ai/api/v1", "model": "openai/gpt-4o-mini", "prefixes": ("sk-or-v1-", "sk-or-"), "public": True},
    {"id": "deepseek", "label": "DeepSeek", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat", "prefixes": ("sk-",)},
    {"id": "groq", "label": "Groq", "baseUrl": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "prefixes": ("gsk_",)},
    {"id": "siliconflow", "label": "硅基流动 SiliconFlow", "baseUrl": "https://api.siliconflow.cn/v1", "model": "Qwen/Qwen2.5-7B-Instruct", "prefixes": ("sk-",)},
    {"id": "dashscope", "label": "阿里云百炼", "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-plus", "prefixes": ("sk-",)},
    {"id": "moonshot", "label": "月之暗面 Kimi", "baseUrl": "https://api.moonshot.cn/v1", "model": "moonshot-v1-8k", "prefixes": ("sk-",)},
    {"id": "zhipu", "label": "智谱 GLM", "baseUrl": "https://open.bigmodel.cn/api/paas/v4", "model": "glm-4-flash", "prefixes": ("",)},
    {"id": "doubao", "label": "火山方舟 / 豆包", "baseUrl": "https://ark.cn-beijing.volces.com/api/v3", "model": "doubao-pro-32k", "prefixes": ("",)},
    {"id": "hunyuan", "label": "腾讯混元", "baseUrl": "https://api.hunyuan.cloud.tencent.com/v1", "model": "hunyuan-turbo", "prefixes": ("",)},
    {"id": "wenxin", "label": "百度千帆", "baseUrl": "https://qianfan.baidubce.com/v2", "model": "ernie-3.5-8k", "prefixes": ("",)},
    {"id": "minimax", "label": "MiniMax", "baseUrl": "https://api.minimaxi.com/v1", "model": "MiniMax-Text-01", "prefixes": ("sk-cp-", "minimaxsk-cp-")},
    {"id": "xiaomi", "label": "小米 MiMo", "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1", "model": "mimo-v2-flash", "prefixes": ("",)},
    {"id": "together", "label": "Together AI", "baseUrl": "https://api.together.xyz/v1", "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "prefixes": ("",)},
    {"id": "xunfei", "label": "讯飞星火", "baseUrl": "https://spark-api-open.xf-yun.com/v1", "model": "generalv3.5", "prefixes": ("",)},
    {"id": "yi", "label": "零一万物", "baseUrl": "https://api.lingyiwanwu.com/v1", "model": "yi-lightning", "prefixes": ("",)},
    {"id": "stepfun", "label": "阶跃星辰", "baseUrl": "https://api.stepfun.com/v1", "model": "step-2-mini", "prefixes": ("",)},
    {"id": "baichuan", "label": "百川智能", "baseUrl": "https://api.baichuan-ai.com/v1", "model": "Baichuan4-Turbo", "prefixes": ("",)},
    {"id": "sensetime", "label": "商汤日日新", "baseUrl": "https://api.sensenova.cn/compatible-mode/v1", "model": "SenseChat-5", "prefixes": ("",)},
]

BY_ID = {p["id"]: p for p in PROVIDERS}

# 环境变量名 → 厂商（zip 里 ENV_MAP 的精简版，只认 *_API_KEY）
ENV_TO_PROVIDER: dict[str, str] = {
    "OPENAI_API_KEY": "openai", "DEEPSEEK_API_KEY": "deepseek",
    "SILICONFLOW_API_KEY": "siliconflow", "GROQ_API_KEY": "groq",
    "TOGETHER_API_KEY": "together", "OPENROUTER_API_KEY": "openrouter",
    "DASHSCOPE_API_KEY": "dashscope", "MOONSHOT_API_KEY": "moonshot",
    "XIAOMI_API_KEY": "xiaomi", "MIMO_API_KEY": "xiaomi",
    "MINIMAX_API_KEY": "minimax", "DOUBAO_API_KEY": "doubao", "ARK_API_KEY": "doubao",
    "WENXIN_API_KEY": "wenxin", "QIANFAN_API_KEY": "wenxin",
    "HUNYUAN_API_KEY": "hunyuan", "ZHIPU_API_KEY": "zhipu", "BIGMODEL_API_KEY": "zhipu",
    "XUNFEI_API_KEY": "xunfei", "SPARK_API_KEY": "xunfei",
    "YI_API_KEY": "yi", "STEPFUN_API_KEY": "stepfun",
    "BAICHUAN_API_KEY": "baichuan", "SENSETIME_API_KEY": "sensetime",
}

# 不是聊天模型，自动挑选时要排掉
NON_CHAT = ("embed", "rerank", "moderation", "tts", "whisper", "audio", "image", "dall", "video", "realtime", "transcribe", "asr", "ocr")
# 又快又适合跑 JSON 评测的优先
PREFER = ("mini", "flash", "turbo", "lite", "chat", "instruct", "8b", "7b", "air", "lightning", "4o", "sonnet", "haiku", "plus")
# 老补全模型 / 带日期快照的旧版：即便 id 更短也不要被自动选中
LEGACY = ("davinci", "babbage", "curie", "ada", "text-", "completion", "legacy", "deprecated", "0301", "0613", "0314", "1106", "0125")

PROBE_TIMEOUT = 6.0


def parse_key_input(text: str) -> tuple[str, str | None]:
    """支持三种输入：裸密钥 / 厂商id=密钥 / .env 片段（含 export 与引号）。

    返回 (密钥, 显式指定的 provider 或 None)。
    """
    raw = (text or "").strip()
    if not raw:
        raise LLMError("请先填入 API Key", "只需要一枚密钥，厂商和模型会自动识别")
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            return line.strip(), None
        name, _, value = line.partition("=")
        name = name.strip().upper()
        value = value.strip().strip('"').strip("'").strip()
        if not value:
            continue
        provider = ENV_TO_PROVIDER.get(name)
        if not provider and name.lower() in BY_ID:
            provider = name.lower()
        return value, provider
    raise LLMError("没有解析到密钥", "直接粘贴 sk-… 或写成 deepseek=sk-… 都行")


def _rank(m: str) -> tuple[int, int, int]:
    low = m.lower()
    hits = sum(1 for word in PREFER if word in low)
    legacy = any(word in low for word in LEGACY)
    return (1 if legacy else 0, -hits, len(m))


def choose_model(models: list[str], preferred: str = "") -> str:
    """从 /models 返回里挑一个适合 JSON 评测的聊天模型。"""
    ids = [str(m).strip() for m in models if str(m).strip()]
    if not ids:
        return preferred
    if preferred and preferred in ids:
        return preferred
    chat = [m for m in ids if not any(word in m.lower() for word in NON_CHAT)]
    pool = chat or ids
    return sorted(pool, key=_rank)[0]


def list_models(models: list[str], current: str = "") -> list[str]:
    """给前端下拉选择用的模型列表：端点返回的全量列出（不截断），仅去重；
    聊天模型排前，非聊天（embedding/tts/whisper/legacy 等）沉底，当前模型保证在列。"""
    ids = list(dict.fromkeys(str(m).strip() for m in models if str(m).strip()))
    if not ids:
        return [current] if current else []

    def sort_key(m: str) -> tuple[int, int, int, int]:
        nonchat = 1 if any(word in m.lower() for word in NON_CHAT) else 0
        return (nonchat, *_rank(m))

    ordered = sorted(ids, key=sort_key)
    if current and current not in ordered:
        ordered.insert(0, current)
    return ordered


def _priority(provider: dict[str, Any], key: str) -> int:
    lowered = key.lower()
    return 0 if any(pref and lowered.startswith(pref) for pref in provider["prefixes"]) else 1


def _match_len(provider: dict[str, Any], key: str) -> int:
    """密钥命中该厂商的最长前缀长度，没命中返回 0（sk-proj- 会优先于通用的 sk-）。"""
    lowered = key.lower()
    hits = [len(pref) for pref in provider["prefixes"] if pref and lowered.startswith(pref)]
    return max(hits) if hits else 0


def _base_url_ok(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise LLMError("自定义接口地址不合法", "填完整的 Base URL，如 http://127.0.0.1:11434/v1")
    return url.rstrip("/")


def _probe(resp: httpx.Response) -> list[str]:
    if resp.status_code != 200:
        return []
    try:
        body = resp.json()
    except ValueError:
        return []
    rows = body.get("data") or body.get("models") or []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        mid = row.get("id") if isinstance(row, dict) else row
        if mid:
            out.append(str(mid))
    return out


async def detect(api_key: str, *, provider: str | None = None, custom: dict[str, Any] | None = None) -> dict[str, Any]:
    """拿密钥依次试拉各厂商 /models，第一个返回非空模型列表的就是归属。"""
    key = (api_key or "").strip()
    if len(key) < 8:
        raise LLMError("密钥太短", "粘贴完整密钥（至少 8 个字符）")

    if custom:
        base = _base_url_ok(str(custom.get("baseUrl") or ""))
        label = str(custom.get("label") or "自定义端点")[:40]
        given_model = str(custom.get("model") or "").strip()
        try:
            resp = await http_request(
                "GET", f"{base}/models", timeout=PROBE_TIMEOUT,
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
            models = _probe(resp)
        except httpx.HTTPError:
            models = []
        if not models and not given_model:
            raise LLMError("自定义端点没有返回模型列表", "确认地址以 /v1 结尾、服务已启动，或直接填模型名跳过探测")
        chosen = given_model or choose_model(models)
        return {
            "provider": "custom", "label": label, "baseUrl": base,
            "model": chosen, "models": list_models(models, chosen),
            "verified": bool(models), "detectedBy": "custom",
        }

    if provider:
        target = BY_ID.get(provider)
        if not target:
            raise LLMError(f"不支持的厂商：{provider}", f"可用：{', '.join(BY_ID)}")
        candidates = [target]
    else:
        candidates = sorted(PROVIDERS, key=lambda p: (_priority(p, key), PROVIDERS.index(p)))
        # 公开 /models 端点（如 OpenRouter 无需鉴权、列表恒非空）不能作为识别证据：
        # 前一顺位探测瞬时失败时它会把任何密钥假阳性绑成自己——前缀不吻合就不探测。
        candidates = [
            p for p in candidates
            if not (p.get("public") and _priority(p, key) != 0)
        ]

    results = await asyncio.gather(
        *[
            http_request(
                "GET", f"{p['baseUrl']}/models", timeout=PROBE_TIMEOUT, follow_redirects=True,
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
            for p in candidates
        ],
        return_exceptions=True,
    )
    failures: dict[str, str] = {}
    for target, resp in zip(candidates, results):
        if isinstance(resp, Exception):
            failures[target["id"]] = "超时/不可达"
            continue
        models = _probe(resp)
        if not models:
            failures[target["id"]] = f"HTTP {resp.status_code}"
            continue
        chosen = choose_model(models, target["model"])
        return {
            "provider": target["id"],
            "label": target["label"],
            "baseUrl": target["baseUrl"],
            "model": chosen,
            "models": list_models(models, chosen),
            "verified": True,
            "detectedBy": "models",
        }

    # 密钥前缀只指向一家厂商、而这家的接口本机探测不到（如 openai 在部分机房超时）：
    # 先按前缀绑定并标记未验证，比直接报「认不出来」更可用，调用时再暴露真实网络问题。
    # 注意：① 只取「匹配到的最长前缀」，避免 sk- 这种通用前缀把五家都算进来；
    #      ② 只有「探测不到」才降级；厂商可达但返回 401 说明密钥本身无效，不能放过。
    lengths = {p["id"]: _match_len(p, key) for p in candidates}
    best = max(lengths.values(), default=0)
    prefix_hits = [p for p in candidates if best and lengths[p["id"]] == best]
    if len(prefix_hits) == 1 and failures.get(prefix_hits[0]["id"], "").startswith("超时"):
        target = prefix_hits[0]
        reason = failures[target["id"]]
        return {
            "provider": target["id"],
            "label": target["label"],
            "baseUrl": target["baseUrl"],
            "model": target["model"],
            "models": [target["model"]],
            "verified": False,
            "detectedBy": "prefix",
            "note": f"{target['label']} 接口从服务器探测不到（{reason or '无响应'}），已按密钥前缀绑定，调用前请确认网络或改用自定义端点",
        }

    hint = "确认密钥有效、网络/代理可用；也可以展开「自定义端点」手动填地址和模型"
    unreachable = [pid for pid, why in failures.items() if why.startswith("超时")]
    if unreachable:
        hint += f"（本服务器探测不到：{', '.join(unreachable)}）"
    raise LLMError("没能自动认出这枚密钥属于哪家厂商", hint)


async def bind(text: str, *, custom: dict[str, Any] | None = None) -> dict[str, Any]:
    key, provider = parse_key_input(text)
    return await detect(key, provider=provider, custom=custom)
