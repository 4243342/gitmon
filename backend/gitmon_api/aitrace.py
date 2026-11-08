"""离线 AI 味检测（aitrace）—— 不联网、不调模型、纯规则。

它只回答一个问题：**这批代码里有多少比例看起来像"AI 辅助/生成"的产物**，
用来给 GitMon 的「根基」提供一个真实性信号（设计文档 §12）。

三条硬约束：

1. **零网络**：只读本地文件，不上传任何代码片段；
2. **可解释**：每一分都来自具体规则与具体行号，能复核、能反驳；
3. **给区间不给判决**：输出 0–100 分 + 置信度 + 证据，不输出"你作弊了"。

用法::

    python -m gitmon_api.aitrace /path/to/repo
    python -m gitmon_api.aitrace /path/to/repo --json --evidence
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

# 这个工具要能脱离后端依赖独立运行（拷到任何机器上都能用），所以自带一份
# 最小语言/忽略表，而不是 import scanner（那个包会拉起 httpx）。
# tests/test_aitrace.py 里有一条一致性测试，防止两边漂移。
CODE_EXT: dict[str, str] = {
    ".py": "Python", ".pyi": "Python", ".pyx": "Python",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
    ".vue": "Vue", ".svelte": "Svelte",
    ".rs": "Rust", ".go": "Go",
    ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".groovy": "Groovy",
    ".c": "C", ".h": "C", ".cc": "C++", ".cpp": "C++", ".hpp": "C++",
    ".swift": "Swift", ".dart": "Dart",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#",
    ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell", ".ps1": "PowerShell",
    ".lua": "Lua", ".ex": "Elixir", ".exs": "Elixir", ".sol": "Solidity", ".zig": "Zig",
    ".glsl": "GLSL", ".hlsl": "HLSL", ".wgsl": "WGSL", ".metal": "Metal",
    ".md": "Markdown", ".markdown": "Markdown", ".rst": "reST", ".adoc": "AsciiDoc", ".tex": "TeX",
}
DOC_LANGS = {"Markdown", "reST", "AsciiDoc", "TeX"}
CODE_LANGS = set(CODE_EXT.values()) - DOC_LANGS
EXT_LANG = CODE_EXT
IGNORED_DIR_PARTS = {
    "node_modules", "bower_components", "vendor", "third_party", "third-party", "extern",
    "dist", "build", "out", "target", "bin", "obj", "release", "coverage", ".next", ".nuxt",
    ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "site-packages", "Pods", ".tox", ".gradle", ".idea", ".vs", "deps", "_build",
    "assets/vendor", "public/vendor",
}
GENERATED_SUFFIXES = (".min.js", ".min.css", ".map", ".lock", ".snap", ".pb.go", "_pb2.py", ".generated.ts")
GENERATED_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock",
    "go.sum", "composer.lock", "Gemfile.lock", "Pipfile.lock", "uv.lock", "bun.lockb",
}
# ---------------------------------------------------------------- 参数

MAX_FILES = 4000
MAX_FILE_BYTES = 400_000
MAX_EVIDENCE = 12
MAX_TOP_FILES = 5

# 五类信号权重（设计文档 §12.3）
WEIGHTS = {
    "lexical": 0.28,
    "structural": 0.22,
    "naming": 0.14,
    "artifact": 0.26,
    "process": 0.10,
}

BANDS: list[tuple[int, str, str]] = [
    (0, "human", "基本人工"),
    (15, "assisted", "轻度辅助"),
    (35, "mixed", "大量辅助"),
    (60, "generated", "以生成稿为主"),
    (80, "ai-first", "几乎全生成"),
]

# 措辞信号：LLM 的行文口头禅。中文权重略低——中文技术注释本来就爱用这些词。
LEXICAL_PATTERNS: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"\b(Certainly|Sure,|Sure!|Here'?s|Here is|Let'?s|Now let'?s)\b", re.I), 1.0, "英语引导语"),
    (re.compile(r"\b(Note that|It'?s worth noting|Keep in mind|Remember that|Important:)\b", re.I), 1.0, "解释性口头禅"),
    (re.compile(r"\b(comprehensive|robust|seamless|powerful|versatile|elegant|straightforward)\b", re.I), 0.8, "营销形容词"),
    (re.compile(r"\b(leverage|delve|utilize|facilitate|ensure that|in order to)\b", re.I), 0.6, "LLM 高频动词"),
    (re.compile(r"(综上所述|总而言之|总的来说|需要注意的是|值得注意的是|需要注意的是|首先[，,]|其次[，,]|以下是一个|让我们|希望(这|以上)|如有(任何)?(疑问|问题))"), 0.8, "中文行文套路"),
]

# 生成痕迹：比措辞更硬的证据
ARTIFACT_PATTERNS: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"co-authored-by:.*(copilot|claude|cursor|chatgpt|codeium|windsurf|devin|aider)", re.I), 3.0, "AI 协作署名"),
    (re.compile(r"(generated (by|with)|auto-?generated|this (file|code) (is|was) generated)", re.I), 2.0, "生成声明"),
    (re.compile(r"\b(TODO:?\s*(implement|add|fill)|FIXME:?\s*(implement|add))\b", re.I), 1.0, "占位实现"),
    (re.compile(r"except\s+Exception\s*:\s*(pass|\.\.\.)"), 1.0, "吞异常"),
    (re.compile(r"catch\s*\([^)]*\)\s*\{\s*\}"), 1.0, "空 catch"),
    (re.compile(r"\bassert\s+True\b|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)"), 2.0, "伪测试"),
    (re.compile(r"(example usage|usage example|示例用法|使用示例|示例代码)", re.I), 1.0, "示例块"),
    (re.compile(r"[✅🚀✨📌🔥💡⚠️🎯]"), 0.8, "emoji 装饰"),
]

# 占位/骨架：LLM 先铺结构再填肉，占位符密度往往偏高
PLACEHOLDER_PATTERNS: list[tuple[re.Pattern[str], float, str]] = [
    (re.compile(r"\b(TODO|FIXME|XXX|HACK)\b"), 1.0, "TODO 标记"),
    (re.compile(r"\b(pass|\.\.\.)\s*(#.*)?$"), 0.4, "空实现"),
    (re.compile(r"(你的代码|此处填写|待实现|待补充|placeholder)", re.I), 1.2, "中文占位"),
]

MAIN_BLOCK_RE = re.compile(r"^\s*if __name__\s*==\s*['\"]__main__['\"]\s*:", re.M)
DOCSTRING_RE = re.compile(r'^\s*("""|\'\'\')', re.M)
FUNC_RE = re.compile(r"^\s*(?:async\s+)?(?:def|function|func|fn|fun)\s+\w+|^\s*\w[\w<>\[\], ]*\s+\w+\s*\([^;]*\)\s*\{\s*$", re.M)
GENERIC_NAMES = {
    "data", "result", "results", "temp", "tmp", "value", "values", "item", "items",
    "obj", "res", "ret", "foo", "bar", "baz", "example", "helper", "utils",
}
IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")

