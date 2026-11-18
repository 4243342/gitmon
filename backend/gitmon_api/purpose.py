"""Classify the repository's primary purpose from independently collected evidence."""

from __future__ import annotations

import json
import re
from typing import Any


ELEMENTS = {
    "purpose_earth": {"key": "purpose_earth", "name": "地", "color": "#a67c52", "trait": "硬件与系统基础"},
    "purpose_fire": {"key": "purpose_fire", "name": "炎", "color": "#f06d47", "trait": "软件工程与运维"},
    "purpose_water": {"key": "purpose_water", "name": "水", "color": "#4a9eff", "trait": "数据与智能"},
    "purpose_light": {"key": "purpose_light", "name": "光", "color": "#e6b746", "trait": "内容与业务体验"},
    "purpose_wind": {"key": "purpose_wind", "name": "风", "color": "#54b88f", "trait": "通信与连接"},
    "purpose_dark": {"key": "purpose_dark", "name": "暗", "color": "#8c69b8", "trait": "安全与隐私"},
}
PENDING = {"key": "purpose_pending", "name": "待识别", "color": "#9e9e9e", "trait": "主用途尚待确认"}


def _pattern(*terms: str) -> re.Pattern[str]:
    return re.compile(r"(?<![a-z0-9])(?:" + "|".join(terms) + r")(?![a-z0-9])", re.I)


# Match capabilities, rather than generic implementation words such as API, web or AI.
_CAPABILITIES = {
    "purpose_earth": _pattern(
        r"(?:linux |os |operating system )?kernel (?:source|image|build)",
        r"linux kernel", r"operating system(?: kernel)?", r"device drivers?", r"bootloaders?",
        r"firmware (?:image|for|development)", r"firmware", r"digital (?:logic|circuit)",
        r"hardware (?:description|design|synthesis)", r"fpga (?:design|bitstream|logic)",
        r"电路设计", r"操作系统内核", r"设备驱动", r"固件", r"数字电路",
    ),
    "purpose_fire": _pattern(
        r"(?:systems? and service|service|system|application|infrastructure) monitoring",
        r"(?:scrape|collect) (?:service )?metrics", r"alerting rules?", r"observability (?:platform|stack)",
        r"build (?:tools?|systems?|automation)", r"continuous (?:integration|delivery)", r"ci cd",
        r"(?:code|typescript|javascript|native) compiler", r"(?:build|compile) (?:source code|applications)",
        r"deployment (?:automation|tools?|platforms?)", r"container orchestration", r"deploy applications",
        r"服务监控", r"指标采集", r"告警规则", r"自动化部署", r"构建工具", r"容器编排", r"编译器",
    ),
    "purpose_water": _pattern(
        r"(?:time series|vector|relational|in memory|analytical) database", r"database engine",
        r"(?:sql|vector) quer(?:y|ies)", r"search engine", r"data (?:warehouse|integration|analysis)",
        r"data (?:processing|transformation) pipeline", r"machine learning", r"(?:model|llm) inference",
        r"(?:run|running|train|training) (?:large language |local |ai )?models?", r"run a model",
        r"inference (?:engine|server)", r"inference endpoint",
        r"数据库", r"数据分析", r"数据处理", r"模型推理", r"模型训练", r"搜索引擎",
    ),
    "purpose_light": _pattern(
        r"content (?:management|publishing)", r"publishing (?:platform|website)", r"modern publishing",
        r"blogging platform", r"(?:manage|publish) (?:articles|content|newsletters)", r"memberships and subscriptions",
        r"e ?commerce", r"shopping cart", r"checkout workflow", r"(?:create|edit|draw) (?:documents|images|illustrations)",
        r"(?:photo|image|video|audio) editor", r"(?:game|design) editor", r"video game",
        r"内容发布", r"文章管理", r"知识库", r"订阅平台", r"购物车", r"电商", r"图像编辑", r"视频编辑",
    ),
    "purpose_wind": _pattern(
        r"(?:computer |kubernetes |container )?networking", r"network connectivity", r"(?:kubernetes )?cni(?: plugin)?",
        r"(?:message|messaging) (?:broker|server|system|queue|bus)", r"publish subscribe", r"pubsub",
        r"message delivery", r"(?:reverse|network|http|tcp) proxy", r"(?:network|traffic|packet) routing",
        r"(?:network|chat|messaging) protocol", r"(?:chat|messaging|voice chat) (?:app|client|platform)",
        r"负载均衡", r"网络路由", r"网络代理", r"消息队列", r"消息传递", r"发布订阅", r"通信协议", r"即时通讯",
    ),
    "purpose_dark": _pattern(
        r"identity and access management", r"(?:identity|access) management", r"single sign on",
        r"(?:identity|oauth2?) provider", r"(?:fine grained |role based )access control",
        r"(?:strong|multi factor|passwordless) authentication", r"(?:secret|secrets|key|credential) management",
        r"(?:manage|encrypt|protect) (?:keys|secrets|credentials)", r"cryptographic library",
        r"(?:vulnerability|secret|security) scanners?", r"(?:security|privacy) auditing",
        r"身份认证", r"统一认证", r"权限管理", r"单点登录", r"密钥管理", r"凭据管理", r"漏洞扫描", r"隐私保护",
    ),
}

