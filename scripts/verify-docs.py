#!/usr/bin/env python3
"""문서 검증 스크립트. 모든 검증 통과 시 exit 0, 실패 시 exit 1."""

import re
import sys
from pathlib import Path

def check_files_exist():
    """필수 파일 존재 검증"""
    required = [
        Path("README.md"),
        Path("docs/design/kanban-task-engine-one-page.drawio"),
        Path("docs/design/kanban-task-engine-one-page.svg"),
        Path("docs/design/README.md"),
        Path("docs/design/design-skill-usage-log.md"),
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print(f"FAIL: Missing files: {missing}")
        return False
    print("PASS: All required files exist")
    return True

def check_readme_links():
    """README 내부 링크와 외부 참조 검증"""
    readme = Path("README.md").read_text()
    issues = []
    # SVG 이미지 참조 확인
    if "kanban-task-engine-one-page.svg" not in readme:
        issues.append("README must reference kanban-task-engine-one-page.svg")
    # docs/design 링크 확인
    if "docs/design" not in readme:
        issues.append("README must link to docs/design")
    if issues:
        print(f"FAIL: README link issues: {issues}")
        return False
    print("PASS: README links are valid")
    return True

def check_internal_links():
    """docs/design/README.md 내부 링크 검증"""
    design_readme = Path("docs/design/README.md")
    if not design_readme.exists():
        print("SKIP: docs/design/README.md does not exist yet")
        return True
    content = design_readme.read_text()
    # draw.io 파일 참조 확인
    if "kanban-task-engine-one-page.drawio" not in content:
        print("FAIL: docs/design/README.md must reference .drawio source")
        return False
    print("PASS: Internal docs links are valid")
    return True

def check_diagram_labels():
    """다이어그램 XML에서 핵심 개념 포함 여부 검증"""
    drawio = Path("docs/design/kanban-task-engine-one-page.drawio")
    if not drawio.exists():
        print("SKIP: .drawio file does not exist yet")
        return True
    content = drawio.read_text()
    required_labels = [
        "Vault", "Engine", "Markdown", "Canonical",
        "Recipe", "READY", "RUNNING", "REVIEW", "DONE",
        "Jira", "Worktree"
    ]
    missing = [label for label in required_labels if label not in content]
    if missing:
        print(f"FAIL: Diagram missing labels: {missing}")
        return False
    print("PASS: Diagram contains all required labels")
    return True

def check_svg_valid():
    """SVG 파일이 유효한지 검증"""
    svg = Path("docs/design/kanban-task-engine-one-page.svg")
    if not svg.exists():
        print("SKIP: .svg file does not exist yet")
        return True
    content = svg.read_text()
    if "<svg" not in content:
        print("FAIL: SVG file does not contain <svg> tag")
        return False
    if len(content) < 100:
        print("FAIL: SVG file is too small (likely empty or error)")
        return False
    print("PASS: SVG file is valid")
    return True

def main():
    results = [
        check_files_exist(),
        check_readme_links(),
        check_internal_links(),
        check_diagram_labels(),
        check_svg_valid(),
    ]
    if all(results):
        print("\n=== ALL CHECKS PASSED ===")
        sys.exit(0)
    else:
        print("\n=== SOME CHECKS FAILED ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