COMMENT_PREFIXES = ("#", "//", "/*", "*", "--", ";", "<!--", "%")
CODE_EXTRA_LANGS = CODE_LANGS | {"Jupyter Notebook"}


@dataclass
class FileSignals:
    """单文件信号。字段全部是计数/比率，便于复核。"""

    path: str
    lang: str
    lines: int = 0
    code_lines: int = 0
    comment_lines: int = 0
    blank_lines: int = 0
    identifiers: int = 0
    generic_names: int = 0
    long_names: int = 0
    functions: int = 0
    module_doc: bool = False
    lexical: float = 0.0
    artifact: float = 0.0
    placeholder: float = 0.0
    has_main_block: bool = False
    has_ai_signature: bool = False
    evidence: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "lang": self.lang,
            "lines": self.lines,
            "codeLines": self.code_lines,
            "commentLines": self.comment_lines,
            "lexical": round(self.lexical, 2),
            "artifact": round(self.artifact, 2),
        }


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _is_ignored(rel_path: str) -> bool:
    parts = rel_path.lower().split("/")
    if any(part in IGNORED_DIR_PARTS for part in parts[:-1]):
        return True
    name = parts[-1]
    if name in GENERATED_NAMES or name.endswith(GENERATED_SUFFIXES):
        return True
    return False


