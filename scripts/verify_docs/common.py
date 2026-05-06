from __future__ import annotations

from pathlib import Path

DEFAULT_ROOT = Path(__file__).parent.parent.parent
README_RENDER_WIDTH = 900
MIN_BODY_EFFECTIVE_PX = 8
MIN_TITLE_EFFECTIVE_PX = 12
KNOWN_STATUS_TOKENS = {"TODO", "READY", "RUNNING", "REVIEW", "DONE", "FAILED"}


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def read(root: Path, rel_path: str) -> str:
    return (root / rel_path).read_text(encoding="utf-8")


def strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag
