"""Collect bounded file evidence for cloud card classification."""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Callable
from pathlib import PurePosixPath
from typing import Any

from .languages import DOC_LANGS, EXT_LANG, MANIFEST_NAMES
from .snapshot import RepoSnapshot
from .tree import _ignored, _is_test

PurposeOption = bool | Callable[[RepoSnapshot], bool]
_MAX_TEXT_BYTES = 64 * 1024
_PURPOSE_SOURCE_CHARS = 2200
_QUALITY_SOURCE_CHARS = 8192
_QUALITY_TEST_CHARS = 6000
_SOURCE_EXTS = frozenset(EXT_LANG) - {".json", ".yaml", ".yml", ".toml", ".tex", ".rst", ".md",
                                    ".markdown", ".adoc", ".ipynb"} | {".v", ".sv", ".vhdl", ".vhd", ".s"}
_SKIP_DIRS = {"docs", "doc", "example", "examples", "demo", "demos", "samples", "fixtures",
              "assets", "benchmark", "benchmarks", "scripts", "generated"}
_ARTIFACT_NAMES = {name.lower() for name in MANIFEST_NAMES} | {
    "dockerfile", "containerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml",
    "compose.yaml", "chart.yaml", "makefile", "kbuild", "build.sbt", "build.zig", "goreleaser.yml",
    "goreleaser.yaml", ".goreleaser.yml", ".goreleaser.yaml",
}
_ENTRY_NAMES = {"main", "__main__", "index", "app", "cli", "server", "lib", "mod"}
_BLOB_SHA = re.compile(r"[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?")
_QUALITY_TEST = re.compile(r"(?:^|/)(?:selftests|kunit)(?:/|$)|(?:^|/)(?:test_[^/]+|[^/]+_test|[^/]+_kunit|tests)\.[^/]+$", re.I)
_INLINE_TEST = re.compile(r"(?m)^\s*(?:#\[test\]|(?:async\s+)?def\s+test_\w+\(|(?:it|test|describe)\s*\()")


def base64_text(payload: Any) -> str:
    if not isinstance(payload, dict) or payload.get("encoding") != "base64":
        return ""
    try:
        return base64.b64decode(payload.get("content") or "").decode("utf-8", "replace")
    except (ValueError, TypeError):
        return ""


def blob_sha(entry: Any) -> str:
    value = entry.get("sha") if isinstance(entry, dict) else None
    return value if isinstance(value, str) and _BLOB_SHA.fullmatch(value) else ""


def release_artifacts(releases: list[dict[str, Any]]) -> dict[str, str]:
    artifacts: dict[str, str] = {}
    stable = [release for release in releases if not (release.get("draft") or release.get("prerelease"))]
    for release in stable[:3]:
        assets = release.get("assets")
        if not isinstance(assets, list):
            continue
        for asset in assets[:12]:
            if not isinstance(asset, dict):
                continue
            name = asset.get("name") or asset.get("filename")
            if not isinstance(name, str) or not name or len(name) > 180:
                continue
            if name.lower().endswith((".sha256", ".sig", ".sbom", ".spdx.json", ".asc")):
                continue
            # A filename and the version in its release are enough to locate the artifact.
            artifacts.setdefault(f"release/{name}", str(release.get("tag_name") or "")[:80])
    return artifacts


