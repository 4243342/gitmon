"""仓库文件树分析：不克隆代码，只用树里的路径与体积做结构判定。

这样单次扫描不需要下载仓库，几百 KB 的 JSON 就能得出语言占比、测试规模、
工程规范文件和文档完备度——代价是 LOC 为估算值（按语言的平均行长折算）。
"""

from __future__ import annotations

import posixpath
import re
from typing import Any, Iterable

from .languages import (
    CODE_LANGS,
    DOC_LANGS,
    EXT_LANG,
    GENERATED_NAMES,
    GENERATED_SUFFIXES,
    IGNORED_DIR_PARTS,
    MANIFEST_NAMES,
    MAX_MANIFESTS,
)

_TEST_PATH_RE = re.compile(
    r"(^|/)(tests?|__tests__|spec|specs|e2e|testing|testdata|test_data)(/|$)"
    r"|(^|/)(test_[^/]+\.py|[^/]+_test\.py|[^/]+_test\.go|[^/]+_spec\.rb|[^/]+\.(test|spec)\.[jt]sx?)"
    r"|(^|/)[A-Z][^/]*Tests?\.(java|kt|cs|swift|php)$",
    re.IGNORECASE,
)

_CI_FILES = (
    ".gitlab-ci.yml", ".travis.yml", "appveyor.yml", "azure-pipelines.yml",
    "bitbucket-pipelines.yml", "Jenkinsfile", "cloudbuild.yaml", ".drone.yml",
)
_LINT_FILES = (
    ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js",
    "eslint.config.mjs", ".prettierrc", ".prettierrc.json", "prettier.config.js",
    ".flake8", ".pylintrc", "ruff.toml", ".ruff.toml", "mypy.ini", ".isort.cfg",
    "rustfmt.toml", ".rustfmt.toml", ".clang-format", ".clang-tidy", ".golangci.yml",
    ".editorconfig", "biome.json", ".stylelintrc", "phpcs.xml",
)
_TYPE_FILES = ("tsconfig.json", "mypy.ini", "py.typed", "flow-typed", ".pyi")

# 平均每行字节数（估算 LOC 用）
_BYTES_PER_LINE = {
    "Python": 34, "JavaScript": 36, "TypeScript": 38, "Rust": 36, "Go": 34,
    "Java": 38, "Kotlin": 38, "C": 30, "C++": 34, "C#": 38, "PHP": 36,
    "Ruby": 32, "Swift": 38, "Dart": 36, "Shell": 34, "Vue": 36, "Svelte": 36,
    "HTML": 40, "CSS": 32, "Lua": 32, "Scala": 38, "Elixir": 34,
}
_CODE_RATIO = 0.78  # 扣掉注释与空行的粗略系数


def _ignored(path: str) -> bool:
    parts = path.lower().split("/")
    if any(part in IGNORED_DIR_PARTS for part in parts[:-1]):
        return True
    name = parts[-1]
    if name in GENERATED_NAMES or name.endswith(GENERATED_SUFFIXES):
        return True
    return False


def _is_test(path: str) -> bool:
    return bool(_TEST_PATH_RE.search(path))


def _lang_of(path: str) -> str | None:
    ext = posixpath.splitext(path)[1].lower()
    return EXT_LANG.get(ext)


