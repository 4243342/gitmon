"""扩展名 → 语言，以及语言 → 元素属性的映射表。

只保留判定需要的粒度，不追求 scc 那样的完整语言库。
"""

from __future__ import annotations

# 扩展名 → 规范语言名（与 engine.ELEMENTS 的 langs 对齐）
EXT_LANG: dict[str, str] = {
    ".py": "Python", ".pyi": "Python", ".pyx": "Python",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
    ".vue": "Vue", ".svelte": "Svelte",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".groovy": "Groovy",
    ".c": "C", ".h": "C",
    ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".hpp": "C++", ".hh": "C++", ".hxx": "C++",
    ".m": "Objective-C", ".mm": "Objective-C",
    ".swift": "Swift", ".dart": "Dart",
    ".rb": "Ruby", ".php": "PHP",
    ".cs": "C#", ".fs": "F#",
    ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell", ".fish": "Shell", ".ps1": "PowerShell",
    ".lua": "Lua", ".pl": "Perl", ".pm": "Perl", ".r": "R", ".jl": "Julia",
    ".ex": "Elixir", ".exs": "Elixir", ".erl": "Erlang", ".hs": "Haskell", ".ml": "OCaml",
    ".clj": "Clojure", ".sol": "Solidity", ".zig": "Zig", ".nim": "Nim",
    ".html": "HTML", ".htm": "HTML", ".css": "CSS", ".scss": "CSS", ".sass": "CSS", ".less": "CSS",
    ".sql": "SQL", ".ipynb": "Jupyter Notebook",
    ".md": "Markdown", ".markdown": "Markdown", ".rst": "reST", ".adoc": "AsciiDoc", ".tex": "TeX",
    ".glsl": "GLSL", ".hlsl": "HLSL", ".wgsl": "WGSL", ".metal": "Metal", ".shader": "ShaderLab",
    ".proto": "Protocol Buffers", ".graphql": "GraphQL", ".thrift": "Thrift",
    ".yaml": "YAML", ".yml": "YAML", ".json": "JSON", ".toml": "TOML",
}

# 代码类语言（参与 LOC 与语言占比），文档/配置类不参与
CODE_LANGS = {
    name for name in set(EXT_LANG.values())
    if name not in {"Markdown", "reST", "AsciiDoc", "TeX", "YAML", "JSON", "TOML",
                    "HTML", "CSS", "SQL", "Jupyter Notebook"}
}

# 文档类
DOC_LANGS = {"Markdown", "reST", "AsciiDoc", "TeX"}

# 语言 → 元素属性（主语言）
LANG_ELEMENT: dict[str, str] = {
    "Python": "water",
    "JavaScript": "thunder", "TypeScript": "thunder", "Vue": "thunder", "Svelte": "thunder",
    "Rust": "steel", "Zig": "steel",
    "Go": "earth",
    "Java": "rock", "Kotlin": "rock", "Scala": "rock", "Groovy": "rock", "C#": "rock", "F#": "rock",
    "C": "fire", "C++": "fire", "Objective-C": "fire", "Solidity": "fire",
    "Swift": "wind", "Dart": "wind", "Kotlin-JS": "wind",
    "Ruby": "grass", "PHP": "grass", "Elixir": "grass", "Lua": "grass",
    "Shell": "normal", "PowerShell": "normal", "Perl": "normal", "R": "normal", "Julia": "normal",
    "Haskell": "normal", "OCaml": "normal", "Clojure": "normal", "Erlang": "normal",
    "HTML": "normal", "CSS": "normal", "SQL": "rock", "Jupyter Notebook": "water",
    "GLSL": "fire", "HLSL": "fire", "WGSL": "steel", "Metal": "steel", "ShaderLab": "fire",
}

# 忽略的目录（第三方 / 构建产物 / 缓存）
IGNORED_DIR_PARTS = {
    "node_modules", "bower_components", "vendor", "third_party", "third-party", "extern",
    "dist", "build", "out", "target", "bin", "obj", "release", "coverage", ".next", ".nuxt",
    ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "site-packages", "Pods", ".tox", ".gradle", ".idea", ".vs", "deps", "_build",
    "assets/vendor", "public/vendor",
}

# 生成物 / 锁文件，不参与 LOC
GENERATED_SUFFIXES = (".min.js", ".min.css", ".map", ".lock", ".snap", ".pb.go", "_pb2.py", ".generated.ts")
GENERATED_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock",
    "go.sum", "composer.lock", "Gemfile.lock", "Pipfile.lock", "uv.lock", "bun.lockb",
}

MANIFEST_NAMES = {
    "package.json": "npm",
    "pyproject.toml": "python",
    "setup.py": "python",
    "requirements.txt": "python",
    "Pipfile": "python",
    "environment.yml": "python",
    "Cargo.toml": "cargo",
    "go.mod": "gomod",
    "pom.xml": "maven",
    "build.gradle": "gradle",
    "build.gradle.kts": "gradle",
    "Gemfile": "bundler",
    "composer.json": "composer",
    "pubspec.yaml": "pub",
    "Package.swift": "swiftpm",
    "mix.exs": "mix",
    "CMakeLists.txt": "cmake",
}

# 单次扫描最多读取的清单文件数（避免 monorepo 打爆请求预算）
MAX_MANIFESTS = 6