class PurposeFiles:
    def __init__(self, entries: list[dict[str, Any]], max_entries: int, *, revision: str,
                 complete: bool = False) -> None:
        self.revision = revision
        self.complete = complete and len(entries) <= max_entries
        self.files: dict[str, dict[str, Any]] = {}
        for entry in entries[:max_entries]:
            path = entry.get("path")
            if entry.get("type") != "blob" or not isinstance(path, str) or not 0 < len(path) <= 220:
                continue
            if entry.get("mode") == "120000" or any(part in {"", ".", ".."} for part in path.split("/")):
                continue
            if "\\" in path or any(ord(char) < 32 for char in path):
                continue
            self.files[path] = entry

    def sha(self, path: str) -> str:
        return blob_sha(self.files.get(path, {}))

    def readme_path(self, platform_path: str = "") -> str:
        if platform_path and platform_path in self.files and "/" not in platform_path:
            return platform_path
        candidates = sorted(path for path in self.files if "/" not in path
                            and path.lower().split(".", 1)[0] == "readme")
        return candidates[0] if candidates else ""

    def populate(self, snapshot: RepoSnapshot, releases: list[dict[str, Any]], *, readme: str,
                 readme_path: str, manifests: dict[str, str], fetch: Callable[[str], str],
                 purpose: bool, quality: bool) -> None:
        artifacts = release_artifacts(releases)
        for path, value in manifests.items():
            if value and self._eligible(path):
                artifacts[path] = value[:2500]
        extra_artifacts = [path for path in sorted(self.files, key=_path_order)
                           if self._eligible(path) and path not in manifests
                           and PurePosixPath(path).name.lower() in _ARTIFACT_NAMES
                           and self.can_fetch(path)]
        for path in extra_artifacts[:2]:
            value = fetch(path)
            if value:
                artifacts[path] = value[:2500]

        sources: dict[str, str] = {}
        fetched = 0
        source_chars = _QUALITY_SOURCE_CHARS if quality else _PURPOSE_SOURCE_CHARS
        manifest_entries = self._manifest_entries(manifests)
        candidates = self._source_candidates(manifest_entries, quality=quality)
        for path in self._source_paths(candidates, set(manifest_entries)):
            value = ""
            if fetched < 4 and self.can_fetch(path):
                value = fetch(path)[:source_chars]
                fetched += 1
            sources[path] = value if "\0" not in value else ""

        evidence = {
            "description": snapshot.description[:500],
            "topics": [topic[:80] for topic in snapshot.topics[:20]],
            "readme": readme[:12_000],
            "readme_path": readme_path,
            "artifacts": artifacts,
            "sources": sources,
            "language": (snapshot.tree.get("primary_language") or snapshot.language)[:80],
            "revision": self.revision,
        }
        if purpose:
            snapshot.purpose_evidence = {
                **evidence, "sources": {path: content[:_PURPOSE_SOURCE_CHARS] for path, content in sources.items()},
            }
        if quality:
            snapshot.quality_evidence = self._collect_quality(evidence, candidates, fetch)

    def _collect_quality(self, evidence: dict[str, Any], candidates: list[str],
                         fetch: Callable[[str], str]) -> dict[str, Any]:
        sources = evidence["sources"]
        has_code = True if candidates else None
        if has_code is None and self.complete and (not evidence["language"] or evidence["language"] in DOC_LANGS):
            has_code = False
        sources_complete = (self.complete and has_code is not None
                            and all(self._full_text(path, sources.get(path, "")) for path in candidates))

        test_paths = sorted((path for path in self.files if self._quality_test(path)
                             and PurePosixPath(path).suffix.lower() in _SOURCE_EXTS
                             and self.files[path].get("size") != 0
                             and not _ignored(path) and not self._skipped_directory(path)), key=_path_order)
        tests: dict[str, str] = {}
        for path in [path for path in test_paths if self.can_fetch(path)][:2]:
            content = fetch(path)[:_QUALITY_TEST_CHARS]
            if content and "\0" not in content:
                tests[path] = content
        tests.update((path, source) for path, source in sources.items() if _INLINE_TEST.search(source))
        tests_complete = sources_complete and all(self._full_text(path, tests.get(path, "")) for path in test_paths)
        has_tests = True if test_paths or tests else (False if tests_complete else None)

        readme = evidence["readme"]
        readme_path = evidence["readme_path"]
        has_readme = bool(readme or (readme_path in self.files and self.files[readme_path].get("size") != 0))
        # Publication names can change without a source-tree change.
        artifacts = {path: content for path, content in evidence["artifacts"].items() if path in self.files}
        content_paths = {path for group in (sources, tests, artifacts) for path, value in group.items() if value}
        if readme:
            content_paths.add(readme_path)
        revision = self.revision if _BLOB_SHA.fullmatch(self.revision) and all(self.sha(path) for path in content_paths) else ""
        return {
            **evidence, "artifacts": artifacts, "tests": tests, "revision": revision,
            "complete": self.complete, "has_code": has_code, "has_tests": has_tests,
            "has_readme": True if has_readme else (False if self.complete else None),
            "sources_complete": sources_complete, "tests_complete": tests_complete,
            "readme_complete": self._full_text(readme_path, readme),
        }

    def _full_text(self, path: str, content: str) -> bool:
        size = self.files.get(path, {}).get("size")
        return type(size) is int and len(content.encode("utf-8")) == size and (size == 0 or bool(content))

    def _source_candidates(self, entries: list[str], *, quality: bool) -> list[str]:
        candidates = [path for path in self.files if self._eligible(path)
                      and PurePosixPath(path).suffix.lower() in _SOURCE_EXTS
                      and PurePosixPath(path).name.lower() not in _ARTIFACT_NAMES]
        paths = list(dict.fromkeys([*entries, *sorted(candidates, key=_source_order)]))
        if quality:
            paths = [path for path in paths if not self._quality_test(path) and self.files[path].get("size") != 0]
        return paths

    @staticmethod
    def _source_paths(candidates: list[str], manifest_entries: set[str]) -> list[str]:
        counts: dict[tuple[str, ...], int] = {}
        groups: list[list[str]] = [[], [], []]
        for path in candidates:
            group = PurePosixPath(path).parts[:-1][:2]
            index = counts.get(group, 0)
            if index < len(groups):
                counts[group] = index + 1
                groups[index].append(path)
        # Keep declared entry points first, then cover different modules before sampling more files per module.
        entries = [path for path in candidates if path in manifest_entries]
        return list(dict.fromkeys([*entries, *(path for group in groups for path in group)]))[:32]

    def _manifest_entries(self, manifests: dict[str, str]) -> list[str]:
        entries: list[str] = []
        for path, content in manifests.items():
            manifest = PurePosixPath(path)
            if manifest.name != "package.json" or not content or not self._eligible(path):
                continue
            try:
                package = json.loads(content)
            except (ValueError, RecursionError):
                continue
            if not isinstance(package, dict):
                continue
            bin_entries = package.get("bin")
            commands = list(bin_entries.values())[:4] if isinstance(bin_entries, dict) else [bin_entries]
            for target in [*commands, package.get("main"), package.get("module")]:
                if not isinstance(target, str) or not target or len(target) > 220:
                    continue
                resolved = manifest.parent / target
                entry_path = resolved.as_posix()
                # A declared command in bin/ is an entry point, even though bin/ is excluded from the source sample.
                screened_path = "/".join(part for part in resolved.parts[:-1] if part.lower() != "bin")
                screened_path = f"{screened_path}/{resolved.name}" if screened_path else resolved.name
                if entry_path in self.files and self._eligible(screened_path):
                    entries.append(entry_path)
        return entries

    def can_fetch(self, path: str) -> bool:
        size = self.files.get(path, {}).get("size")
        return isinstance(size, int) and 0 < size <= _MAX_TEXT_BYTES

    @staticmethod
    def _quality_test(path: str) -> bool:
        return _is_test(path) or bool(_QUALITY_TEST.search(path))

    @staticmethod
    def _skipped_directory(path: str) -> bool:
        directories = set(path.lower().split("/")[:-1])
        return bool(directories & _SKIP_DIRS) or any(part.startswith(".") for part in directories)

    def _eligible(self, path: str) -> bool:
        return not (_ignored(path) or _is_test(path) or self._skipped_directory(path))


def _path_order(path: str) -> tuple[int, str]:
    return path.count("/"), path.casefold()


def _source_order(path: str) -> tuple[bool, int, str]:
    return PurePosixPath(path).stem.lower() not in _ENTRY_NAMES, *_path_order(path)
