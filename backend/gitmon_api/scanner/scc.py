"""可选的精确统计：浅克隆 + scc。

默认关闭（GITMON_USE_SCC=0）。树体积估算已经够判定用；只有想要真实
"代码行 / 注释行 / 圈复杂度"时才开——代价是多一次网络克隆和几十秒。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from ..errors import ScanError
from ..repo import RepoRef


def scc_available() -> bool:
    return shutil.which("scc") is not None and shutil.which("git") is not None


def collect(ref: RepoRef, *, timeout: float = 60.0, with_ai: bool = False) -> dict[str, Any] | None:
    """返回 {loc, comment_lines, complexity, lang_share, files, ai?}，失败返回 None。

    with_ai=True 时，在同一次克隆里顺手跑离线 AI 味检测（设计文档 §12），
    省掉二次克隆；检测失败不影响主流程。
    """
    if not scc_available():
        return None
    with tempfile.TemporaryDirectory(prefix="gitmon-scc-") as tmp:
        target = Path(tmp) / "repo"
        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", "--filter=blob:none", "--quiet", ref.html_url, str(target)],
                check=True, timeout=timeout, capture_output=True,
            )
        except (subprocess.SubprocessError, OSError):
            return None
        try:
            proc = subprocess.run(
                ["scc", "--format", "json", "--no-cocomo", "--by-file", str(target)],
                check=True, timeout=timeout, capture_output=True, text=True,
            )
            payload = json.loads(proc.stdout)
        except (subprocess.SubprocessError, ValueError, OSError):
            return None

        ai: dict[str, Any] | None = None
        if with_ai:
            try:
                from ..aitrace import analyze_directory

                ai = analyze_directory(target, use_git=False)
            except Exception:  # 检测是加分项，坏了不能影响孵化
                ai = None

    code = comment = complexity = 0
    per_lang: dict[str, int] = {}
    files = 0
    for bucket in payload if isinstance(payload, list) else []:
        lang = bucket.get("Name") or "Other"
        lang_code = int(bucket.get("Code") or 0)
        per_lang[lang] = per_lang.get(lang, 0) + lang_code
        code += lang_code
        comment += int(bucket.get("Comment") or 0)
        files += int(bucket.get("Count") or 0)
        for entry in bucket.get("Files") or []:
            complexity += int(entry.get("Complexity") or 0)

    if code <= 0:
        return None
    total = sum(per_lang.values()) or 1
    share = {lang: round(value / total, 4) for lang, value in
             sorted(per_lang.items(), key=lambda kv: kv[1], reverse=True)}
    return {
        "loc": code,
        "comment_lines": comment,
        "complexity": complexity,
        "complexity_per_file": round(complexity / files, 2) if files else 0.0,
        "lang_share": share,
        "files": files,
        "ai": ai,
    }


def merge_into_tree(tree: dict[str, Any], stats: dict[str, Any]) -> None:
    tree["loc"] = stats["loc"]
    tree["lang_share"] = stats["lang_share"] or tree.get("lang_share", {})
    tree["primary_language"] = next(iter(stats["lang_share"]), tree.get("primary_language", ""))
    tree["comment_lines"] = stats["comment_lines"]
    tree["complexity_per_file"] = stats["complexity_per_file"]
    tree["source"] = "scc"
    ai = stats.get("ai")
    if ai:
        tree["ai_rate"] = ai["ai_rate"]
        tree["ai_band"] = ai["band"]
        tree["ai_confidence"] = ai["confidence"]
        tree["ai_signals"] = ai["signals"]


def annotate_failure(snapshot: Any) -> None:
    snapshot.notes.append("scc 精确统计不可用，LOC 为文件体积估算")
    snapshot.degraded = True


__all__ = ["collect", "merge_into_tree", "scc_available", "annotate_failure", "ScanError"]
