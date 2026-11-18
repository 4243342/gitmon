from __future__ import annotations

import base64

import httpx
import pytest

from gitmon_api.repo import RepoRef
from gitmon_api.scanner import GiteeScanner, GitHubScanner
from gitmon_api.scanner.http import HttpClient
from gitmon_api.scanner.purpose import PurposeFiles
from gitmon_api.scanner.snapshot import RepoSnapshot


READ_ME = "# Monitor\n\nCollect service metrics and alert on errors.\n"
MANIFEST = '{"name":"service-monitor","description":"Service monitoring", "bin":"bin/watch"}'
ENTRY = "export function watchServices() { /* Alert on unhealthy services. */ }"
TEST = "test('rejects invalid metrics', () => { expect(parse(null)).toThrow() })"


@pytest.mark.parametrize("platform,scanner_class", [("github", GitHubScanner), ("gitee", GiteeScanner)])
def test_purpose_scan_reuses_revision_and_collects_production_evidence(platform, scanner_class):
    requested: list[str] = []

    def wrap(content: str) -> dict:
        return {"encoding": "base64", "content": base64.b64encode(content.encode()).decode()}

    def route(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        requested.append(path)
        if path.endswith("/repos/acme/monitor"):
            payload = {"id": 81, "language": "JavaScript", "description": "Service monitoring",
                       "stargazers_count": 0, "forks_count": 0}
        elif path.endswith("/branches"):
            payload = [{"name": "master", "commit": {"sha": "a" * 40}}]
        elif "/git/trees/" in path:
            files = [("README.md", len(READ_ME)), ("package.json", len(MANIFEST)), ("bin/watch", len(ENTRY)),
                     ("examples/main.js", 100), ("src/metrics.test.js", len(TEST)), ("vendor/cli.js", 100)]
            payload = {"sha": "a" * 40, "tree": [
                {"type": "blob", "path": name, "size": size, "sha": str(index) * 40}
                for index, (name, size) in enumerate(files, 1)
            ]}
        elif path.endswith("/readme"):
            # GitHub's default branch HEAD may have moved after the tree request.
            payload = {**wrap("A different revision"), "sha": "b" * 40, "path": "README.md", "size": 150}
        elif path.endswith("/contents/README.md"):
            payload = wrap("A different revision")
        elif path.endswith("/releases"):
            payload = [{"tag_name": "v1", "assets": [{"name": "service-monitor-linux"}, {"name": "app.sig"}]}]
        elif path.endswith("/git/blobs/" + "1" * 40):
            payload = wrap(READ_ME)
        elif path.endswith("/git/blobs/" + "2" * 40) or path.endswith("/contents/package.json"):
            payload = wrap(MANIFEST)
        elif path.endswith("/git/blobs/" + "3" * 40):
            payload = wrap(ENTRY)
        elif path.endswith("/git/blobs/" + "5" * 40):
            payload = wrap(TEST)
        else:
            payload = []
        return httpx.Response(200, json=payload)

    def collect_purpose(snapshot):
        assert snapshot.repo_id == "81"
        return True

    ref = RepoRef(platform, "acme", "monitor")
    with HttpClient() as http, httpx.Client(transport=httpx.MockTransport(route)) as mock:
        http._client.close()
        http._client = mock
        scanner = scanner_class(http, timeout=1)
        snapshot = scanner.scan(ref, purpose=collect_purpose)
        evidence = snapshot.purpose_evidence
        assert evidence["revision"] == "a" * 40
        assert evidence["readme"] == READ_ME
        assert evidence["sources"] == {"bin/watch": ENTRY}
        assert evidence["artifacts"] == {"package.json": MANIFEST, "release/service-monitor-linux": "v1"}
        assert "purpose_evidence" not in snapshot.to_dict()
        assert not snapshot.quality_evidence
        assert all(not path.endswith("5" * 40) for path in requested)

        requested.clear()
        assert not scanner.scan(ref, purpose=lambda _: False).purpose_evidence
        assert all("/git/blobs/" not in path for path in requested)

        requested.clear()
        snapshot = scanner.scan(ref, purpose=collect_purpose, quality=True)
        assert snapshot.recognition_counts_known
        quality = snapshot.quality_evidence
        assert quality["revision"] == "a" * 40
        assert quality["sources"] == {"bin/watch": ENTRY}
        assert quality["tests"] == {"src/metrics.test.js": TEST}
        assert quality["artifacts"] == {"package.json": MANIFEST}
        assert all(quality[key] for key in ("complete", "has_code", "has_tests", "has_readme",
                                           "sources_complete", "tests_complete", "readme_complete"))
        for blob_sha in ("1" * 40, "2" * 40, "3" * 40, "5" * 40):
            assert sum(path.endswith(f"/git/blobs/{blob_sha}") for path in requested) == 1
        assert snapshot.purpose_evidence == evidence
        assert "quality_evidence" not in snapshot.to_dict()

        snapshot = scanner.scan(ref, quality=True)
        assert snapshot.quality_evidence == quality
        assert not snapshot.purpose_evidence


def test_quality_evidence_distinguishes_limited_files_from_confirmed_absence():
    snapshot = RepoSnapshot(ref=RepoRef("github", "acme", "monitor"), fetched_at=0)
    snapshot.set_recognition_counts({"stargazers_count": 17})
    assert not snapshot.recognition_counts_known
    assert snapshot.stars == 17

    source = "x = 1\n" * 2000
    tree = [{"type": "blob", "path": "main.py", "size": len(source), "sha": "2" * 40}]
    files = PurposeFiles(tree, 20, revision="a" * 40, complete=True)
    files.populate(snapshot, [], readme="", readme_path="", manifests={}, fetch=lambda _: source,
                   purpose=True, quality=True)
    evidence = snapshot.quality_evidence
    assert evidence["has_code"] is True
    assert evidence["has_readme"] is False
    assert evidence["has_tests"] is None
    assert evidence["sources_complete"] is False
    assert evidence["tests_complete"] is False
    assert len(evidence["sources"]["main.py"]) == 8192
    assert len(snapshot.purpose_evidence["sources"]["main.py"]) == 2200

    files = PurposeFiles(tree, 20, revision="a" * 40, complete=False)
    files.populate(snapshot, [], readme="", readme_path="", manifests={}, fetch=lambda _: "",
                   purpose=False, quality=True)
    evidence = snapshot.quality_evidence
    assert evidence["complete"] is False
    assert evidence["has_readme"] is None
    assert evidence["has_tests"] is None
    assert evidence["sources_complete"] is False


def test_quality_evidence_never_assigns_a_revision_to_unpinned_content():
    snapshot = RepoSnapshot(ref=RepoRef("github", "acme", "monitor"), fetched_at=0)
    source = "def watch():\n    pass\n"
    tree = [{"type": "blob", "path": "main.py", "size": len(source)}]
    files = PurposeFiles(tree, 20, revision="a" * 40, complete=True)
    files.populate(snapshot, [], readme="", readme_path="", manifests={}, fetch=lambda _: source,
                   purpose=False, quality=True)
    assert snapshot.quality_evidence["sources"] == {"main.py": source}
    assert snapshot.quality_evidence["revision"] == ""
