from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .common import read, strip_namespace
from .readme import readme_use_case_svg_paths
from .svg import check_single_svg_rendering_contract

USE_CASE_LABELS = (
    "TODO", "READY", "RUNNING", "REVIEW", "DONE", "FAILED", "codex", "session",
    "kanban run", "kanban approve", "kanban retry", "isolated worktree",
    "VC-035", "VC-031", "VC-033", "VC-001", "--execute --agent codex",
)
USE_CASE_ASSETS = (
    "docs/design/kanban-use-case.html",
    "docs/design/kanban-use-case.drawio",
    "docs/design/kanban-use-case.svg",
)
ISSUE_ID_RE = re.compile(r"^[A-Z][A-Z0-9]*-\d+$")
COMMAND_RE = re.compile(r"\bkanban[ \t]+(run|approve|retry)(?=$|[ \t<&\"'])(?:[ \t]+([^\s<&\"']+))?")


def check_use_case_drawio_svg_parity(root: Path) -> bool:
    drawio = read(root, "docs/design/kanban-use-case.drawio")
    svg = read(root, "docs/design/kanban-use-case.svg")
    missing = [label for label in USE_CASE_LABELS if label not in drawio or label not in svg]
    if missing:
        print(f"FAIL: use-case drawio/svg critical label drift: {missing}")
        return False
    print("PASS: use-case drawio/svg critical labels are aligned")
    return True


def check_use_case_command_examples(root: Path) -> bool:
    issues: list[str] = []
    for rel_path in USE_CASE_ASSETS:
        content = read(root, rel_path)
        commands = list(COMMAND_RE.finditer(content))
        if not commands:
            issues.append(f"{rel_path}: missing kanban command example")
        for command in commands:
            verb = command.group(1)
            issue_id = command.group(2)
            rendered = command.group(0)
            if issue_id is None:
                issues.append(f"{rel_path}: missing issue id in kanban {verb}")
            elif issue_id.startswith("#"):
                issues.append(f"{rel_path}: legacy hash issue command {rendered}")
            elif not ISSUE_ID_RE.match(issue_id):
                issues.append(f"{rel_path}: invalid issue id in kanban {verb} {issue_id}")
    if issues:
        print(f"FAIL: use-case command examples are invalid: {issues}")
        return False
    print("PASS: use-case command examples use valid issue ids")
    return True


def check_use_case_svg_rendering_contract(root: Path) -> bool:
    paths = readme_use_case_svg_paths(root)
    if not paths:
        return False
    ok = True
    for path in paths:
        if not check_single_svg_rendering_contract(root, path, "use-case README embed SVG", target_render_width=900):
            ok = False
    return ok


def check_use_case_drawio_xml_valid(root: Path) -> bool:
    drawio = root / "docs/design/kanban-use-case.drawio"
    try:
        drawio_root = ET.fromstring(drawio.read_text(encoding="utf-8"))
    except ET.ParseError as exc:
        print(f"FAIL: use-case draw.io XML parse error: {exc}")
        return False
    if strip_namespace(drawio_root.tag) != "mxfile":
        print("FAIL: use-case draw.io root element must be <mxfile>")
        return False
    if not any(strip_namespace(element.tag) == "mxGraphModel" for element in drawio_root.iter()):
        print("FAIL: use-case draw.io missing <mxGraphModel> element")
        return False
    print("PASS: use-case draw.io XML is structurally valid")
    return True
