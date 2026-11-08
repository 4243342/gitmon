"""依赖清单解析：只提取依赖名，用于判定精灵的生态类型。

这里刻意不引第三方解析器：格式五花八门，正则取名字足够做"是什么项目"的判断。
"""

from __future__ import annotations

import json
import re

_NAME_SPLIT = re.compile(r"[\s\"'=<>!~^@;\[\]\(\),:]+")


def _clean(name: str) -> str:
    name = name.strip().strip("\"'").strip()
    name = name.split("[")[0].strip()
    return name.lower()


def _parse_npm(text: str) -> list[str]:
    try:
        data = json.loads(text)
    except ValueError:
        return []
    tokens: list[str] = []
    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = data.get(section)
        if isinstance(block, dict):
            tokens.extend(_clean(str(key)) for key in block)
    if data.get("bin"):
        tokens.append("__bin__")
    scripts = data.get("scripts") or {}
    if isinstance(scripts, dict) and any("cli" in str(k).lower() for k in scripts):
        tokens.append("__bin__")
    return [t for t in tokens if t]


def _parse_python(text: str, kind: str) -> list[str]:
    tokens: list[str] = []
    if kind == "requirements":
        for line in text.splitlines():
            line = line.split("#")[0].strip()
            if line and not line.startswith("-"):
                tokens.append(_clean(line))
        return tokens

    # pyproject / setup.py：抓依赖数组与 poetry 段落
    for block in re.findall(r"dependencies\s*=\s*\[(.*?)\]", text, re.S):
        tokens.extend(_clean(item.strip()) for item in re.findall(r"[\"']([^\"']+)[\"']", block))
    poetry = re.search(r"\[tool\.poetry\.dependencies\](.*?)(?=\n\[|\Z)", text, re.S)
    if poetry:
        for line in poetry.group(1).splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("python "):
                continue
            tokens.append(_clean(line.split("=")[0]))
    for block in re.findall(r"install_requires\s*=\s*\[(.*?)\]", text, re.S):
        tokens.extend(_clean(item.strip()) for item in re.findall(r"[\"']([^\"']+)[\"']", block))
    for block in re.findall(r"extras_require\s*=\s*\{(.*?)\}", text, re.S):
        tokens.extend(_clean(item.strip()) for item in re.findall(r"[\"']([^\"']+)[\"']", block))
    return [t for t in tokens if t]


def _parse_cargo(text: str) -> list[str]:
    tokens: list[str] = []
    section = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("["):
            section = stripped.strip("[]").lower()
            continue
        if section.endswith("dependencies") or section.endswith("dependencies.optional"):
            if "=" in stripped and not stripped.startswith("#"):
                tokens.append(_clean(stripped.split("=")[0]))
    return [t for t in tokens if t]


def _parse_gomod(text: str) -> list[str]:
    tokens: list[str] = []
    in_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("require ("):
            in_block = True
            continue
        if in_block and stripped == ")":
            in_block = False
            continue
        if stripped.startswith("require "):
            stripped = stripped[len("require "):]
        elif not in_block:
            continue
        if "//" in stripped:
            stripped = stripped.split("//")[0]
        parts = stripped.split()
        if parts:
            tokens.append(_clean(parts[0]))
    return [t for t in tokens if t]


def _parse_markup(text: str) -> list[str]:
    tokens = [m.lower() for m in re.findall(r"<artifactId>([^<]+)</artifactId>", text, re.I)]
    for _, artifact in re.findall(r"(?:implementation|api|compile)\s*[(\s][\"']([^:\"']+):([^:\"']+)", text, re.I):
        tokens.append(artifact.lower())
    return tokens


def _parse_gemfile(text: str) -> list[str]:
    return [_clean(m) for m in re.findall(r"^\s*gem\s+[\"']([^\"']+)[\"']", text, re.M)]


def _parse_composer(text: str) -> list[str]:
    try:
        data = json.loads(text)
    except ValueError:
        return []
    tokens: list[str] = []
    for section in ("require", "require-dev"):
        block = data.get(section)
        if isinstance(block, dict):
            tokens.extend(_clean(key.split("/")[-1]) for key in block)
    if data.get("bin"):
        tokens.append("__bin__")
    return [t for t in tokens if t]


def _parse_pubspec(text: str) -> list[str]:
    tokens: list[str] = []
    in_deps = False
    for line in text.splitlines():
        if re.match(r"^\w", line):
            in_deps = line.startswith(("dependencies:", "dev_dependencies:"))
            continue
        if in_deps and re.match(r"^\s{2}\w", line):
            tokens.append(_clean(line.strip().split(":")[0]))
    return [t for t in tokens if t]


def _parse_cmake(text: str) -> list[str]:
    return [_clean(m) for m in re.findall(r"find_package\s*\(\s*([A-Za-z0-9_+-]+)", text, re.I)]


def parse_manifest(kind: str, path: str, text: str) -> list[str]:
    name = path.rsplit("/", 1)[-1].lower()
    try:
        if kind == "npm" or name == "package.json":
            return _parse_npm(text)
        if kind == "python":
            if name.startswith("requirements"):
                return _parse_python(text, "requirements")
            return _parse_python(text, "pyproject")
        if kind == "cargo":
            return _parse_cargo(text)
        if kind == "gomod":
            return _parse_gomod(text)
        if kind in {"maven", "gradle"}:
            return _parse_markup(text)
        if kind == "bundler":
            return _parse_gemfile(text)
        if kind == "composer":
            return _parse_composer(text)
        if kind == "pub":
            return _parse_pubspec(text)
        if kind == "cmake":
            return _parse_cmake(text)
    except Exception:  # 清单格式千奇百怪，解析失败不该阻断扫描
        return []
    return []


def normalize_dependencies(tokens: list[str]) -> list[str]:
    out: list[str] = []
    for token in tokens:
        cleaned = token.strip().lower()
        if not cleaned:
            continue
        # 去掉作用域前缀 @vue/cli → vue/cli 保留，仅对 github scope 做简化
        cleaned = cleaned.split("==")[0].split(">=")[0].split("<")[0].split(">")[0]
        if cleaned not in out:
            out.append(cleaned)
    return out
