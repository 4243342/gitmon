"""Offline evidence, rarity, and quality ratings for cloud cards."""

from __future__ import annotations

import ast
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any


@dataclass(frozen=True)
class Check:
    id: str
    dimension: str
    maximum: int
    earned: int | None
    refs: tuple[str, ...]
    question: str


_RARITIES = (
    (0, "N", "普卡", "#a2a8b2"),
    (10, "R", "稀有", "#74b9ed"),
    (100, "SR", "面闪", "#c696ff"),
    (1_000, "UR", "金闪", "#ffce65"),
    (10_000, "SE", "银碎", "#c6eafa"),
    (100_000, "PSE", "镜碎", "#f2aaff"),
)
# key, display name, accent, minimum source score, scaled rank cutoff (×100)
_RANKS = (
    ("iron", "黑铁", "#9698a5", 0, 0),
    ("bronze", "黄铜", "#cd9b75", 35, 8472),
    ("silver", "白银", "#bdd2e1", 45, 9767),
    ("gold", "黄金", "#f8cd63", 55, 10337),
    ("platinum", "铂金", "#81d3d2", 65, 11016),
    ("emerald", "翡翠", "#7be1af", 75, 11065),
    ("diamond", "钻石", "#a4baff", 82, 11331),
    ("king", "王者", "#f3a769", 90, 18500),
)
RANK_NUMBERS = {rank[0]: number for number, rank in enumerate(_RANKS, start=1)}
_NEUTRAL = "#9ca6b8"


