"""离线 AI 味检测：规则一致性、样本区分度、证据可解释性。"""

from __future__ import annotations

from pathlib import Path

from gitmon_api import aitrace
from gitmon_api.scanner import languages

AI_STYLE = '''"""This module provides a comprehensive and robust utility for data processing.

It leverages a seamless pipeline to ensure that every record is handled elegantly.
"""


def process_user_data_with_full_validation(data, options):
    """Process the user data with full validation.

    Note that this function is comprehensive and robust. It's worth noting that
    we leverage a seamless strategy to ensure correctness.
    """
    result = []
    try:
        for item in data:
            result.append(item)
    except Exception:
        pass
    return result


def calculate_total_order_price_with_tax(order, tax_rate):
    """Calculate the total order price with tax."""
    value = order
    return value


if __name__ == "__main__":
    print(process_user_data_with_full_validation([], {}))
'''

HUMAN_STYLE = """import os


def load(path):
    with open(path, "rb") as fp:
        return fp.read()


def retry(fn, times=3):
    last = None
    for _ in range(times):
        try:
            return fn()
        except OSError as exc:
            last = exc
    raise last
"""


def _write(root: Path, name: str, text: str) -> None:
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def test_rule_tables_match_scanner() -> None:
    """工具自带一份最小语言表，必须和 scanner 的那份保持一致。"""
    for ext, lang in aitrace.CODE_EXT.items():
        assert languages.EXT_LANG.get(ext) == lang, ext
    assert aitrace.IGNORED_DIR_PARTS == languages.IGNORED_DIR_PARTS
    assert aitrace.GENERATED_NAMES == languages.GENERATED_NAMES
    assert aitrace.GENERATED_SUFFIXES == languages.GENERATED_SUFFIXES


def test_ai_style_scores_higher_than_human_style(tmp_dir: Path) -> None:
    ai_dir = tmp_dir / "ai"
    human_dir = tmp_dir / "human"
    _write(ai_dir, "src/service.py", AI_STYLE)
    _write(human_dir, "src/service.py", HUMAN_STYLE)

    ai = aitrace.analyze_directory(ai_dir, use_git=False)
    human = aitrace.analyze_directory(human_dir, use_git=False)

    assert ai["ai_rate"] > human["ai_rate"]
    assert ai["ai_rate"] >= 45
    assert human["ai_rate"] <= 35
    assert ai["signals"]["lexical"] > human["signals"]["lexical"]


def test_rule_table_lines_are_not_evidence(tmp_dir: Path) -> None:
    """检测器自己的正则表里出现"AI 协作署名"之类的词，不能算作证据。"""
    _write(
        tmp_dir,
        "detector.py",
        'import re\n\nPATTERNS = [\n'
        '    (re.compile(r"co-authored-by:.*(copilot|claude)"), 3.0, "AI 协作署名"),\n'
        '    (re.compile(r"certainly|here is"), 1.0, "引导语"),\n'
        ']\n',
    )
    result = aitrace.analyze_directory(tmp_dir, use_git=False)
    assert result["signals"]["artifact"] == 0
    assert result["evidence"] == []


def test_evidence_is_capped_and_has_line_numbers(tmp_dir: Path) -> None:
    _write(tmp_dir, "a.py", AI_STYLE)
    _write(tmp_dir, "b.py", AI_STYLE)
    result = aitrace.analyze_directory(tmp_dir, use_git=False)
    assert 0 < len(result["evidence"]) <= aitrace.MAX_EVIDENCE
    for item in result["evidence"]:
        assert item["file"] and item["line"] >= 1 and item["hit"]


def test_band_mapping() -> None:
    assert aitrace._band_of(0)[0] == "human"
    assert aitrace._band_of(20)[0] == "assisted"
    assert aitrace._band_of(40)[0] == "mixed"
    assert aitrace._band_of(65)[0] == "generated"
    assert aitrace._band_of(90)[0] == "ai-first"


def test_empty_repo_is_zero_and_low_confidence(tmp_dir: Path) -> None:
    _write(tmp_dir, "README.md", "# hello\n")
    result = aitrace.analyze_directory(tmp_dir, use_git=False)
    assert result["ai_rate"] == 0
    assert result["confidence"] == "low"
    assert result["signals"]["process"] is None


def test_non_git_directory_skips_process(tmp_dir: Path) -> None:
    _write(tmp_dir, "a.py", HUMAN_STYLE)
    result = aitrace.analyze_directory(tmp_dir, use_git=False)
    assert result["signals"]["process"] is None
    assert any("git" in note for note in result["notes"])


def test_render_text_contains_rate(tmp_dir: Path) -> None:
    _write(tmp_dir, "a.py", AI_STYLE)
    result = aitrace.analyze_directory(tmp_dir, use_git=False)
    text = aitrace.render_text(result)
    assert "AI 味指数" in text
    assert "信号分解" in text
