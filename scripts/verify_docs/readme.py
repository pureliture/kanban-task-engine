from __future__ import annotations

import re
from pathlib import Path

from .common import read


def check_readme_links(root: Path) -> bool:
    readme = read(root, "README.md")
    issues: list[str] = []

    if "kanban-task-engine-one-page.svg" not in readme:
        issues.append("README must reference kanban-task-engine-one-page.svg")
    if "kanban-use-case.svg" not in readme:
        issues.append("README must reference Home Assisted use-case SVG: kanban-use-case.svg")
    if "kanban-use-case.html" not in readme:
        issues.append("README must link Home Assisted use-case HTML: kanban-use-case.html")
    if "docs/design" not in readme:
        issues.append("README must link to docs/design/")
    if "validate-only" not in readme:
        issues.append("README must mention validate-only mode")
    if "READY" not in readme or "RUNNING" not in readme:
        issues.append("README must mention READY/RUNNING status transitions")

    if issues:
        print(f"FAIL: README link/content issues: {issues}")
        return False
    print("PASS: README links and content are valid")
    return True


def check_internal_links(root: Path) -> bool:
    design_readme = root / "docs/design/README.md"
    if not design_readme.exists():
        print("SKIP: docs/design/README.md does not exist")
        return True

    content = design_readme.read_text(encoding="utf-8")
    issues: list[str] = []
    if "kanban-task-engine-one-page.drawio" not in content:
        issues.append("docs/design/README.md must reference .drawio source")
    if "kanban-task-engine-one-page.svg" not in content:
        issues.append("docs/design/README.md must reference one-page SVG")
    if "kanban-use-case.drawio" not in content:
        issues.append("docs/design/README.md must reference Home Assisted use-case drawio source: kanban-use-case.drawio")
    if "kanban-use-case.svg" not in content:
        issues.append("docs/design/README.md must reference Home Assisted use-case SVG: kanban-use-case.svg")
    if "kanban-use-case.html" not in content:
        issues.append("docs/design/README.md must reference Home Assisted use-case HTML: kanban-use-case.html")
    compact = root / "docs/design/kanban-task-engine-architecture-overview.svg"
    if compact.exists() and "kanban-task-engine-architecture-overview.svg" not in content:
        issues.append("docs/design/README.md must reference compact architecture overview SVG")

    if issues:
        print(f"FAIL: Internal docs link issues: {issues}")
        return False
    print("PASS: Internal docs links are valid")
    return True


def readme_architecture_svg_paths(root: Path) -> list[Path] | None:
    readme = read(root, "README.md")
    block_match = re.search(
        r'<a\s+href="docs/design/kanban-task-engine-one-page\.svg"[\s\S]*?</a>',
        readme,
    )
    if not block_match:
        print("FAIL: README architecture full-size one-page link block is missing")
        return None

    src_match = re.search(r'<img[^>]+src="([^"]+\.svg)"', block_match.group(0))
    if not src_match:
        print("FAIL: README architecture image is missing inside one-page link block")
        return None

    src = src_match.group(1)
    if Path(src).is_absolute():
        print(f"FAIL: architecture README embed SVG path must be repository-relative: {src}")
        return None

    path = (root / src).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        print(f"FAIL: architecture README embed SVG path must stay inside repository: {src}")
        return None

    if not path.exists():
        print(f"FAIL: architecture README embed SVG does not exist: {path}")
        return None
    return [path]


def readme_use_case_svg_paths(root: Path) -> list[Path] | None:
    readme = read(root, "README.md")
    block_match = re.search(
        r'<a\s+href="docs/design/kanban-use-case\.svg"[\s\S]*?</a>',
        readme,
    )
    if not block_match:
        print("FAIL: README use-case full-size link block is missing")
        return None

    src_match = re.search(r'<img[^>]+src="([^"]+\.svg)"', block_match.group(0))
    if not src_match:
        print("FAIL: README use-case image is missing inside use-case link block")
        return None

    src = src_match.group(1)
    if Path(src).is_absolute():
        print(f"FAIL: use-case README embed SVG path must be repository-relative: {src}")
        return None

    path = (root / src).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        print(f"FAIL: use-case README embed SVG path must stay inside repository: {src}")
        return None

    if not path.exists():
        print(f"FAIL: use-case README embed SVG does not exist: {path}")
        return None
    return [path]


def check_readme_text_version(root: Path) -> bool:
    readme = read(root, "README.md")
    required_text_version_labels = [
        "Vault",
        "Engine",
        "External",
        "validate-only",
        "codex-runner",
        "READY",
        "RUNNING",
        "REVIEW",
        "DONE",
        "FAILED",
    ]
    missing = [label for label in required_text_version_labels if label not in readme]
    if missing:
        print(f"FAIL: README text version missing architecture labels: {missing}")
        return False
    print("PASS: README text version contains architecture labels")
    return True
