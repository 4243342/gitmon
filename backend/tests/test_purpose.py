"""Exercise purpose classification on offline examples of the evidence contract."""

import pytest

from gitmon_api.purpose import classify


@pytest.mark.parametrize(
    ("attribute", "readme", "path", "language"),
    [
        ("earth", "The Linux kernel manages hardware and system resources.", "drivers/usb/core.c", "C"),
        ("fire", "A systems and service monitoring system with a time-series database.", "scrape/scrape.go", "Go"),
        ("water", "# Quickstart\nRun a model locally, then use the model inference API.", "runner/model_runner.go", "Go"),
        ("light", "A platform for modern publishing and memberships.", "core/newsletter/email.js", "JavaScript"),
        ("wind", "A messaging system for publishing events to your services.", "server/jetstream.go", "Go"),
        ("dark", "Identity and access management for applications.", "services/authz/permissions.java", "Java"),
    ],
)
def test_matches_independent_declaration_and_implementation(attribute, readme, path, language):
    assert classify({"readme": readme, "sources": {path: ""}, "language": language}) == f"purpose_{attribute}"


def test_ignores_copied_release_text_test_sources_and_generic_language():
    description = "A reverse proxy."
    assert classify({
        "readme": description,
        "artifacts": {"release/app-v1.zip": description},
        "sources": {"tests/reverse_proxy.py": "", "src/main.py": "# This mentions a reverse proxy"},
        "language": "Python",
    }) is None


def test_default_workflow_breaks_tie_between_subsystems():
    assert classify({
        "readme": "A service monitoring system and time-series database.\n## Quickstart\nCollect metrics from services.",
        "sources": {"scrape/scrape.go": "", "tsdb/reader.go": ""},
    }) == "purpose_fire"


def test_competing_independent_products_remain_ambiguous():
    assert classify({
        "readme": "# Components\nA reverse proxy and a vulnerability scanner.",
        "artifacts": {"release/reverse-proxy.zip": "", "release/vulnerability-scanner.zip": ""},
        "sources": {"src/reverse_proxy/router.c": "", "security/vulnerability_scanner/report.c": ""},
    }) is None


def test_language_supports_verification_of_specialized_core_source():
    assert classify({
        "readme": "Hardware description for a small CPU.",
        "language": "Verilog",
        "sources": {"src/cpu.v": "module cpu (input clk);\nendmodule"},
    }) == "purpose_earth"
