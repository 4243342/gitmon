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

import json
import re
from typing import Any
from urllib.parse import urlparse

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


async def chat_completion(*, base_url: str, api_key: str, model: str, system: str, user: str) -> str:
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
        "max_tokens": 2200,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
    except httpx.TimeoutException:
        raise LLMError("模型响应超时（60 秒）", "换更快的模型，或检查网络代理") from None
    except httpx.ConnectError:
        raise LLMError("连不上模型接口", "检查 Base URL、网络代理；本地模型请确认服务已启动") from None
    except httpx.HTTPError:
        raise LLMError("模型接口请求失败", "检查 Base URL 与网络连通性") from None

    if resp.status_code == 401 or resp.status_code == 403:
        raise LLMError("API Key 无效或没有权限", "检查密钥，或换个模型服务商")
    if resp.status_code == 404:
        raise LLMError("接口地址或模型名不对", "Base URL 一般要带 /v1；模型名要和服务商一致")
    if resp.status_code == 429:
        raise LLMError("模型侧限流了", "稍后再试，或换一个模型")
    if resp.status_code >= 500:
        raise LLMError(f"模型服务暂时不可用（HTTP {resp.status_code}）", "稍后重试或换服务商")
    if resp.status_code >= 400:
        # 只截取响应体，绝不回显请求头里的密钥
        detail = resp.text.strip()[:200].replace("\n", " ")
        raise LLMError(f"模型接口返回 HTTP {resp.status_code}", detail)

    try:
        body = resp.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise LLMError("模型返回的结构不是 chat/completions 格式", "确认 Base URL 指向 OpenAI 兼容接口") from None
    if isinstance(content, list):
        content = "".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content)
    return str(content or "")


async def evaluate_repo(*, repo: str, base_url: str, api_key: str, model: str, hint: str = "", platform: str = "github") -> dict[str, Any]:
    """高级模式主入口：模型给出全部评测，返回 {evaluation, meta}。"""
    url = validate_base_url(base_url)
    hint_line = f"补充说明（用户主动提供的线索，优先采信）：{hint.strip()[:1000]}" if hint.strip() else ""
    user = USER_TEMPLATE.format(repo=repo.strip()[:200], platform=platform, hint_line=hint_line)
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
