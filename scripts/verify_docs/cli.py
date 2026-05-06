from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from .common import DEFAULT_ROOT, rel, read, strip_namespace
from .readme import check_internal_links, check_readme_links, check_readme_text_version, readme_architecture_svg_paths
from .status import check_status_truth
from .svg import (
    check_svg_labels,
    check_svg_rendering_contract,
    check_svg_validity,
    find_forbidden_runtime_labels,
    find_nonexistent_package_labels,
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify kanban-task-engine docs/design assets.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Repository or fixture root")
    return parser.parse_args(argv)


def check_files_exist(root: Path) -> bool:
    required = [
        root / "README.md",
        root / "docs/design/kanban-task-engine-one-page.drawio",
        root / "docs/design/kanban-task-engine-one-page.svg",
        root / "docs/design/README.md",
        root / "packages/schema/src/status.ts",
    ]
    missing = [rel(root, path) for path in required if not path.exists()]
    if missing:
        print(f"FAIL: Missing files: {missing}")
        return False
    print("PASS: All required files exist")
    return True


def check_diagram_labels(root: Path) -> bool:
    drawio = root / "docs/design/kanban-task-engine-one-page.drawio"
    if not drawio.exists():
        print("SKIP: .drawio file does not exist")
        return True

    content = drawio.read_text(encoding="utf-8")
    required_labels = [
        "Vault",
        "Engine",
        "Markdown",
        "Canonical",
        "Recipe",
        "READY",
        "RUNNING",
        "REVIEW",
        "DONE",
        "FAILED",
        "Jira",
        "Worktree",
        "codex",
        "validate-only",
    ]
    missing = [label for label in required_labels if label not in content]
    if missing:
        print(f"FAIL: Diagram missing labels: {missing}")
        return False
    print("PASS: Diagram contains all required labels")
    return True


def check_drawio_svg_parity(root: Path) -> bool:
    drawio = read(root, "docs/design/kanban-task-engine-one-page.drawio")
    svg = read(root, "docs/design/kanban-task-engine-one-page.svg")
    critical = [
        "Vault",
        "Engine",
        "Markdown",
        "Canonical",
        "TODO",
        "READY",
        "RUNNING",
        "REVIEW",
        "DONE",
        "FAILED",
        "Jira",
        "Worktree",
        "codex",
        "validate-only",
        "SoT",
    ]
    missing = [label for label in critical if label not in drawio or label not in svg]
    if missing:
        print(f"FAIL: drawio/svg critical label drift: {missing}")
        return False
    print("PASS: drawio/svg critical labels are aligned")
    return True


def check_architecture_truth(root: Path) -> bool:
    paths = [
        root / "README.md",
        root / "docs/design/kanban-task-engine-one-page.drawio",
        root / "docs/design/kanban-task-engine-one-page.svg",
    ]
    architecture_embed_paths = readme_architecture_svg_paths(root)
    if architecture_embed_paths:
        paths.extend(architecture_embed_paths)

    values = [path.read_text(encoding="utf-8") for path in paths if path.exists()]
    missing_packages = find_nonexistent_package_labels(values, root)
    forbidden_runtime_labels = find_forbidden_runtime_labels(values)
    issues: list[str] = []
    if missing_packages:
        issues.append(f"non-existent package label: {missing_packages}")
    if forbidden_runtime_labels:
        issues.append(f"forbidden Codex adapter label: {forbidden_runtime_labels}")
    if issues:
        for issue in issues:
            print(f"FAIL: architecture truth issue: {issue}")
        return False
    print("PASS: Architecture package labels and Codex executor labels are true")
    return True


def check_drawio_xml_valid(root: Path) -> bool:
    drawio = root / "docs/design/kanban-task-engine-one-page.drawio"
    if not drawio.exists():
        print("SKIP: .drawio file does not exist")
        return True

    content = drawio.read_text(encoding="utf-8")
    try:
        drawio_root = ET.fromstring(content)
    except ET.ParseError as exc:
        print(f"FAIL: draw.io XML parse error: {exc}")
        return False
    if strip_namespace(drawio_root.tag) != "mxfile":
        print("FAIL: .drawio root element must be <mxfile>")
        return False
    if not any(strip_namespace(element.tag) == "mxGraphModel" for element in drawio_root.iter()):
        print("FAIL: .drawio missing <mxGraphModel> element")
        return False

    print("PASS: draw.io XML is structurally valid")
    return True


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    root = args.root.resolve()

    print("=" * 52)
    print("kanban-task-engine docs verification")
    print("=" * 52)
    print(f"Root: {root}")

    results = [
        check_files_exist(root),
        check_readme_links(root),
        check_internal_links(root),
        check_diagram_labels(root),
        check_svg_validity(root),
        check_svg_labels(root),
        check_svg_rendering_contract(root),
        check_drawio_svg_parity(root),
        check_status_truth(root),
        check_architecture_truth(root),
        check_readme_text_version(root),
        check_drawio_xml_valid(root),
    ]

    print()
    if all(results):
        print("=== ALL CHECKS PASSED ===")
        sys.exit(0)

    failed = sum(1 for result in results if not result)
    print(f"=== {failed} CHECK(S) FAILED ===")
    sys.exit(1)