_CORE_PATHS = {
    "purpose_earth": _pattern(r"arch/(?:arm|arm64|riscv|x86|mips)", r"drivers/(?:usb|gpu|gpio|pci)",
                              r"kernel/(?:sched|irq|time)", r"rtl(?=/)", r"device tree", r"bootloader"),
    "purpose_fire": _pattern(r"(?:metrics/)?scrape", r"(?:deployment|build) operator", r"alerting", r"compiler",
                             r"(?:alert |metric )rule manager", r"(?:alert |metric )notifier"),
    "purpose_water": _pattern(r"tsdb", r"query planner", r"query engine", r"vector index", r"promql",
                              r"model runner", r"inference", r"tokenizer", r"model loading"),
    "purpose_light": _pattern(r"newsletter", r"content api", r"shopping cart", r"checkout", r"post editor",
                              r"content editor", r"game engine"),
    "purpose_wind": _pattern(r"datapath", r"cni", r"pubsub", r"(?:message|packet) router", r"jetstream",
                             r"load balancer", r"networking", r"reverse proxy"),
    "purpose_dark": _pattern(r"authz", r"webauthn", r"openid connect", r"oauth2", r"saml", r"keyring",
                             r"key management", r"cryptography", r"vulnerability scanner", r"secret store"),
}

_USER_HEADINGS = _pattern(
    r"overview", r"introduction", r"what is", r"getting started", r"quick ?start", r"usage", r"use cases?",
    r"basic examples?", r"用法", r"使用", r"入门", r"简介", r"快速开始",
)
_QUICKSTART = _pattern(r"getting started", r"quick ?start", r"usage", r"用法", r"使用", r"入门", r"快速开始")
_IGNORED_SOURCE = re.compile(
    r"(?:^|/)(?:docs?|examples?|samples?|tests?|testdata|fixtures?|vendor|third_party|"
    r"node_modules|dist|generated|\.github)(?:/|$)", re.I,
)
_HDL_LANGUAGES = {"verilog", "systemverilog", "vhdl"}
_HDL_MODULE = re.compile(r"(?im)^\s*(?:module|entity)\s+\w+")


def _normalize(text: str) -> str:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return " ".join(re.sub(r"[_-]", " ", text).lower().split())


def _matches(text: str, patterns: dict[str, re.Pattern[str]] = _CAPABILITIES) -> set[str]:
    normalized = _normalize(text)
    return {key for key, pattern in patterns.items() if pattern.search(normalized)}


def _readme_sections(readme: str) -> tuple[set[str], set[str]]:
    sections = re.split(r"(?m)^#{1,6}\s+(.+?)\s*$", readme)
    declared = _matches(sections[0])
    workflow: set[str] = set()
    for index in range(1, len(sections), 2):
        heading, body = sections[index:index + 2]
        # The first heading is commonly the project title. Subsequent sections must
        # describe user workflows to carry weight, rather than optional features.
        if index == 1 or _USER_HEADINGS.search(_normalize(heading)):
            hits = _matches(f"{heading}\n{body}")
            declared.update(hits)
            if _QUICKSTART.search(_normalize(heading)):
                workflow.update(hits)
    return declared, workflow


def _artifact_text(path: str, content: str) -> str:
    name = path.rsplit("/", 1)[-1].lower()
    if name == "package.json":
        try:
            manifest = json.loads(content)
        except (ValueError, RecursionError):
            return ""
        if not isinstance(manifest, dict) or manifest.get("private") is True:
            return ""
        entries = (manifest.get(field) for field in ("name", "bin", "main", "exports"))
        return " ".join(str(entry) for entry in entries if entry)
    if name in {"go.mod", "go.sum", "cargo.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"}:
        return ""
    if name in {"cargo.toml", "pyproject.toml", "pom.xml"}:
        # Descriptions and dependency tables do not ship a capability themselves.
        lines = re.split(r"(?m)^\[", content) if name != "pom.xml" else [content.split("<dependencies", 1)[0]]
        content = "\n".join(section for section in lines if "dependencies" not in section.split("\n", 1)[0])
        content = re.sub(r"(?mi)^\s*description\s*=.*$|<description>.*?</description>", "", content)
    return f"{path}\n{content}"


def _artifact_matches(artifacts: dict[str, str], readme: str) -> set[str]:
    matches: set[str] = set()
    for path, content in artifacts.items():
        # A copied description in release notes is still the same evidence.
        delivery = _artifact_text(path, content)
        independent = (line for line in delivery.splitlines() if _normalize(line) not in readme)
        matches.update(_matches("\n".join(independent)))
    return matches


def _source_matches(sources: dict[str, str], language: str) -> set[str]:
    matches: set[str] = set()
    for path, content in sources.items():
        if _IGNORED_SOURCE.search(path) or path.lower().endswith(("_test.go", "_test.py", ".test.ts", ".md")):
            continue
        matches.update(_matches(path, _CORE_PATHS))
        lines = (line for line in content.splitlines() if not line.lstrip().startswith(("//", "#", "/*", "*")))
        matches.update(_matches("\n".join(lines)))
        if (language.lower() in _HDL_LANGUAGES and path.lower().endswith((".v", ".sv", ".vhd", ".vhdl"))
                and _HDL_MODULE.search(content)):
            matches.add("purpose_earth")
        if path.lower().endswith(".scala") and "import chisel3" in content and "extends Module" in content:
            matches.add("purpose_earth")
    return matches


def classify(evidence: dict[str, Any]) -> str | None:
    """Return one well-supported purpose, or None for agent review."""
    readme = evidence.get("readme") or ""
    declared, workflow = _readme_sections(readme)
    artifacts = _artifact_matches(evidence.get("artifacts") or {}, _normalize(readme))
    sources = _source_matches(evidence.get("sources") or {}, evidence.get("language") or "")
    scores = []
    for key in ELEMENTS:
        families = (key in declared, key in artifacts, key in sources)
        if sum(families) < 2:
            continue
        score = 3 * families[0] + 4 * families[1] + 4 * families[2]
        if workflow == {key}:
            score += 2
        scores.append((score, key))
    scores.sort(reverse=True)
    if not scores or (len(scores) > 1 and scores[0][0] - scores[1][0] < 2):
        return None
    return scores[0][1]