_RULE_TABLE_HINTS = ("re.compile(", "re.search(", "re.match(", "_PATTERNS", "PATTERNS =", "Pattern[str]")


def _looks_like_rule_table(line: str) -> bool:
    """跳过"规则表/正则字面量"行：检测器自己的词表不能算作证据。"""
    return any(hint in line for hint in _RULE_TABLE_HINTS)


def _strip_code_only(text: str, lang: str) -> str:
    """尽量只留下"代码行"给命名分析，避免注释里的自然语言污染。"""
    if lang in DOC_LANGS:
        return ""
    kept: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(COMMENT_PREFIXES):
            continue
        kept.append(line)
    return "\n".join(kept)


def analyze_text(path: str, text: str, lang: str, *, evidence_budget: int = 2) -> FileSignals:
    """分析单份文本。纯函数，便于单测。"""
    signals = FileSignals(path=path, lang=lang)
    lines = text.splitlines()
    signals.lines = len(lines)
    if not lines:
        return signals

    is_doc = lang in DOC_LANGS
    for line in lines:
        stripped = line.strip()
        if not stripped:
            signals.blank_lines += 1
            continue
        if not is_doc and stripped.startswith(COMMENT_PREFIXES):
            signals.comment_lines += 1
        else:
            signals.code_lines += 1

    code_text = _strip_code_only(text, lang)
    identifiers = IDENT_RE.findall(code_text)
    signals.identifiers = len(identifiers)
    if identifiers:
        generic = sum(1 for name in identifiers if name.lower() in GENERIC_NAMES)
        long_names = 0
        for name in identifiers:
            if "_" in name:
                if len([part for part in name.split("_") if part]) >= 4:
                    long_names += 1
            elif re.search(r"[a-z][A-Z][a-z]+[A-Z]", name):
                long_names += 1
        signals.generic_names = generic
        signals.long_names = long_names
    signals.functions = len(FUNC_RE.findall(text))
    signals.has_main_block = bool(MAIN_BLOCK_RE.search(text))
    signals.module_doc = bool(DOCSTRING_RE.search(text[:400])) if lang == "Python" else False

    evidence_left = evidence_budget
    # 先收"硬证据"（生成痕迹），再收措辞证据：同样是两行，署名/伪测试更有说服力
    for patterns, kind, allow_evidence in (
        (ARTIFACT_PATTERNS, "artifact", True),
        (LEXICAL_PATTERNS, "lexical", True),
        (PLACEHOLDER_PATTERNS, "placeholder", False),
    ):
        for pattern, weight, label in patterns:
            for match in pattern.finditer(text):
                line_no = text.count("\n", 0, match.start()) + 1
                line_text = lines[line_no - 1] if 0 < line_no <= len(lines) else ""
                if _looks_like_rule_table(line_text):
                    continue  # 规则表/正则字面量里的词不算证据，否则检测器会自曝
                if is_doc and label == "emoji 装饰":
                    continue  # 文档里的 emoji 是正常排版，不算生成痕迹
                if kind == "artifact":
                    signals.artifact += weight
                    if label == "AI 协作署名" and not is_doc:
                        signals.has_ai_signature = True
                elif kind == "lexical":
                    signals.lexical += weight
                else:
                    signals.placeholder += weight
                if allow_evidence and evidence_left > 0 and not (is_doc and kind == "lexical"):
                    signals.evidence.append({
                        "file": path,
                        "line": line_no,
                        "kind": kind,
                        "hit": label,
                        "sample": match.group(0)[:60],
                    })
                    evidence_left -= 1

    # 单文件密度上限，避免一个巨型文件把整个仓库的分拉爆
    k_loc = max(1.0, signals.code_lines / 1000.0)
    signals.lexical = min(signals.lexical, 4.0 * k_loc)
    signals.artifact = min(signals.artifact, 4.0 * k_loc)
    signals.placeholder = min(signals.placeholder, 6.0 * k_loc)
    return signals


