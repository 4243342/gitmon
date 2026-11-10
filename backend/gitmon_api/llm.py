"""高级模式：把「全部评测」交给用户自填的大模型（OpenAI 兼容接口）。

职责边界（很重要）：
  * 服务端只做转发、解析、安全兜底，**不参与任何评测**——品质、六维、根基、
    词条、技能、属性、等级全部由模型给出，本地绝不跑规则引擎再算一遍。
  * 缺字段时只补一个安全的显示默认值，并在 ``warnings`` 里如实记录，
    让前端能告诉用户「哪几项是兜底值」。
  * API Key 只活在这次请求的内存里：不落盘、不写日志、不回传、不进异常文本。

参考设计：docs/DESIGN.md §6.2（规则模板 + LLM 润色）在高级模式下整个让位给模型。
"""

from __future__ import annotations

import ipaddress
import json
import re
import time
from typing import Any
from urllib.parse import urlparse
from urllib.request import getproxies, proxy_bypass

import httpx

ELEMENT_KEYS = {"water", "thunder", "steel", "earth", "rock", "fire", "wind", "grass", "normal"}
SPECIES_KEYS = {"beast", "bird", "element", "dragon", "flying", "phantom", "fairy"}
QUALITY_KEYS = {"N", "R", "SR", "SSR"}

# 前端 qualityDims / stats 的固定槽位，模型按这个顺序给分（只给数字，省 token）
QUALITY_DIM_KEYS = ["tests", "engineering", "docs", "health", "community"]
STAT_NAMES = ["攻击", "防御", "速度", "特攻", "特防", "HP"]

SYSTEM_PROMPT = """你是 GitMon 的「仓库精灵评测官」。用户给你一个 GitHub / Gitee 仓库（可能只给名字），
你需要**凭自己的知识推测这个项目的画像，并独立完成全部评测**，输出一份严格的 JSON。

硬性要求：
0. 若用户消息里附带「真实审计证据」，其中的数字与事实**优先于你的记忆与推测**：
   属性看 languages 占比、种族看根目录线索与 README、等级基数看 commits / 贡献者 / 代码体量，
   stars、品质维度证据一律以证据为准，禁止另猜一套；JSON 的 evidence 字段要写清用到了哪条证据。
   没有附带证据时，才按你的知识推测。
1. 只输出一个 JSON 对象，不要 markdown 代码块、不要解释文字、不要注释。
2. 所有数值都由你评测给出，不要写「未知 / 无法判断 / null」；不确定就按你对同类项目的了解给一个合理估值。
3. 这是给游戏用的趣味推演，不必精确，但要自洽：star 高的项目品质分、社区认可应更高；
   停更多年的项目维护健康度、根基应更低。品质档位必须和 qualityScore 对得上
   （>=80 为 SSR，>=60 为 SR，>=40 为 R，否则 N）。
4. 等级（level）按「代码体量 / 维护历史 / 工程量」给，**不是 star 数，也不是品质分**。
   严格对照下面的锚点，这是最容易给飘的一项：
     · 个人脚本、玩具 demo、单文件工具：Lv.5–30
     · 小型库、组件、课程项目：Lv.30–60
     · 中型框架插件、活跃工具链：Lv.60–100
     · 成熟大型应用（Dify、Vue、Rails 这一档）：Lv.110–130，**Dify 取 Lv.120**
     · 超大型企业级代码库（Odoo、Kubernetes、Linux 这一档）：Lv.140–170，**Odoo 取 Lv.150**
     · 只有极少数内核级项目才超过 Lv.200；普通项目一律不要超过 Lv.160
   校准示例：Dify → level 120；Odoo → level 150；awesome-xxx（纯清单仓库）→ level 12。
   即使 quality 是 SSR，等级也按体量给：star 很高但几乎没有代码的清单项目只能给 Lv.10–30。
5. 用简体中文写文案，风格像游戏图鉴，克制、有画面感，不要堆形容词。
6. 不要编造你看不到的具体文件、提交哈希或 CVE 编号。
7. 4 个技能必须由你**针对这个项目的技术栈 / 生态位现编**：名字、属性、威力、解锁等级、
   效果描述、定制依据都要贴合项目，描述里写清它对应项目的哪项真实能力；
   不要套用通用技能模板，不要用固定的 1/1/150/500 解锁等级，
   解锁等级请按技能强度与项目体量自行给出，并按从低到高排列。

JSON 字段（全部必填）：
{
  "owner": "仓库所属账号",
  "repo": "仓库名",
  "summary": "一句话描述这个项目是做什么的（<=60字）",
  "element": "属性，只能是 water/thunder/steel/earth/rock/fire/wind/grass/normal 之一",
  "elementSecondary": "副属性，同上；没有就填 null",
  "species": "种族，只能是 beast/bird/element/dragon/flying/phantom/fairy 之一",
  "quality": "品质档位，N/R/SR/SSR 之一",
  "qualityScore": 0-100 整数,
  "qualityDims": [测试完备度, 工程质量, 文档完整度, 维护健康度, 社区认可]，5 个 0-100 整数,
  "engineeringScore": 0-100 整数（工程量）,
  "level": 整数（等级，按第 4 条锚点给；常见 10–160，不要随手给到 900）,
  "stats": [攻击, 防御, 速度, 特攻, 特防, HP]，6 个 0-100 整数（最终值，已包含词条影响）,
  "foundation": 0-100 整数（根基：底子有多稳）,
  "traits": [{"name":"词条名","kind":"positive 或 negative","desc":"一句图鉴式描述","reason":"为什么给这个词条"}]，最多 4 条,
  "skills": [
    {"name":"技能名", "element":"属性 key，同上面的属性枚举", "power":0-100 整数（威力）,
     "unlockLevel":整数（解锁等级 1-999，按技能强度与项目体量给）,
     "desc":"一句图鉴式效果描述（<=40字），写清对应项目的什么能力",
     "reason":"为什么这个项目配这个技能（<=40字）"}
  ]，正好 4 个，按 unlockLevel 从低到高排列，全部由你根据项目制定,
  "stars": 整数（推测的 star 数）,
  "aiRate": 0-100 整数（你推测的代码 AI 生成比例），
  "comment": "一句精灵点评（<=40字）",
  "evidence": "你推测的依据，比如流行度、生态位、维护节奏（<=100字）"
}"""

