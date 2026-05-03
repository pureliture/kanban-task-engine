#!/usr/bin/env python3
"""
docs/design 검증 스크립트.
모든 검증 통과 시 exit 0, 실패 시 exit 1.

사용법:
  python scripts/verify-docs.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent


def check_files_exist() -> bool:
    """필수 파일 존재 검증"""
    required = [
        ROOT / "README.md",
        ROOT / "docs/design/kanban-task-engine-one-page.drawio",
        ROOT / "docs/design/kanban-task-engine-one-page.svg",
        ROOT / "docs/design/README.md",
    ]
    missing = [str(p.relative_to(ROOT)) for p in required if not p.exists()]
    if missing:
        print(f"FAIL: Missing files: {missing}")
        return False
    print("PASS: All required files exist")
    return True


def check_readme_links() -> bool:
    """README 내 시각화 asset 링크 검증"""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    issues = []

    if "kanban-task-engine-one-page.svg" not in readme:
        issues.append("README must reference kanban-task-engine-one-page.svg")
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


def check_internal_links() -> bool:
    """docs/design/README.md 내부 링크 검증"""
    design_readme = ROOT / "docs/design/README.md"
    if not design_readme.exists():
        print("SKIP: docs/design/README.md does not exist")
        return True
    content = design_readme.read_text(encoding="utf-8")
    if "kanban-task-engine-one-page.drawio" not in content:
        print("FAIL: docs/design/README.md must reference .drawio source")
        return False
    print("PASS: Internal docs links are valid")
    return True


def check_diagram_labels() -> bool:
    """draw.io XML에서 핵심 개념 라벨 포함 여부 검증"""
    drawio = ROOT / "docs/design/kanban-task-engine-one-page.drawio"
    if not drawio.exists():
        print("SKIP: .drawio file does not exist")
        return True

    content = drawio.read_text(encoding="utf-8")
    required_labels = [
        "Vault", "Engine", "Markdown", "Canonical",
        "Recipe", "READY", "RUNNING", "REVIEW", "DONE", "FAILED",
        "Jira", "Worktree", "codex", "validate-only",
    ]
    missing = [label for label in required_labels if label not in content]
    if missing:
        print(f"FAIL: Diagram missing labels: {missing}")
        return False
    print("PASS: Diagram contains all required labels")
    return True


def check_svg_validity() -> bool:
    """SVG 파일 유효성 검증 (존재, 최소 크기, svg 태그)"""
    svg = ROOT / "docs/design/kanban-task-engine-one-page.svg"
    if not svg.exists():
        print("FAIL: SVG file does not exist")
        return False

    size = svg.stat().st_size
    if size < 1024:
        print(f"FAIL: SVG file too small ({size} bytes, expected >= 1024)")
        return False

    content = svg.read_text(encoding="utf-8")
    if "<svg" not in content:
        print("FAIL: SVG file does not contain <svg> tag")
        return False
    if 'viewBox' not in content:
        print("FAIL: SVG file missing viewBox attribute")
        return False

    # annotation box 좌표가 캔버스(1600px) 내부인지 확인
    x_coords = [int(m) for m in re.findall(r'\bx="(\d+)"', content)]
    widths    = [int(m) for m in re.findall(r'\bwidth="(\d+)"', content)]
    # x + width 최대값 검사 (첫 번째 width는 svg 자체이므로 건너뜀)
    for x, w in zip(x_coords, widths[1:]):
        if x + w > 1600:
            print(f"FAIL: SVG element at x={x} width={w} exceeds canvas (x+w={x+w} > 1600)")
            return False

    print(f"PASS: SVG is valid ({size:,} bytes, viewBox present, all elements within canvas)")
    return True


def check_svg_labels() -> bool:
    """SVG 내 핵심 라벨 포함 여부 검증"""
    svg = ROOT / "docs/design/kanban-task-engine-one-page.svg"
    if not svg.exists():
        print("SKIP: SVG file does not exist")
        return True

    content = svg.read_text(encoding="utf-8")
    required = [
        "Vault", "Engine", "Markdown", "Canonical",
        "READY", "RUNNING", "REVIEW", "DONE", "FAILED",
        "Jira", "Worktree", "codex", "validate-only",
        "SoT",
    ]
    missing = [label for label in required if label not in content]
    if missing:
        print(f"FAIL: SVG missing labels: {missing}")
        return False
    print("PASS: SVG contains all required labels")
    return True


def check_font_sizes() -> bool:
    """SVG font-size 최소값 검증 (9px 이하 금지)"""
    svg = ROOT / "docs/design/kanban-task-engine-one-page.svg"
    if not svg.exists():
        print("SKIP: SVG file does not exist")
        return True

    content = svg.read_text(encoding="utf-8")
    # font-size: Npx 또는 font-size="N" 패턴 검출
    sizes_css  = [int(m) for m in re.findall(r'font-size:\s*(\d+)px', content)]
    sizes_attr = [int(m) for m in re.findall(r'font-size="(\d+)"', content)]
    all_sizes  = sizes_css + sizes_attr

    too_small = [s for s in all_sizes if s < 10]
    if too_small:
        print(f"FAIL: SVG contains font-size < 10px: {sorted(set(too_small))}")
        return False
    print(f"PASS: All SVG font sizes >= 10px (found: {sorted(set(all_sizes))})")
    return True


def check_drawio_xml_valid() -> bool:
    """draw.io XML이 mxfile 루트 요소를 포함하는지 확인"""
    drawio = ROOT / "docs/design/kanban-task-engine-one-page.drawio"
    if not drawio.exists():
        print("SKIP: .drawio file does not exist")
        return True

    content = drawio.read_text(encoding="utf-8")
    if "<mxfile" not in content:
        print("FAIL: .drawio missing <mxfile> root element")
        return False
    if "<mxGraphModel" not in content:
        print("FAIL: .drawio missing <mxGraphModel> element")
        return False
    if "</mxfile>" not in content:
        print("FAIL: .drawio missing closing </mxfile> tag")
        return False

    size = drawio.stat().st_size
    print(f"PASS: draw.io XML is structurally valid ({size:,} bytes)")
    return True


def main() -> None:
    print("=" * 52)
    print("kanban-task-engine docs verification")
    print("=" * 52)

    results = [
        check_files_exist(),
        check_readme_links(),
        check_internal_links(),
        check_diagram_labels(),
        check_svg_validity(),
        check_svg_labels(),
        check_font_sizes(),
        check_drawio_xml_valid(),
    ]

    print()
    if all(results):
        print("=== ALL CHECKS PASSED ===")
        sys.exit(0)
    else:
        failed = sum(1 for r in results if not r)
        print(f"=== {failed} CHECK(S) FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