def _iter_candidate_files(root: Path) -> Iterable[tuple[Path, str, str]]:
    """遍历候选文件，返回 (绝对路径, 相对路径, 语言)。代码优先，文档单独算。"""
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            name for name in dirnames
            if name.lower() not in IGNORED_DIR_PARTS and name != ".git"
        ]
        for name in filenames:
            full = Path(dirpath) / name
            rel = full.relative_to(root).as_posix()
            lang = EXT_LANG.get(full.suffix.lower())
            if not lang or _is_ignored(rel):
                continue
            yield full, rel, lang
            count += 1
            if count >= MAX_FILES:
                return


def _git_signals(root: Path, *, limit: int = 200) -> dict[str, Any] | None:
    """读本地 git 历史。非 git 仓库或没有 git 时返回 None（权重按比例归一）。"""
    if not (root / ".git").exists():
        return None
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "log", f"-n{limit}", "--pretty=format:%H%x1f%ae%x1f%B%x1e"],
            capture_output=True, text=True, timeout=20, check=True,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    commits = [chunk for chunk in proc.stdout.split("\x1e") if chunk.strip()]
    if not commits:
        return None

    bot = template = 0
    for chunk in commits:
        parts = chunk.split("\x1f")
        if len(parts) < 3:
            continue
        body = parts[2]
        if re.search(r"co-authored-by:.*(copilot|claude|cursor|chatgpt|codeium|windsurf|devin|aider)", body, re.I):
            bot += 1
        subject = body.strip().splitlines()[0] if body.strip() else ""
        if re.match(r"^(feat|fix|chore|docs|refactor|test|style|perf|build|ci)(\([^)]*\))?!?:\s+\S", subject):
            template += 1

    giant = 0
    try:
        stat = subprocess.run(
            ["git", "-C", str(root), "log", f"-n{limit}", "--shortstat", "--pretty=format:%H"],
            capture_output=True, text=True, timeout=20, check=True,
        )
        for block in stat.stdout.split("\n\n"):
            changed = sum(int(n) for n in re.findall(r"(\d+) (?:insertion|deletion)", block))
            if changed >= 800:
                giant += 1
    except (subprocess.SubprocessError, OSError, ValueError):
        giant = 0

    total = len(commits)
    return {
        "commits": total,
        "bot_ratio": round(bot / total, 3),
        "template_ratio": round(template / total, 3),
        "giant_ratio": round(giant / total, 3),
    }


def _score_process(git: dict[str, Any] | None) -> float | None:
    if not git or int(git.get("commits") or 0) < 5:
        return None  # 提交太少，历史信号没有统计意义（比如一次导入的仓库）
    value = (
        0.45 * clamp(git["bot_ratio"] / 0.15)
        + 0.30 * clamp((git["template_ratio"] - 0.4) / 0.6)
        + 0.25 * clamp(git["giant_ratio"] / 0.25)
    )
    return round(clamp(value), 3)


def _band_of(rate: float) -> tuple[str, str]:
    key, name = BANDS[0][1], BANDS[0][2]
    for floor, band_key, band_name in BANDS:
        if rate >= floor:
            key, name = band_key, band_name
    return key, name


