from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .common import strip_namespace


def parse_svg(svg_path: Path) -> ET.Element | None:
    if not svg_path.exists():
        print(f"FAIL: SVG file does not exist: {svg_path}")
        return None
    try:
        return ET.fromstring(svg_path.read_text(encoding="utf-8"))
    except ET.ParseError as exc:
        print(f"FAIL: SVG XML parse error in {svg_path}: {exc}")
        return None


def parse_inline_style(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    return {
        key.strip(): value.strip()
        for key, value in re.findall(r"([A-Za-z-]+)\s*:\s*([^;]+)", style)
    }


def parse_style_blocks(svg_root: ET.Element) -> dict[str, dict[str, str]]:
    rules: dict[str, dict[str, str]] = {}
    for element in svg_root.iter():
        if strip_namespace(element.tag) != "style":
            continue
        css = "".join(element.itertext())
        if "@import" in css or "url(" in css or "@font-face" in css:
            rules.setdefault("__external__", {})["css"] = css
        for selector, body in re.findall(r"([.#]?[A-Za-z0-9_-]+|text)\s*\{([^}]*)\}", css):
            declarations: dict[str, str] = {}
            for key, value in re.findall(r"([A-Za-z-]+)\s*:\s*([^;]+)", body):
                declarations[key.strip()] = value.strip()
            rules[selector] = declarations
    return rules


def parse_size(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)", value)
    if not match:
        return None
    return float(match.group(1))


def parse_viewbox(svg_root: ET.Element) -> tuple[float, float, float, float] | None:
    viewbox = svg_root.attrib.get("viewBox")
    if not viewbox:
        return None
    parts = re.split(r"[\s,]+", viewbox.strip())
    if len(parts) != 4:
        return None
    try:
        x, y, width, height = [float(part) for part in parts]
    except ValueError:
        return None
    if width <= 0 or height <= 0:
        return None
    return x, y, width, height


def attr_float(element: ET.Element, name: str, default: float = 0) -> float:
    parsed = parse_size(element.attrib.get(name))
    return default if parsed is None else parsed


def has_full_viewbox_background(svg_root: ET.Element, viewbox: tuple[float, float, float, float]) -> bool:
    view_x, view_y, view_width, view_height = viewbox
    for element in svg_root.iter():
        if strip_namespace(element.tag) != "rect":
            continue
        fill = element.attrib.get("fill", "").strip().lower()
        opacity = element.attrib.get("opacity", "1").strip()
        fill_opacity = element.attrib.get("fill-opacity", "1").strip()
        if fill in {"none", "transparent"} or opacity == "0" or fill_opacity == "0":
            continue
        x = attr_float(element, "x")
        y = attr_float(element, "y")
        width = attr_float(element, "width")
        height = attr_float(element, "height")
        if x <= view_x and y <= view_y and x + width >= view_x + view_width and y + height >= view_y + view_height:
            return True
    return False


def element_classes(element: ET.Element) -> list[str]:
    return [part for part in element.attrib.get("class", "").split() if part]


def resolved_font_size(element: ET.Element, rules: dict[str, dict[str, str]]) -> float | None:
    inline = parse_inline_style(element.attrib.get("style"))
    direct = parse_size(element.attrib.get("font-size") or inline.get("font-size"))
    if direct is not None:
        return direct
    for class_name in element_classes(element):
        size = parse_size(rules.get(f".{class_name}", {}).get("font-size"))
        if size is not None:
            return size
    return parse_size(rules.get("text", {}).get("font-size"))


def find_external_svg_references(svg_root: ET.Element, rules: dict[str, dict[str, str]]) -> list[str]:
    refs: list[str] = []
    if "__external__" in rules:
        refs.append("style block contains @import/url()/@font-face")

    for element in svg_root.iter():
        tag = strip_namespace(element.tag)
        if tag in {"script", "foreignObject"}:
            refs.append(f"forbidden SVG element: {tag}")
        if tag == "image":
            refs.append("image element is not allowed in README SVG")
        for key, value in element.attrib.items():
            normalized_key = key.rsplit("}", 1)[-1]
            if normalized_key in {"href", "xlink:href"} and not value.startswith("#"):
                refs.append(f"{tag} {normalized_key}={value}")
            if "url(" in value and not re.search(r"url\(\s*#[^)]+\)", value):
                refs.append(f"{tag} {normalized_key} uses external url(): {value}")
    return refs


def svg_text_values(svg_root: ET.Element) -> list[str]:
    values: list[str] = []
    for element in svg_root.iter():
        if strip_namespace(element.tag) != "text":
            continue
        text = "".join(element.itertext()).strip()
        if text:
            values.append(text)
    return values