USER_TEMPLATE = """请评测这个仓库：{repo}
平台：{platform}
{evidence_block}
{hint_line}
只输出 JSON。"""


class LLMError(Exception):
    """可直接展示给用户的模型调用错误（绝不包含 API Key）。"""

    def __init__(self, message: str, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


def _clamp(value: Any, lo: float, hi: float, default: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if n != n:  # NaN
        return default
    return max(lo, min(hi, n))


def _text(value: Any, limit: int, default: str = "") -> str:
    if not isinstance(value, str):
        return default
    return value.strip()[:limit] or default


def _fix_num_list(value: Any, size: int, default: int, warnings: list[str], label: str) -> list[int]:
    if not isinstance(value, list):
        warnings.append(f"{label} 缺失，已用 {default} 兜底")
        return [default] * size
    out = [int(round(_clamp(v, 0, 100, default))) for v in value[:size]]
    if len(out) < size:
        warnings.append(f"{label} 只给了 {len(out)} 项，不足部分已用 {default} 兜底")
        out += [default] * (size - len(out))
    return out


def normalize_evaluation(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """把模型输出收敛成前端可直接展示的结构；不重新评分，只做范围/类型安全。"""
    warnings: list[str] = []
    if not isinstance(raw, dict):
        raise LLMError("模型没有返回 JSON 对象", "换个模型试试，或在补充说明里要求「只输出 JSON」")

    element = raw.get("element")
    if element not in ELEMENT_KEYS:
        warnings.append(f"属性 {element!r} 不在枚举里，已回退 normal")
        element = "normal"
    secondary = raw.get("elementSecondary")
    if secondary not in ELEMENT_KEYS:
        secondary = None
    species = raw.get("species")
    if species not in SPECIES_KEYS:
        warnings.append(f"种族 {species!r} 不在枚举里，已回退 beast")
        species = "beast"
    quality = raw.get("quality")
    if quality not in QUALITY_KEYS:
        score_for_key = int(_clamp(raw.get("qualityScore"), 0, 100, 50))
        quality = "SSR" if score_for_key >= 80 else "SR" if score_for_key >= 60 else "R" if score_for_key >= 40 else "N"
        warnings.append(f"品质档位无效，已按分数归为 {quality}")

    traits_raw = raw.get("traits")
    if not isinstance(traits_raw, list):
        traits_raw = []
    traits = []
    for t in traits_raw[:4]:
        if not isinstance(t, dict):
            continue
        kind = t.get("kind")
        if kind not in {"positive", "negative"}:
            kind = "positive"
        name = _text(t.get("name"), 16)
        if not name:
            continue
        traits.append({
            "key": _text(t.get("key"), 32, f"ai_{len(traits)}"),
            "name": name,
            "kind": kind,
            "desc": _text(t.get("desc"), 80, "模型给出的性格词条"),
            "reason": _text(t.get("reason"), 80, "模型评测"),
        })

    skills_raw = raw.get("skills")
    if not isinstance(skills_raw, list):
        skills_raw = []
    skills: list[dict[str, Any]] = []
    legacy_names = False
    for item in skills_raw[:4]:
        if isinstance(item, str):
            # 兼容「只给技能名」的旧模型输出：其余字段留空，本地绝不代填等级 / 威力
            legacy_names = True
            item = {"name": item}
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 24)
        if not name:
            continue
        skill_element = item.get("element")
        if skill_element not in ELEMENT_KEYS:
            skill_element = element  # 回退到模型给的主属性，不额外评测
        power_raw, unlock_raw = item.get("power"), item.get("unlockLevel")
        skills.append({
            "name": name,
            "element": skill_element,
            "power": None if power_raw is None else int(round(_clamp(power_raw, 0, 100, 50))),
            "unlockLevel": None if unlock_raw is None else int(round(_clamp(unlock_raw, 1, 999, 1))),
            "desc": _text(item.get("desc"), 80),
            "reason": _text(item.get("reason"), 80),
        })
    if legacy_names:
        warnings.append("模型只给了技能名，属性 / 威力 / 解锁等级 / 描述留空（本地不代填）")
    if len(skills) < 4:
        warnings.append(f"技能只给了 {len(skills)} 个，卡面按实际数量展示")

    result = {
        "owner": _text(raw.get("owner"), 64, ""),
        "repo": _text(raw.get("repo"), 96, ""),
        "summary": _text(raw.get("summary"), 200, "模型推测的项目画像"),
        "element": element,
        "elementSecondary": secondary,
        "species": species,
        "quality": quality,
        "qualityScore": int(round(_clamp(raw.get("qualityScore"), 0, 100, 50))),
        "qualityDims": _fix_num_list(raw.get("qualityDims"), 5, 50, warnings, "品质维度分"),
        "engineeringScore": int(round(_clamp(raw.get("engineeringScore"), 0, 100, 50))),
        "level": int(round(_clamp(raw.get("level"), 1, 999, 50))),
        "stats": _fix_num_list(raw.get("stats"), 6, 50, warnings, "六维"),
        "foundation": int(round(_clamp(raw.get("foundation"), 0, 100, 60))),
        "traits": traits,
        "skills": skills,
        "stars": int(round(_clamp(raw.get("stars"), 0, 1_000_000_000, 0))),
        "aiRate": int(round(_clamp(raw.get("aiRate"), 0, 100, 0))),
        "comment": _text(raw.get("comment"), 200, ""),
        "evidence": _text(raw.get("evidence"), 300, ""),
    }
    return result, warnings


def parse_model_json(content: str) -> dict[str, Any]:
    """兼容模型爱包的 ```json 代码块和前后碎碎念。"""
    if not isinstance(content, str) or not content.strip():
        raise LLMError("模型返回了空内容", "换个模型，或在补充说明里强调「只输出 JSON」")
    text = content.strip()
    text = re.sub(r"^```(?:json|JSON)?\s*|\s*```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMError(f"模型返回的不是合法 JSON（{exc.msg}）", "换个支持 JSON 输出的模型，或在补充说明里要求严格 JSON") from None
    if not isinstance(parsed, dict):
        raise LLMError("模型返回的 JSON 不是对象", "检查模型输出格式")
    return parsed


def validate_base_url(base_url: str) -> str:
    url = (base_url or "https://api.openai.com/v1").strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise LLMError("模型接口地址不合法", "填完整的 Base URL，如 https://api.openai.com/v1")
    return url


def _is_local_url(url: str) -> bool:
    """回环 / 内网端点（本地模型）判定。"""
    host = (urlparse(url).hostname or "").lower()
    if not host or host == "localhost" or host.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return bool(ip.is_loopback or ip.is_private or ip.is_link_local)


def _outbound_proxy(url: str) -> str | None:
    """给这次出站请求挑代理：外网端点沿用环境 / 系统代理，本地端点一律直连。

    httpx 的 trust_env 会经 urllib 读 macOS 系统代理注册表，哪怕进程里没有任何
    http_proxy 变量——本地模型的 127.0.0.1 请求也会被劫到代理上：代理转发回环
    时好时坏（开着 502、关了 ConnectError），表现就是「第一次行第二次就不行」。
    """
    if _is_local_url(url):
        return None
    host = urlparse(url).hostname or ""
    try:
        if proxy_bypass(host):
            return None
    except OSError:
        pass
    proxies = getproxies()
    return proxies.get("https") or proxies.get("http") or None


async def http_request(
    method: str,
    url: str,
    *,
    timeout: httpx.Timeout | float,
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    follow_redirects: bool = False,
) -> httpx.Response:
    """发一次 LLM 出站请求：有代理先走代理；代理连不上（如 Clash 关闭）再直连兜底。

    trust_env=False 是关键：不让 httpx 自己再读一遍环境 / 系统代理，
    代理策略完全由 _outbound_proxy 决定（本地直连、外网代理+直连兜底）。
    """
    proxy = _outbound_proxy(url)
    if proxy:
        try:
            async with httpx.AsyncClient(
                timeout=timeout, trust_env=False, proxy=proxy, follow_redirects=follow_redirects,
            ) as client:
                return await client.request(method, url, headers=headers, json=json_body)
        except (httpx.ConnectError, httpx.ConnectTimeout):
            pass  # 代理端口没了或连不上 → 直连重试一次
    async with httpx.AsyncClient(
        timeout=timeout, trust_env=False, follow_redirects=follow_redirects,
    ) as client:
        return await client.request(method, url, headers=headers, json=json_body)


def _fix_payload_for_400(payload: dict, text: str) -> bool:
    """部分新模型（o 系 / gpt-5 等）只收 max_completion_tokens、temperature 只支持默认值 1。

    按 400 报文就地改请求体，返回 True 让调用方重发一次；每修一次都删掉/换掉对应键，
    不会重复触发，最多多试两次；不认识的 400 返回 False 照常报错。
    """
    if "max_completion_tokens" in text and "max_tokens" in payload:
        payload["max_completion_tokens"] = payload.pop("max_tokens")
        return True
    if "temperature" in text and "temperature" in payload:
        payload.pop("temperature")
        return True
    return False


async def chat_completion(
    *, base_url: str, api_key: str, model: str, system: str, user: str,
    timeout: float = 60.0, max_tokens: int = 2200,
) -> str:
    """调一次 OpenAI 兼容 chat/completions；错误统一翻译成可直接展示的中文。"""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "max_tokens": max_tokens,
    }
    while True:
        try:
            resp = await http_request(
                "POST", f"{base_url}/chat/completions",
                timeout=httpx.Timeout(timeout, connect=10.0), headers=headers, json_body=payload,
            )
        except httpx.TimeoutException:
            raise LLMError(f"模型响应超时（{int(timeout)} 秒）", "换更快的模型，或检查网络代理") from None
        except httpx.ConnectError:
            raise LLMError("连不上模型接口", "检查 Base URL、网络代理；本地模型请确认服务已启动") from None
        except httpx.HTTPError:
            raise LLMError("模型接口请求失败", "检查 Base URL 与网络连通性") from None

        if resp.status_code != 400 or not _fix_payload_for_400(payload, resp.text):
            break

    _raise_for_status(resp, base_url=base_url, api_key=api_key)

    try:
        body = resp.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise LLMError("模型返回的结构不是 chat/completions 格式", "确认 Base URL 指向 OpenAI 兼容接口") from None
    if isinstance(content, list):
        content = "".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content)
    return str(content or "")


def _provider_key_mismatch(base_url: str | None, api_key: str | None) -> str | None:
    """服务商与密钥家族的强互斥检测：只对有把握的组合下结论。

    baseUrl（存 localStorage）与 apiKey（存 sessionStorage）各自独立更新，
    拼在一起就可能「OpenRouter 端点 + OpenAI 密钥」这类 401 错配——这里把
    双方身份点破，用户照着改即可。自定义中转站 / 普通 sk- 密钥识别不了，
    返回 None 走通用提示，绝不误伤。
    """
    url = str(base_url or "").lower()
    key = str(api_key or "").strip()
    provider = ""
    if "openrouter.ai" in url:
        provider = "OpenRouter"
    elif "api.openai.com" in url:
        provider = "OpenAI"
    elif "anthropic.com" in url:
        provider = "Anthropic"
    elif "groq.com" in url:
        provider = "Groq"
    family = ""
    if key.startswith("sk-or-"):
        family = "OpenRouter"
    elif key.startswith("sk-ant-"):
        family = "Anthropic"
    elif key.startswith("gsk_"):
        family = "Groq"
    elif key.startswith(("sk-proj-", "sk-pro-", "sk-svcacct-")):
        family = "OpenAI"
    if provider and family and provider != family:
        return (
            f"服务商与密钥不匹配：服务商是 {provider}，但密钥像 {family} 的"
            f"（跨家密钥不通用）——把 Base URL 换回 {family}，或换用 {provider} 的密钥"
        )
    return None


def _raise_for_status(
    resp: httpx.Response, *, base_url: str | None = None, api_key: str | None = None,
) -> None:
    """HTTP 状态码 → 人话错误（绝不回显请求头里的密钥）。"""
    if resp.status_code == 401 or resp.status_code == 403:
        raise LLMError(
            "API Key 无效或没有权限",
            _provider_key_mismatch(base_url, api_key) or "检查密钥，或换个模型服务商",
        )
    if resp.status_code == 404:
        raise LLMError("接口地址或模型名不对", "Base URL 一般要带 /v1；模型名要和服务商一致")
    if resp.status_code == 429:
        raise LLMError("模型侧限流了", "稍后再试，或换一个模型")
    if resp.status_code >= 500:
        raise LLMError(f"模型服务暂时不可用（HTTP {resp.status_code}）", "稍后重试或换服务商")
    if resp.status_code >= 400:
        detail = resp.text.strip()[:200].replace("\n", " ")
        raise LLMError(f"模型接口返回 HTTP {resp.status_code}", detail)


async def ping(*, base_url: str, api_key: str, model: str) -> dict[str, Any]:
    """连接测试：发一次极小的对话请求，验证 Base URL / 密钥 / 模型真的能连通、能出字。

    绑定（/models 探测）只能证明密钥能列出模型；高级模式开启前的门槛是
    chat/completions 这条真正评测要走的链路本身能通。
    """
    url = validate_base_url(base_url)
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    # 同 chat_completion：按 400 报文自动换键 / 删 temperature 后重发
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "temperature": 0,
        "max_tokens": 8,
    }
    started = time.perf_counter()
    while True:
        try:
            resp = await http_request(
                "POST", f"{url}/chat/completions",
                timeout=httpx.Timeout(20.0, connect=8.0), headers=headers, json_body=payload,
            )
        except httpx.TimeoutException:
            raise LLMError("连接测试超时（20 秒）", "检查网络代理，或换一个更快的模型") from None
        except httpx.ConnectError:
            raise LLMError("连不上模型接口", "检查 Base URL、网络代理；本地模型请确认服务已启动") from None
        except httpx.HTTPError:
            raise LLMError("模型接口请求失败", "检查 Base URL 与网络连通性") from None
        if resp.status_code != 400 or not _fix_payload_for_400(payload, resp.text):
            break
    _raise_for_status(resp, base_url=base_url, api_key=api_key)
    # 能拿到 2xx 就算通：有的端点 200 但结构异常，这里不深究，评测时再由 parse 兜底
    return {
        "ok": True,
        "model": model,
        "latencyMs": int((time.perf_counter() - started) * 1000),
    }


