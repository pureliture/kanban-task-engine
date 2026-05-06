from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .common import MIN_BODY_EFFECTIVE_PX, MIN_TITLE_EFFECTIVE_PX, README_RENDER_WIDTH, strip_namespace
from .readme import readme_architecture_svg_paths
from .svg_dom import (
    element_classes,
    find_external_svg_references,
    has_full_viewbox_background,
    parse_svg,
    parse_style_blocks,
    parse_viewbox,
    resolved_font_size,
    svg_text_values,
)


def find_nonexistent_package_labels(text_values: list[str], repo_root: Path) -> list[str]:
    packages_root = repo_root / "packages"
    existing = {path.name for path in packages_root.glob("*") if path.is_dir()} if packages_root.exists() else set()
    missing: list[str] = []
    for value in text_values:
        for package_label in re.findall(r"packages/[A-Za-z0-9._-]+", value):
            package_name = package_label.split("/", 1)[1]
            if package_name not in existing:
                missing.append(package_label)
    return sorted(set(missing))


def find_forbidden_runtime_labels(text_values: list[str]) -> list[str]:
    forbidden = {"adapter-codex", "packages/adapter-codex"}
    hits: list[str] = []
    for value in text_values:
        for label in forbidden:
            if label in value:
                hits.append(label)
    return sorted(set(hits))


def check_svg_validity(root: Path) -> bool:
    svg_root = parse_svg(root / "docs/design/kanban-task-engine-one-page.svg")
    if svg_root is None:
        return False
    if strip_namespace(svg_root.tag) != "svg":
        print("FAIL: SVG root element must be <svg>")
        return False
    if parse_viewbox(svg_root) is None:
        print("FAIL: SVG file missing valid viewBox attribute")
        return False
    print("PASS: SVG is structurally valid and has a viewBox")
    return True


def check_svg_labels(root: Path) -> bool:
    svg_root = parse_svg(root / "docs/design/kanban-task-engine-one-page.svg")
    if svg_root is None:
        return False

    content = "\n".join(svg_text_values(svg_root))
    required = [
        "Vault",
        "Engine",
        "Markdown",
        "Canonical",
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
    missing = [label for label in required if label not in content]
    if missing:
        print(f"FAIL: SVG missing labels: {missing}")
        return False
    print("PASS: SVG contains all required labels")
    return True


def check_single_svg_rendering_contract(root: Path, svg_path: Path, label: str, target_render_width: int | None) -> bool:
    svg_root = parse_svg(svg_path)
    if svg_root is None:
        return False

    issues: list[str] = []
    rules = parse_style_blocks(svg_root)
    viewbox = parse_viewbox(svg_root)
    top_level_tags = {strip_namespace(child.tag) for child in svg_root}

    if "title" not in top_level_tags:
        issues.append(f"{label} SVG missing <title>")
    if "desc" not in top_level_tags:
        issues.append(f"{label} SVG missing <desc>")
    if viewbox is None:
        issues.append(f"{label} SVG missing valid viewBox")
    elif not has_full_viewbox_background(svg_root, viewbox):
        issues.append(f"{label} SVG missing full-viewBox background")

    external_refs = find_external_svg_references(svg_root, rules)
    if external_refs:
        issues.append(f"{label} external SVG reference: {external_refs}")

    defined_classes = {selector[1:] for selector in rules if selector.startswith(".")}
    used_classes = sorted({class_name for element in svg_root.iter() for class_name in element_classes(element)})
    undefined = [class_name for class_name in used_classes if class_name not in defined_classes]
    if undefined:
        issues.append(f"{label} undefined SVG classes: {undefined}")

    text_values = collect_text_readability_issues(issues, svg_root, rules, viewbox, label, target_render_width)
    missing_packages = find_nonexistent_package_labels(text_values, root)
    if missing_packages:
        issues.append(f"{label} non-existent package label: {missing_packages}")

    forbidden_runtime_labels = find_forbidden_runtime_labels(text_values)
    if forbidden_runtime_labels:
        issues.append(
            f"{label} forbidden Codex adapter label: {forbidden_runtime_labels}; "
            "use codex-runner backed by packages/core/src/executor/codex-runner.ts"
        )

    if issues:
        for issue in issues:
            print(f"FAIL: {issue}")
        return False
    print(f"PASS: {label} SVG rendering contract is satisfied")
    return True


def collect_text_readability_issues(
    issues: list[str],
    svg_root: ET.Element,
    rules: dict[str, dict[str, str]],
    viewbox: tuple[float, float, float, float] | None,
    label: str,
    target_render_width: int | None,
) -> list[str]:
    text_values: list[str] = []
    for element in svg_root.iter():
        if strip_namespace(element.tag) != "text":
            continue
        text = "".join(element.itertext()).strip()
        if text:
            text_values.append(text)
        size = resolved_font_size(element, rules)
        if size is None:
            issues.append(f"{label} text missing resolved font-size: {text[:60]}")
            continue
        if viewbox is not None and target_render_width is not None:
            effective = size * target_render_width / viewbox[2]
            is_title = any(class_name in {"title", "ttl", "zone", "zone-title"} for class_name in element_classes(element))
            minimum = MIN_TITLE_EFFECTIVE_PX if is_title else MIN_BODY_EFFECTIVE_PX
            if effective < minimum:
                issues.append(
                    f"{label} effective README font-size too small ({effective:.2f}px < {minimum}px): {text[:60]}"
                )
    return text_values


def check_svg_rendering_contract(root: Path) -> bool:
    ok = check_single_svg_rendering_contract(
        root,
        root / "docs/design/kanban-task-engine-one-page.svg",
        "one-page raw SVG",
        target_render_width=None,
    )
    architecture_embed_paths = readme_architecture_svg_paths(root)
    if not architecture_embed_paths:
        return False
    for path in architecture_embed_paths:
        if not check_single_svg_rendering_contract(
            root,
            path,
            "README embed SVG",
            target_render_width=README_RENDER_WIDTH,
        ):
            ok = False
    return ok