def rarity(stars: int | None, forks: int | None, *, private: bool) -> dict[str, Any]:
    if private:
        return {"key": "unrated", "name": "未公开评级", "color": _NEUTRAL, "recognition": None, "status": "unrated"}
    if stars is None or forks is None:
        return {"key": "pending", "name": "待评估", "color": _NEUTRAL, "recognition": None, "status": "pending"}
    stars, forks = max(0, stars), max(0, forks)
    recognition = stars + min(2 * forks, stars // 4)
    _, key, name, color = next(tier for tier in reversed(_RARITIES) if recognition >= tier[0])
    return {"key": key, "name": name, "color": color, "recognition": recognition, "status": "confirmed"}


def community(recognition: int) -> int:
    if recognition >= 100_000:
        return 100
    return math.floor(100 * math.log1p(max(0, recognition)) / math.log1p(100_000))


def _rank(source: int, total: int, recognition: int) -> int:
    for index in range(len(_RANKS) - 1, 0, -1):
        _, _, _, minimum_source, cutoff = _RANKS[index]
        if source < minimum_source or (index == 7 and recognition < 70):
            continue
        if total * 100 >= cutoff or (index <= 4 and 123 * source * 100 >= 90 * cutoff):
            return index
    return 0


def rate(items: list[Check], community_range: tuple[int, int], reviews: dict[str, bool] | None = None) -> dict[str, Any]:
    if not items:
        return {"key": "not_applicable", "name": "不适用", "color": _NEUTRAL, "status": "not_applicable",
                "scoreMin": None, "scoreMax": None, "sourceMin": None, "sourceMax": None,
                "minRank": None, "maxRank": None}

    decisions = reviews or {}
    lower_source = upper_source = lower_bonus = upper_bonus = 0
    for item in items:
        earned = item.earned
        decision = decisions.get(item.id)
        if earned is None and item.refs and isinstance(decision, bool):
            earned = item.maximum if decision else 0
        lower = earned if earned is not None else 0
        upper = earned if earned is not None else item.maximum
        if item.dimension == "source":
            lower_source += lower
            upper_source += upper
        else:
            lower_bonus += lower
            upper_bonus += upper

    low_community, high_community = community_range
    lower_score = lower_source + min(lower_bonus, 3 * lower_source // 10) + low_community
    upper_score = upper_source + min(upper_bonus, 3 * upper_source // 10) + high_community
    low_rank = _rank(lower_source, lower_score, low_community)
    high_rank = _rank(upper_source, upper_score, high_community)
    key, name, color = _RANKS[low_rank][:3] if low_rank == high_rank else ("pending", "待评估", _NEUTRAL)
    return {"key": key, "name": name, "color": color, "status": "pending" if key == "pending" else "confirmed",
            "scoreMin": lower_score, "scoreMax": upper_score, "sourceMin": lower_source,
            "sourceMax": upper_source, "minRank": low_rank, "maxRank": high_rank}


_FUNCTION = re.compile(
    r"(?m)^\s*(?:(?:export|default|import|static|public|private|protected|async|pub|unsafe|extern)\s+)*"
    r"(?:"
    r"(?:function|fn|func)\s+(?:\([^\n]*?\)\s+)?(?P<function>[\w$]+)\s*\([^\n]*?\)[^;\n{}]*\{"
    r"|(?:const|let|var)\s+(?P<arrow>[\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{"
    r"|(?:[\w*:&<>\[\]]+\s+)+(?P<method>[\w$]+)\s*\([^\n]*?\)\s*\{"
    r")"
)
# JS/TS 公开导出即可视为真实入口片段，不要求像 Python 那样有 __main__。
_JS_EXPORT = re.compile(
    r"(?m)^\s*(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\b"
    r"|module\.exports\s*=|exports\.[\w$]+\s*=)")
_BRANCH = re.compile(r"\b(?:if|else if|for|while|switch|case|match|catch)\b|&&|\|\|")
_COMMENTS = re.compile(r'/\*[\s\S]*?\*/|//[^\n]*|"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'|`(?:\\.|[^`\\])*`')
_TEXT_LANGUAGES = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".go", ".rs", ".c", ".h", ".cpp", ".cc",
                   ".cxx", ".hpp", ".java", ".cs", ".kt"}
_GATE = {"if", "else", "for", "while", "switch", "match", "catch", "with", "when", "try"}
_ENTRY = {"main", "index", "app", "cli", "__main__"}
_DECISIONS = (ast.If, ast.IfExp, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.Match, ast.comprehension)
_PY_FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
_TRY_TYPES = (ast.Try, getattr(ast, "TryStar", ast.Try))


def _path_files(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {path: body for path, body in value.items()
            if isinstance(path, str) and PurePosixPath(path).parts and isinstance(body, str) and body.strip()}


def _trees(sources: dict[str, str]) -> dict[str, ast.Module]:
    trees = {}
    for path, body in sources.items():
        if not path.lower().endswith(".py"):
            continue
        try:
            trees[path] = ast.parse(body)
        except (SyntaxError, ValueError, RecursionError):
            continue  # Evidence often ends in the middle of a source file.
    return trees


def _symbol(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{_symbol(node.value)}.{node.attr}"
    return ""


def _masked(body: str) -> str:
    return _COMMENTS.sub(lambda hit: re.sub(r"[^\n]", " ", hit[0]), body)


def _function_loads(path: str, body: str, tree: ast.Module | None) -> list[tuple[str, int]]:
    if tree is not None:
        return [(node.name, sum(isinstance(child, _DECISIONS) for child in ast.walk(node)))
                for node in ast.walk(tree) if isinstance(node, _PY_FUNCTIONS) and any(
                    not isinstance(part, ast.Pass)
                    and not (isinstance(part, ast.Expr) and isinstance(part.value, ast.Constant)) for part in node.body
                )]
    if PurePosixPath(path).suffix.lower() not in _TEXT_LANGUAGES:
        return []
    text = _masked(body)
    brackets = []
    ends = {}
    for match in re.finditer(r"[{}]", text):
        if match[0] == "{":
            brackets.append(match.start())
        elif brackets:
            ends[brackets.pop()] = match.start()
    loads = []
    for match in _FUNCTION.finditer(text):
        name = match["function"] or match["arrow"] or match["method"]
        start = match.end() - 1
        if name not in _GATE and start in ends and text[start + 1:ends[start]].strip():
            loads.append((name, len(_BRANCH.findall(text, start, ends[start]))))
    return loads


_PARSER = {"int", "float", "complex", "json.load", "json.loads"}
_PYTHON_FILES = {"open", "io.open", "os.open", "Path.open", "pathlib.Path.open"}
_IO = _PYTHON_FILES | {"os.read", "os.write", "socket.socket", "socket.create_connection"}
_KNOWN_RESOURCE_FREE_CALLS = {"abs", "all", "any", "bool", "dict", "enumerate", "len", "list", "max", "min", "range",
                              "repr", "reversed", "round", "set", "sorted", "str", "sum", "tuple", "zip"}


def _python_robustness(trees: dict[str, ast.Module]) -> tuple[list[bool], list[bool]]:
    guarded, released = [], []
    for tree in trees.values():
        parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
        for node in parents:
            if not isinstance(node, ast.Call):
                continue
            name = _symbol(node.func)
            if name not in _IO | _PARSER:
                continue
            scopes = []
            current = node
            while current in parents:
                parent = parents[current]
                if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                    break
                scopes.append((current, parent))
                current = parent
            expected = {"ValueError", "TypeError", "json.JSONDecodeError", "JSONDecodeError"} if name in _PARSER else {
                "OSError", "IOError", "FileNotFoundError", "PermissionError", "ConnectionError", "TimeoutError"
            }
            guarded.append(any(
                isinstance(parent, _TRY_TYPES) and child in parent.body
                and any(_handles(handler, expected) for handler in parent.handlers) for child, parent in scopes
            ))
            if name in _PYTHON_FILES | {"socket.socket", "socket.create_connection"}:
                managers = _PYTHON_FILES - {"os.open"} | {"socket.socket", "socket.create_connection"}
                released.append(name in managers and any(
                    isinstance(parent, ast.withitem) and child is parent.context_expr for child, parent in scopes
                ))
    return guarded, released


def _handles(handler: ast.ExceptHandler, expected: set[str]) -> bool:
    alternatives = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    if not any(_symbol(kind) in expected for kind in alternatives if kind is not None):
        return False
    return any(isinstance(statement, (ast.Return, ast.Raise, ast.Break, ast.Continue)) for statement in handler.body)


def _py_imports(trees: dict[str, ast.Module]) -> set[str]:
    imports = set()
    for tree in trees.values():
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                imports.add(node.module.split(".")[0])
    return imports


def _python_contracts(trees: dict[str, ast.Module]) -> bool:
    public = [function for tree in trees.values() for function in tree.body
              if isinstance(function, _PY_FUNCTIONS) and not function.name.startswith("_")]
    return bool(public) and all(
        function.returns is not None and all(arg.annotation is not None for arg in
            (*function.args.posonlyargs, *function.args.args, *function.args.kwonlyargs))
        and any(isinstance(stmt, ast.Return) and stmt.value is not None for stmt in function.body)
        for function in public
    )


def _python_has_no_shared_writes(trees: dict[str, ast.Module]) -> bool:
    for tree in trees.values():
        parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
        if any(isinstance(node, (ast.Global, ast.Nonlocal)) for node in parents):
            return False
        for node in parents:
            if not isinstance(getattr(node, "ctx", None), (ast.Store, ast.Del)):
                continue
            if not isinstance(node, ast.Name):
                return False
            current = node
            while current in parents and not isinstance(current, (*_PY_FUNCTIONS, ast.comprehension)):
                current = parents[current]
            if not isinstance(current, (*_PY_FUNCTIONS, ast.comprehension)):
                return False
    return True


def _manifest_entry(artifacts: dict[str, str], sources: dict[str, str]) -> bool:
    for path, text in artifacts.items():
        if PurePosixPath(path).name != "package.json":
            continue
        try:
            manifest = json.loads(text)
        except (ValueError, RecursionError):
            continue
        if not isinstance(manifest, dict):
            continue
        prefix = PurePosixPath(path).parent
        bins = manifest.get("bin")
        entries = [manifest.get("main"), *(bins.values() if isinstance(bins, dict) else [bins])]
        if any(isinstance(entry, str) and (prefix / entry).as_posix() in sources for entry in entries):
            return True
    return False


def _duplicates(sources: dict[str, str]) -> int | None:
    blocks: Counter[tuple[str, ...]] = Counter()
    for path, body in sources.items():
        if path.lower().endswith(".py"):
            lines = [line for line in body.splitlines() if not line.lstrip().startswith("#")]
        else:
            lines = _masked(body).splitlines()
        useful = [" ".join(line.split()) for line in lines if re.search(r"\w", line)]
        for begin in range(0, len(useful) - 5, 6):
            blocks[tuple(useful[begin:begin + 6])] += 1
    total = sum(blocks.values())
    if not total:
        return None
    repeated = sum(count - 1 for count in blocks.values())
    return max(0, 10 - 50 * repeated // total)


_ASSERT = re.compile(r"\b(?:assert(?:Equals|Equal|Throws|That|True|False|Same|_eq|_ne)?|KUNIT_(?:EXPECT|ASSERT)\w*|"
                     r"ASSERT_\w+|EXPECT_\w+|require\.(?:Equal|NoError)|t\.(?:Error|Fatal)\w*|Assert\.(?:AreEqual|IsTrue))"
                     r"!?\s*(?:\(|\s)|\bexpect\(.+\)\s*\.\w+\(")
_TEST_ENTRY = re.compile(r"\b(?:test|describe|it|suite|KUNIT_CASE|TEST|TEST_F)\s*\(|\b(?:def test_\w+|func Test\w+|fn test_\w+)"
                          r"\s*\(|(?:@\s*Test|\[Test(?:Method)?\])")
_EDGE_ASSERT = re.compile(r"\b(?:assertRaises|assertThrows|toThrow|raises|toBeRejectedWith|rejects|ASSERT_THROW)\b")
_OPTION = re.compile(r"(?:\s--[a-z]+[\w-]*|\b(?:options?|parameters?|configuration|prerequisites?|limits?)\b|参数|配置)", re.I)
_DOC_COMMAND = re.compile(r"(?m)^\s*\$?\s*(?:python(?:3)? (?P<python>[\w./-]+\.py)|node (?P<node>[\w./-]+\.[cm]?js)|"
                          r"(?:npm|pnpm|yarn) (?:run )?(?P<npm>[\w:-]+)|(?P<go>go (?:run|build)\b)|(?P<cargo>cargo (?:run|build)\b)|"
                          r"(?P<make>make(?:\s+\w[\w-]*)?\s*$))")


def _documented_command(readme: str, sources: dict[str, str], artifacts: dict[str, str]) -> tuple[bool, bool]:
    verified = details = False
    for match in _DOC_COMMAND.finditer(readme):
        kind = match.lastgroup
        argument = match[kind].removeprefix("./")
        valid = kind in {"python", "node"} and argument in sources
        if kind in {"go", "cargo"}:
            valid = {"go": "go.mod", "cargo": "Cargo.toml"}[kind] in artifacts
        if kind == "make" and "Makefile" in artifacts:
            parts = argument.split()
            target = re.escape(parts[1]) if len(parts) == 2 else r"[a-zA-Z_][\w-]*"
            valid = bool(re.search(rf"(?m)^{target}\s*:[^=]", artifacts["Makefile"]))
        if kind == "npm" and "package.json" in artifacts:
            try:
                scripts = json.loads(artifacts["package.json"]).get("scripts")
            except (AttributeError, ValueError, RecursionError):
                continue
            valid = bool(isinstance(scripts, dict) and isinstance(scripts.get(argument), str) and scripts[argument].strip())
        if valid:
            verified = True
            details = details or bool(_OPTION.search(readme[match.start():match.end() + 200]))
    return verified, details


def _verified_absent(evidence: dict[str, Any], key: str) -> bool:
    return evidence.get("complete") is True and evidence.get(key) is False


def _python_test_evidence(trees: dict[str, ast.Module], names: set[str]) -> tuple[bool, bool, bool]:
    entry = core = edge = False
    assertion_calls = {"assertEqual", "assertTrue", "assertFalse", "assertIn", "assertRaises", "assertAlmostEqual"}
    for tree in trees.values():
        for function in ast.walk(tree):
            if not isinstance(function, _PY_FUNCTIONS) or not function.name.startswith("test"):
                continue
            for node in ast.walk(function):
                assertion = isinstance(node, ast.Assert) and not isinstance(node.test, ast.Constant)
                assertion = assertion or (isinstance(node, ast.Call) and _symbol(node.func).split(".")[-1] in assertion_calls)
                failure = isinstance(node, (ast.With, ast.AsyncWith)) and any(
                    isinstance(item.context_expr, ast.Call)
                    and _symbol(item.context_expr.func) in {"pytest.raises", "self.assertRaises"} for item in node.items
                )
                if assertion or failure:
                    targets_core = any(isinstance(child, ast.Call) and _symbol(child.func).split(".")[-1] in names
                                       for child in ast.walk(node))
                    entry = True
                    core = core or targets_core
                    edge = edge or (failure and targets_core)
    return entry, core, edge


def checks(evidence: dict[str, Any]) -> list[Check]:
    if _verified_absent(evidence, "has_code"):
        return []
    sources = _path_files(evidence.get("sources"))
    artifacts = _path_files(evidence.get("artifacts"))
    tests = _path_files(evidence.get("tests"))
    readme = evidence.get("readme") or ""
    trees = _trees(sources)
    python_complete = bool(trees) and evidence.get("sources_complete") is True and len(trees) == len(sources)
    loads = {path: _function_loads(path, body, trees.get(path)) for path, body in sources.items()}
    functions = {path: found for path, found in loads.items() if found}
    names = {name for found in functions.values() for name, _ in found if name not in _ENTRY and not name.startswith("_")}
    entry_paths = tuple(path for path, found in functions.items() if (
        any(name in {"main", "Main"} for name, _ in found)
        or PurePosixPath(path).stem == "__main__"
        or (path in trees and re.search(r"(?m)^\s*if\s+__name__\s*==\s*['\"]__main__['\"]\s*:", sources[path]))
    ))
    exported = tuple(path for path, body in sources.items() if _JS_EXPORT.search(body))
    entry_paths = tuple(dict.fromkeys([*entry_paths, *exported]))
    representative = tuple(functions) or tuple(sources)
    artifact_refs = tuple(artifacts)
    source_refs = tuple(sources)
    test_refs = tuple(tests)
    readme_refs = (evidence.get("readme_path") or "README",) if readme.strip() else ()

    function_loads = [cost for found in functions.values() for _, cost in found]
    # 抽样片段不可能每个文件都有函数：过半样本可解析即足以评估结构指标。
    covered = bool(functions) and len(functions) * 2 >= len(sources)
    complexity = round(15 * sum(max(0, min(1, (22 - load) / 13)) for load in function_loads) / len(function_loads)) if covered else None
    duplication = _duplicates({path: sources[path] for path in functions}) if covered else None
    imports = _py_imports(trees)
    modules = {part for path in sources for part in (PurePosixPath(path).parts[0].removesuffix(".py"), PurePosixPath(path).stem)}
    dependencies = 10 if python_complete and imports <= sys.stdlib_module_names | modules else None
    guarded, released = _python_robustness(trees)
    calls = {_symbol(node.func) for tree in trees.values() for node in ast.walk(tree) if isinstance(node, ast.Call)}
    known_calls = _KNOWN_RESOURCE_FREE_CALLS | _IO | _PARSER | names | {"main", "print"}
    safe_errors = 15 if python_complete and guarded and all(guarded) and calls <= known_calls else None
    safe_resources = 10 if python_complete and all(released) and calls <= known_calls else None
    interface = 10 if python_complete and _python_contracts(trees) else None
    pure_calls = _KNOWN_RESOURCE_FREE_CALLS | names | {"main"}
    state = 10 if python_complete and calls <= pure_calls and _python_has_no_shared_writes(trees) else None
    # Multiple interpreted modules must each contain implementation before marking boundaries.
    boundaries = 10 if covered and (len(functions) > 1 or evidence.get("sources_complete") is True) else None

    py_test_entry, py_test_core, py_test_edges = _python_test_evidence(_trees(tests), names)
    test_bodies = [_masked(text) for path, text in tests.items() if not path.lower().endswith(".py")]
    assertion_bodies = [text for text in test_bodies if _ASSERT.search(text)]
    core_names = re.compile(r"\b(?:" + "|".join(re.escape(name) for name in sorted(names)) + r")\s*\(") if names else None
    assertions = [line for body in assertion_bodies for line in body.splitlines() if _ASSERT.search(line)]
    has_test_entry = 8 if py_test_entry or any(_TEST_ENTRY.search(body) for body in assertion_bodies) else None
    core_tests = 8 if py_test_core or (core_names and any(core_names.search(line) for line in assertions)) else None
    edge_tests = 4 if py_test_edges or (core_names and any(core_names.search(line) and _EDGE_ASSERT.search(line) for line in assertions)) else None
    if _verified_absent(evidence, "has_tests"):
        has_test_entry = core_tests = edge_tests = 0
    usable_doc, documented_details = _documented_command(readme, sources, artifacts)
    docs_command = 6 if usable_doc else (0 if _verified_absent(evidence, "has_readme") else None)
    docs_details = 4 if documented_details else (0 if _verified_absent(evidence, "has_readme") else None)

    return [
        Check("source_entry", "source", 10, 10 if entry_paths or _manifest_entry(artifacts, sources) else None,
              entry_paths or representative + artifact_refs, "Does the excerpt identify a real public entry point or export?"),
        Check("source_boundaries", "source", 10, boundaries, representative,
              "Is this implementation split by clear responsibilities, including a single focused module?"),
        Check("source_dependencies", "source", 10, dependencies, artifact_refs + source_refs,
              "Are the implementation's imports explicit and covered by its manifests or standard library?"),
        Check("source_complexity", "source", 15, complexity, representative,
              "Are complete sampled functions manageable without excessive branching or nesting?"),
        Check("source_duplication", "source", 10, duplication, representative,
              "Do the provided implementation excerpts avoid substantively repeated logic?"),
        Check("source_errors", "source", 15, safe_errors, source_refs,
              "Are concrete failure paths guarded or propagated, including matching the operation to its handler?"),
        Check("source_resources", "source", 10, safe_resources, source_refs,
              "Is resource ownership clear and cleanup proved on both success and failure paths?"),
        Check("source_interface", "source", 10, interface, source_refs + readme_refs,
              "Do exposed inputs, return values, and error paths agree with the interface contract?"),
        Check("source_state", "source", 10, state, source_refs,
              "Are key state updates scoped and consistent on normal and early-return paths?"),
        Check("test_entry", "test", 8, has_test_entry, test_refs + artifact_refs,
              "Is there a runnable test entry with an actual assertion?"),
        Check("test_core", "test", 8, core_tests, test_refs + source_refs,
              "Does a real assertion verify the core implementation behavior in the source excerpt?"),
        Check("test_edges", "test", 4, edge_tests, test_refs + source_refs,
              "Does a test assert a boundary or failure case for a concrete implementation call?"),
        Check("docs_command", "docs", 6, docs_command, readme_refs + source_refs + artifact_refs,
              "Does the documented example use a real entry point or command declared by the repository?"),
        Check("docs_details", "docs", 4, docs_details, readme_refs + source_refs + artifact_refs,
              "Does the documentation explain a concrete option, prerequisite, or limitation of the verified entry point?"),
    ]