def analyze_directory(
    root: str | Path,
    *,
    use_git: bool = True,
    max_files: int = MAX_FILES,
) -> dict[str, Any]:
    """分析一个目录，返回 AI 味评分。目录不存在时抛 FileNotFoundError。"""
    root_path = Path(root).expanduser()
    if not root_path.exists():
        raise FileNotFoundError(str(root_path))
    if root_path.is_file():
        lang = EXT_LANG.get(root_path.suffix.lower()) or "Unknown"
        text = root_path.read_text(encoding="utf-8", errors="replace")[:MAX_FILE_BYTES]
        files = [analyze_text(root_path.name, text, lang, evidence_budget=MAX_EVIDENCE)]
        root_path = root_path.parent
    else:
        files = []
        for full, rel, lang in _iter_candidate_files(root_path):
            if len(files) >= max_files:
                break
            try:
                size = full.stat().st_size
                if size == 0 or size > MAX_FILE_BYTES:
                    continue
                text = full.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            files.append(analyze_text(rel, text, lang))

    return summarize(files, git=_git_signals(root_path) if use_git else None)


def summarize(files: list[FileSignals], *, git: dict[str, Any] | None = None) -> dict[str, Any]:
    """把单文件信号聚合成仓库级评分。纯函数，便于单测。"""
    code_files = [f for f in files if f.lang in CODE_EXTRA_LANGS]
    doc_files = [f for f in files if f.lang in DOC_LANGS]
    considered = code_files or files

    code_lines = sum(f.code_lines for f in considered) or 0
    comment_lines = sum(f.comment_lines for f in considered) or 0
    blank_lines = sum(f.blank_lines for f in considered)
    total_lines = sum(f.lines for f in considered) or 1
    lexical_hits = sum(f.lexical for f in files)
    artifact_hits = sum(f.artifact for f in files)
    placeholder_hits = sum(f.placeholder for f in files)
    identifiers = sum(f.identifiers for f in considered)
    generic = sum(f.generic_names for f in considered)
    long_names = sum(f.long_names for f in considered)

    k_loc = max(0.2, code_lines / 1000.0)

    # 1) 措辞
    lexical = clamp(lexical_hits / k_loc / 10.0)

    # 2) 结构
    comment_ratio = comment_lines / max(1, code_lines)
    blank_ratio = blank_lines / total_lines
    doc_ratio = sum(1 for f in code_files if f.module_doc) / max(1, len(code_files))
    main_ratio = sum(1 for f in code_files if f.has_main_block) / max(1, len(code_files))
    funcs = sum(f.functions for f in code_files)
    structural = 0.0
    if comment_ratio >= 0.30:
        structural += 0.30
    elif comment_ratio >= 0.22:
        structural += 0.15
    if len(code_files) >= 5 and doc_ratio >= 0.85:
        structural += 0.20
    if funcs >= 20 and doc_ratio >= 0.9:
        structural += 0.15
    if blank_ratio >= 0.24:
        structural += 0.15
    if len(code_files) >= 5 and main_ratio >= 0.7:
        structural += 0.15
    structural = clamp(structural)

    # 3) 命名
    if identifiers:
        naming = clamp(0.6 * clamp(generic / identifiers / 0.10) + 0.4 * clamp(long_names / identifiers / 0.20))
    else:
        naming = 0.0

    # 4) 生成痕迹（含占位骨架）
    artifact = clamp((artifact_hits + 0.6 * placeholder_hits) / k_loc / 6.0)
    if any(f.has_ai_signature for f in files):
        artifact = max(artifact, 0.9)

    process = _score_process(git)

    signals: dict[str, float | None] = {
        "lexical": round(lexical, 3),
        "structural": round(structural, 3),
        "naming": round(naming, 3),
        "artifact": round(artifact, 3),
        "process": process,
    }

    used = {key: weight for key, weight in WEIGHTS.items() if signals.get(key) is not None}
    weight_sum = sum(used.values()) or 1.0
    rate = round(sum(float(signals[key]) * weight for key, weight in used.items()) / weight_sum * 100.0, 1)

    families = sum(1 for key, weight in used.items() if float(signals[key] or 0) >= 0.2)
    if code_lines < 400:
        confidence = "low"
    elif code_lines < 2000:
        confidence = "medium"
    else:
        confidence = "high"
    if families <= 1 and confidence == "high":
        confidence = "medium"
    elif families == 0:
        confidence = "low"

    evidence: list[dict[str, Any]] = []
    for item in files:
        evidence.extend(item.evidence)
    evidence = evidence[:MAX_EVIDENCE]

    top_files = sorted(
        (
            {
                "path": f.path,
                "aiScore": round(
                    clamp((f.lexical + f.artifact + 0.5 * f.placeholder) / max(1.0, f.code_lines / 100.0) / 4.0) * 100, 1
                ),
                "lines": f.lines,
            }
            for f in files
            if f.code_lines >= 30
        ),
        key=lambda item: item["aiScore"],
        reverse=True,
    )[:MAX_TOP_FILES]

    band_key, band_name = _band_of(rate)
    notes: list[str] = []
    if git is None:
        notes.append("未检测 git 历史（不是 git 仓库或 git 不可用）")
    if len(code_files) < 3:
        notes.append("代码文件过少，结论仅供参考")
    if doc_files:
        notes.append(f"文档类文件 {len(doc_files)} 个已单独计权，不参与命名分析")

    return {
        "ai_rate": rate,
        "band": band_key,
        "band_name": band_name,
        "confidence": confidence,
        "code_files": len(code_files),
        "doc_files": len(doc_files),
        "code_lines": code_lines,
        "comment_ratio": round(comment_ratio, 3),
        "signals": signals,
        "evidence": evidence,
        "top_files": top_files,
        "git": git,
        "notes": notes,
        "version": 1,
    }