def analyze_tree(entries: Iterable[dict[str, Any]], max_entries: int = 20000) -> dict[str, Any]:
    """把 tree 条目汇总成判定所需的结构信号。"""
    blobs: list[tuple[str, int]] = []
    for entry in entries:
        if entry.get("type") != "blob":
            continue
        path = (entry.get("path") or "").lstrip("./")
        if not path or _ignored(path):
            continue
        try:
            size = int(entry.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        blobs.append((path, max(size, 0)))
        if len(blobs) >= max_entries:
            break

    lang_bytes: dict[str, int] = {}
    lang_files: dict[str, int] = {}
    test_files = 0
    doc_files = 0
    code_files = 0
    code_bytes = 0
    notebooks = 0
    total_md_bytes = 0
    ci_files: list[str] = []
    lint_files: list[str] = []
    type_files: list[str] = []
    manifests: list[dict[str, str]] = []
    flags = {
        "has_license": False,
        "has_changelog": False,
        "has_contributing": False,
        "has_docs_dir": False,
        "has_workflows": False,
        "has_readme": False,
        "has_dockerfile": False,
        "has_tests_dir": False,
        "has_android": False,
        "has_ios": False,
        "has_notebooks": False,
        "has_shaders": False,
    }
    readme_path = ""
    largest: list[tuple[str, int]] = []

    for path, size in blobs:
        name = posixpath.basename(path)
        lower = name.lower()
        lang = _lang_of(path)

        if lower.startswith("readme"):
            flags["has_readme"] = True
            if not readme_path:
                readme_path = path
        if lower.startswith("license") or lower.startswith("licence") or lower.startswith("copying"):
            flags["has_license"] = True
        if lower.startswith("changelog") or lower.startswith("changes") or lower.startswith("history"):
            flags["has_changelog"] = True
        if lower.startswith("contributing"):
            flags["has_contributing"] = True
        if lower.startswith("dockerfile") or lower == "docker-compose.yml":
            flags["has_dockerfile"] = True

        if path.startswith((".github/workflows/", ".gitee/workflows/", ".circleci/")):
            ci_files.append(path)
            flags["has_workflows"] = True
        elif name in _CI_FILES:
            ci_files.append(path)
        if name in _LINT_FILES:
            lint_files.append(path)
        if name in _TYPE_FILES or lower.endswith(".pyi"):
            type_files.append(path)
        if name in MANIFEST_NAMES and len(manifests) < MAX_MANIFESTS:
            manifests.append({"path": path, "kind": MANIFEST_NAMES[name]})
        if lower.startswith("docs/") or "/docs/" in path:
            flags["has_docs_dir"] = True
        if lower.startswith(("android/", "app/src/main/androidmanifest.xml")) or "/android/" in path:
            flags["has_android"] = True
        if "xcodeproj" in path or lower.startswith("ios/") or lower.endswith("appdelegate.swift"):
            flags["has_ios"] = True
        if _is_test(path):
            test_files += 1
            dirs = {part.lower() for part in path.split("/")[:-1][:3]}
            if dirs & {"test", "tests", "spec", "specs", "__tests__", "e2e", "testing"}:
                flags["has_tests_dir"] = True

        if lang:
            weight = size or 2048
            lang_bytes[lang] = lang_bytes.get(lang, 0) + weight
            lang_files[lang] = lang_files.get(lang, 0) + 1
            if lang in DOC_LANGS:
                doc_files += 1
                total_md_bytes += size
            elif lang in CODE_LANGS:
                code_files += 1
                code_bytes += size
                largest.append((path, size))
            if lang == "Jupyter Notebook":
                notebooks += 1
            if lang in {"GLSL", "HLSL", "WGSL", "Metal", "ShaderLab"}:
                flags["has_shaders"] = True

    flags["has_notebooks"] = notebooks > 0
    # 语言占比只统计代码语言
    code_lang_bytes = {k: v for k, v in lang_bytes.items() if k in CODE_LANGS}
    total_code_weight = sum(code_lang_bytes.values()) or 1
    share = {k: round(v / total_code_weight, 4) for k, v in
             sorted(code_lang_bytes.items(), key=lambda kv: kv[1], reverse=True)}
    primary = next(iter(share), "")

    loc = 0
    for lang, size in code_lang_bytes.items():
        loc += int(size / _BYTES_PER_LINE.get(lang, 35) * _CODE_RATIO)

    largest.sort(key=lambda item: item[1], reverse=True)
    code_ratio = code_files / max(1, len(blobs))
    md_ratio = doc_files / max(1, code_files + doc_files)

    return {
        "total_files": len(blobs),
        "code_files": code_files,
        "test_files": test_files,
        "doc_files": doc_files,
        "notebooks": notebooks,
        "code_bytes": code_bytes,
        "total_bytes": sum(size for _, size in blobs),
        "loc": loc,
        "lang_share": share,
        "primary_language": primary,
        "language_count": len([k for k, v in share.items() if v >= 0.02]),
        "avg_file_bytes": int(code_bytes / code_files) if code_files else 0,
        "largest_files": [{"path": p, "size": s} for p, s in largest[:5]],
        "ci_files": ci_files[:8],
        "lint_files": lint_files[:8],
        "type_files": type_files[:8],
        "manifests": manifests,
        "readme_path": readme_path,
        "docs_md_bytes": total_md_bytes,
        "code_ratio": round(code_ratio, 3),
        "md_ratio": round(md_ratio, 3),
        "flags": flags,
    }