async def evaluate_repo(
    *,
    repo: str,
    base_url: str,
    api_key: str,
    model: str,
    hint: str = "",
    platform: str = "github",
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """高级模式主入口：模型给出全部评测，返回 {evaluation, meta}。

    evidence 是前端深度审计流水线真实抓取的事实（languages / commits / CI 等），
    有就注入提示词并声明「优先于模型记忆」；没有则退回纯推测模式。
    """
    url = validate_base_url(base_url)
    hint_line = f"补充说明（用户主动提供的线索，优先采信）：{hint.strip()[:1000]}" if hint.strip() else ""
    evidence_block = ""
    if evidence:
        blob = json.dumps(evidence, ensure_ascii=False)
        if len(blob) > 8000:
            blob = blob[:8000] + "…（证据过长已截断）"
        evidence_block = f"真实审计证据（前端真实抓取的事实，按硬性要求 0 优先采信）：\n{blob}"
    user = USER_TEMPLATE.format(
        repo=repo.strip()[:200],
        platform=platform,
        evidence_block=evidence_block,
        hint_line=hint_line,
    )
    content = await chat_completion(base_url=url, api_key=api_key, model=model, system=SYSTEM_PROMPT, user=user)
    evaluation, warnings = normalize_evaluation(parse_model_json(content))
    return {
        "evaluation": evaluation,
        "meta": {
            "model": model,
            "source": "llm",
            "warnings": warnings,
            "engine": "none",  # 明确告诉前端：本地规则引擎没有参与
        },
    }


BATTLE_SYSTEM_PROMPT = """你是 GitMon「高级竞技场」的裁判兼解说。用户给你两个项目的画像（项目A=我方，项目B=对手），
你要**凭两个项目的水平对比推演一场 1v1 回合制对战**，并最后出具一份审计报告。输出严格 JSON。

硬性要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块、不要解释文字。
2. 对战是「水平对比」的具象化：回合招式要贴着项目的真实差异编，
   如「工程量碾压」「测试覆盖突刺」「文档护盾」「停更失速」「Star 洪流」——
   招式名 2–6 字，正文 text ≤40 字，游戏图鉴式口吻，克制有画面感。
3. 回合数 4–8 条；actor 交替先按速度（项目更新更活跃、体量更大的一方先手），
   后续可被暴击/克制打断节奏。每回合给出双方剩余血量 hpPlayer / hpEnemy（0–100 整数，项目A视角）。
   血量必须单调不增，最后一回合 winner 一方的对手血量必须为 0。
4. 难度系数（若用户消息里给了）只影响措辞倾向与逆风表现，不伪造事实。
5. report.dims 给 4–6 个维度（工程质量、工程量、文档与上手、维护健康、社区认可、技术栈含金量等），
   player/enemy 是 0–100 整数分，winner 按分数高者（相等填 "tie"），note ≤30 字说清为什么。
6. report.evidence 给 2–4 条引用（用画像里的真实字段：stars、等级、品质、六维、summary 等，不编造）。
   report.risks / report.suggestions 各 1–3 条，针对我方项目的短板，可执行、不空泛。
7. verdict ≤50 字，一句话点出胜负关键。
8. 用简体中文写文案。

JSON 字段（全部必填）：
{
  "rounds": [
    {"turn": 1, "actor": "player", "move": "招式名", "text": "解说一句",
     "hpPlayer": 100, "hpEnemy": 84}
  ],
  "winner": "player 或 enemy",
  "report": {
    "verdict": "一句话结论",
    "dims": [{"name": "维度名", "player": 0-100, "enemy": 0-100, "winner": "player/enemy/tie", "note": "≤30字"}],
    "evidence": ["证据一条"], "risks": ["风险一条"], "suggestions": ["建议一条"]
  }
}"""

BATTLE_USER_TEMPLATE = """对战推演开始。
难度：{difficulty}
项目A（我方）：{player}
项目B（对手）：{opponent}
只输出 JSON。"""


def _profile_blob(profile: dict[str, Any], limit: int = 3500) -> str:
    blob = json.dumps(profile, ensure_ascii=False)
    return blob if len(blob) <= limit else blob[:limit] + "…（画像过长已截断）"


def normalize_battle(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """把模型的对局 JSON 收敛成前端可回放的结构；不重算伤害，只做范围/一致性兜底。"""
    warnings: list[str] = []
    if not isinstance(raw, dict):
        raise LLMError("模型没有返回 JSON 对象", "换个模型试试，或在补充说明里要求「只输出 JSON」")

    rounds_raw = raw.get("rounds")
    if not isinstance(rounds_raw, list) or not rounds_raw:
        raise LLMError("模型没有给出回合数据（rounds）", "换个模型，或重试一次")
    rounds: list[dict[str, Any]] = []
    prev_p, prev_e = 100, 100
    for item in rounds_raw[:8]:
        if not isinstance(item, dict):
            continue
        actor = item.get("actor")
        if actor not in {"player", "enemy"}:
            actor = "player" if len(rounds) % 2 == 0 else "enemy"
        hp_p = int(round(_clamp(item.get("hpPlayer"), 0, 100, max(0, prev_p - 15))))
        hp_e = int(round(_clamp(item.get("hpEnemy"), 0, 100, max(0, prev_e - 15))))
        # 血量必须单调不增，倒挂就按上一回血量兜底
        if hp_p > prev_p or hp_e > prev_e:
            warnings.append("模型给出的血量出现回升，已按上一回合钳制")
            hp_p, hp_e = min(hp_p, prev_p), min(hp_e, prev_e)
        rounds.append({
            "turn": len(rounds) + 1,
            "actor": actor,
            "move": _text(item.get("move"), 12, "水平压制"),
            "text": _text(item.get("text"), 80, "双方继续交锋"),
            "hpPlayer": hp_p,
            "hpEnemy": hp_e,
        })
        prev_p, prev_e = hp_p, hp_e
    if not rounds:
        raise LLMError("模型给出的回合数据不可用", "换个模型或重试一次")

    # winner 与末回血量对齐：有一方血量归零就以归零方的对手为准
    last = rounds[-1]
    if last["hpEnemy"] == 0 and last["hpPlayer"] > 0:
        winner = "player"
    elif last["hpPlayer"] == 0 and last["hpEnemy"] > 0:
        winner = "enemy"
    else:
        winner = raw.get("winner") if raw.get("winner") in {"player", "enemy"} else None
        if winner is None:
            warnings.append("终局血量未分出胜负，已按模型给的 winner 兜底")
            winner = "player" if last["hpPlayer"] >= last["hpEnemy"] else "enemy"
        # 兜底时把末回血量补到归零，前端结算依赖这个约定
        if winner == "player":
            last["hpEnemy"] = 0
        else:
            last["hpPlayer"] = 0

    rep = raw.get("report") if isinstance(raw.get("report"), dict) else {}
    dims_raw = rep.get("dims") if isinstance(rep.get("dims"), list) else []
    dims = []
    for d in dims_raw[:6]:
        if not isinstance(d, dict):
            continue
        p = int(round(_clamp(d.get("player"), 0, 100, 50)))
        e = int(round(_clamp(d.get("enemy"), 0, 100, 50)))
        dw = d.get("winner")
        if dw not in {"player", "enemy", "tie"}:
            dw = "tie" if p == e else ("player" if p > e else "enemy")
        dims.append({
            "name": _text(d.get("name"), 16, "维度"),
            "player": p, "enemy": e, "winner": dw,
            "note": _text(d.get("note"), 60, ""),
        })
    def str_list(value: Any, item_limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        return [s for s in (_text(v, item_limit) for v in value[:4]) if s]

    report = {
        "verdict": _text(rep.get("verdict"), 120, "对局已分出胜负"),
        "dims": dims,
        "evidence": str_list(rep.get("evidence"), 120),
        "risks": str_list(rep.get("risks"), 120),
        "suggestions": str_list(rep.get("suggestions"), 120),
    }
    if not dims:
        warnings.append("模型未给出维度对比，报告该节将为空")
    return {"rounds": rounds, "winner": winner, "report": report}, warnings


async def battle_simulation(
    *,
    player: dict[str, Any],
    opponent: dict[str, Any],
    difficulty: str = "normal",
    base_url: str,
    api_key: str,
    model: str,
) -> dict[str, Any]:
    """高级竞技场：模型对比两个项目水平，推演回合制对战 + 出审计报告。"""
    url = validate_base_url(base_url)
    diff = difficulty if difficulty in {"easy", "normal", "hard"} else "normal"
    diff_label = {"easy": "新手（我方占优）", "normal": "相当", "hard": "强敌（对手占优）"}[diff]
    user = BATTLE_USER_TEMPLATE.format(
        difficulty=diff_label,
        player=_profile_blob(player),
        opponent=_profile_blob(opponent),
    )
    content = await chat_completion(
        base_url=url, api_key=api_key, model=model,
        system=BATTLE_SYSTEM_PROMPT, user=user, timeout=90.0, max_tokens=4000,
    )
    battle, warnings = normalize_battle(parse_model_json(content))
    return {
        "battle": battle,
        "meta": {"model": model, "source": "llm", "warnings": warnings, "engine": "none"},
    }