# ---------------------------------------------------------------- CLI

def _bar(value: float, width: int = 24) -> str:
    filled = int(round(clamp(value / 100.0) * width))
    return "█" * filled + "·" * (width - filled)


def render_text(result: dict[str, Any], *, show_evidence: bool = False) -> str:
    lines = [
        f"AI 味指数  {result['ai_rate']:5.1f} / 100   {_bar(result['ai_rate'])}  {result['band_name']}",
        f"置信度     {result['confidence']}   代码 {result['code_files']} 文件 / {result['code_lines']} 行"
        f"   注释率 {result['comment_ratio'] * 100:.1f}%",
        "",
        "信号分解",
    ]
    labels = {
        "lexical": "措辞", "structural": "结构", "naming": "命名", "artifact": "痕迹", "process": "历史",
    }
    for key, weight in WEIGHTS.items():
        value = result["signals"].get(key)
        if value is None:
            lines.append(f"  {labels[key]}  —        权重 {weight:.2f}  （不可用，已按剩余权重归一）")
            continue
        lines.append(f"  {labels[key]}  {float(value) * 100:5.1f}    权重 {weight:.2f}  {_bar(float(value) * 100, 16)}")

    if result["top_files"]:
        lines.append("")
        lines.append("最可疑文件")
        for item in result["top_files"]:
            lines.append(f"  {item['aiScore']:5.1f}  {item['path']}  ({item['lines']} 行)")

    if show_evidence and result["evidence"]:
        lines.append("")
        lines.append("证据")
        for item in result["evidence"]:
            lines.append(f"  {item['file']}:{item['line']}  [{item['kind']}] {item['hit']}  「{item.get('sample', '')}」")

    for note in result["notes"]:
        lines.append(f"注：{note}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m gitmon_api.aitrace",
        description="离线 AI 味检测：零网络、零模型，只看本地代码的措辞/结构/命名/痕迹/历史",
    )
    parser.add_argument("path", help="仓库目录或单个文件")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--evidence", action="store_true", help="打印证据行（含代码片段）")
    parser.add_argument("--no-git", action="store_true", help="跳过 git 历史信号")
    args = parser.parse_args(argv)

    try:
        result = analyze_directory(args.path, use_git=not args.no_git)
    except FileNotFoundError:
        print(f"路径不存在：{args.path}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(render_text(result, show_evidence=args.evidence))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
