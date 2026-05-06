from __future__ import annotations

import re
from pathlib import Path

from .common import KNOWN_STATUS_TOKENS, read
from .readme import readme_architecture_svg_paths


def parse_status_ts(root: Path) -> tuple[list[str], int] | None:
    status_path = root / "packages/schema/src/status.ts"
    if not status_path.exists():
        print("FAIL: packages/schema/src/status.ts is missing")
        return None

    source = status_path.read_text(encoding="utf-8")
    status_match = re.search(r"ISSUE_STATUSES\s*=\s*\[([^\]]+)\]", source)
    transition_match = re.search(r"VALID_ISSUE_TRANSITIONS[^=]*=\s*\[([\s\S]*?)\]\s*(?:as const)?;", source)
    if not status_match or not transition_match:
        print("FAIL: Could not parse ISSUE_STATUSES or VALID_ISSUE_TRANSITIONS from status.ts")
        return None

    statuses = re.findall(r"'([^']+)'", status_match.group(1))
    transition_count = len(re.findall(r"\{\s*from\s*:", transition_match.group(1)))
    return statuses, transition_count


def check_status_truth(root: Path) -> bool:
    parsed = parse_status_ts(root)
    if parsed is None:
        return False

    statuses, transition_count = parsed
    text_blobs = [
        read(root, "README.md"),
        read(root, "docs/design/kanban-task-engine-one-page.drawio"),
        read(root, "docs/design/kanban-task-engine-one-page.svg"),
    ]
    architecture_embed_paths = readme_architecture_svg_paths(root)
    if architecture_embed_paths:
        text_blobs.extend(path.read_text(encoding="utf-8") for path in architecture_embed_paths)
    combined = "\n".join(text_blobs)

    documented_statuses = {token for token in KNOWN_STATUS_TOKENS if token in combined}
    missing = [status for status in statuses if status not in documented_statuses]
    stale = sorted(documented_statuses - set(statuses))
    expected_count_labels = [
        f"IssueStatus ({len(statuses)})",
        f"{transition_count} valid transitions",
        f"{transition_count}개 전이",
        f"VALID_ISSUE_TRANSITIONS ({transition_count})",
    ]
    documented_count_labels = sorted(
        set(
            re.findall(
                r"IssueStatus \(\d+\)|\d+ valid transitions|\d+개 전이|VALID_ISSUE_TRANSITIONS \(\d+\)",
                combined,
            )
        )
    )
    has_transition_count = any(label in combined for label in expected_count_labels)

    if missing or stale or not has_transition_count:
        print(
            "FAIL: status.ts/SVG status drift: "
            f"missing={missing}, stale={stale}, expected_statuses={len(statuses)}, "
            f"expected_transitions={transition_count}, documented_counts={documented_count_labels}"
        )
        return False
    print("PASS: status.ts status labels and transition count match docs assets")
    return True
