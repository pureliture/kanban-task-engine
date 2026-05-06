# GitHub README SVG Rendering Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub README에서 architecture SVG가 깨지지 않고 읽히도록 asset, verifier, docs, CI gate를 TDD로 고친다.

**Architecture:** `docs/design/kanban-task-engine-one-page.drawio`는 semantic editing source이고, `docs/design/kanban-task-engine-one-page.svg`는 README/raw display production render다. README embed는 원본 one-page SVG를 직접 사용하고, compact overview SVG는 보조 asset으로만 유지한다. `scripts/verify-docs.py --root <path>`가 fixture와 real repo를 모두 검증하며 CI에서 자동 실행된다.

**Tech Stack:** Python 3 stdlib (`argparse`, `xml.etree.ElementTree`, `re`, `pathlib`), TypeScript Vitest, SVG, Markdown, GitHub Actions, Browser Use screenshot QA.

**Execution Status (2026-05-06):** Implemented locally. The Python verifier is split behind `scripts/verify-docs.py` into `scripts/verify_docs/*`, the docs verifier has fixture-based regression tests, and local `pnpm -r build`, `pnpm -r test`, `pnpm test:docs`, `pnpm eval:superpowers`, `pnpm eval:hardening -- --strict-architecture`, and `git diff --check HEAD` passed.

**Correction Note:** A compact overview was initially used as the README image fallback, but the accepted behavior is to show the original `kanban-task-engine-one-page.svg` in `README.md`. Plan tasks that describe compact README replacement are preserved as historical implementation notes and are superseded by this correction.

---

## Skill / Plugin Use Matrix

| Phase | Required Skill / Plugin | Purpose |
|---|---|---|
| Requirements refresh | `context7`, `architecture`, `system-design` | GitHub README image and SVG self-contained rendering contract 근거 확인 |
| Test design | `testing-strategy`, `superpowers:test-driven-development` | RED fixture tests, verifier integration, CI gate 구성 |
| Asset design | `frontend-design`, `architecture`, `system-design` | README-safe one-page raw SVG visual contract와 보조 compact SVG |
| Documentation | `documentation`, `skill-creator` | repo-local authoring rules 문서화; global skill은 만들지 않는 결정 기록 |
| Tech debt control | `tech-debt`, `code-simplifier` | regex debt, dependency debt, source/render drift 최소화 |
| Deployment | `deploy-checklist`, `superpowers:verification-before-completion` | local/CI/hosted GitHub 완료 기준 분리 |
| Implementation | `superpowers:subagent-driven-development` | task별 구현 + spec review + quality review |
| Review | `superpowers:requesting-code-review`, `code-simplifier` | 최소 3개 코드 리뷰와 refactor pass |

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `scripts/verify-docs.test.ts` | Create | Fixture-based RED/GREEN tests for docs verifier. |
| `scripts/verify-docs.py` | Modify | Add `--root`, XML-based SVG contract checks, runtime-truth checks. |
| `docs/design/kanban-task-engine-one-page.svg` | Modify | Add self-contained styles/background, remove false runtime labels, pass raw SVG contract. |
| `docs/design/kanban-task-engine-architecture-overview.svg` | Create | Auxiliary compact overview asset, `720`-wide viewBox. |
| `README.md` | Modify | Embed original one-page SVG and keep text detail/full-size click path. |
| `docs/design/README.md` | Modify | Document GitHub README SVG contract and post-export hardening rule. |
| `docs/design/HANDOFF-2026-05-06.md` | Create | Record follow-up cause, changed assets, verification evidence, hosted-readiness caveat. |
| `package.json` | Modify | Add `docs:verify` and `test:docs` scripts. |
| `.github/workflows/ci.yml` | Modify | Run docs verifier tests and docs verification in CI. |
| `scripts/eval-superpowers.ts` | Modify | Require CI docs gate so future CI shape regressions fail. |
| `scripts/check-hardening.ts` | Modify | Require docs verification in hardening CI/documentation gate. |

---

## Task 1: RED Tests for Fixtureable Docs Verifier

**Uses:** `testing-strategy`, `superpowers:test-driven-development`, `tech-debt`

**Files:**
- Create: `scripts/verify-docs.test.ts`
- Modify: none

- [ ] **Step 1: Write failing Vitest tests**

Create `scripts/verify-docs.test.ts` with this complete test harness:

```ts
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = new URL('..', import.meta.url).pathname;
const verifier = join(repoRoot, 'scripts/verify-docs.py');
const tempRoots: string[] = [];

async function makeFixture(options: {
  svg: string;
  drawio?: string;
  readmeImage?: string;
  statusSource?: string;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kanban-docs-verify-'));
  tempRoots.push(root);

  await mkdir(join(root, 'docs/design'), { recursive: true });

  const image = options.readmeImage ?? 'docs/design/kanban-task-engine-one-page.svg';
  await writeFile(
    join(root, 'README.md'),
    [
      '# fixture',
      '',
      `<img src="${image}" alt="Architecture overview" width="100%" />`,
      '',
      'validate-only READY RUNNING',
      '',
      '<details><summary>Architecture Detail (Text Version)</summary>',
      'Vault Engine External Work Mode lifecycle policy codex-runner',
      '</details>',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(root, 'docs/design/README.md'),
    [
      '# docs/design',
      '',
      '`kanban-task-engine-one-page.drawio`',
      '`kanban-task-engine-one-page.svg`',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(root, 'docs/design/kanban-task-engine-one-page.drawio'),
    options.drawio ??
      '<mxfile><diagram><mxGraphModel><root>Vault Engine Markdown Canonical Recipe READY RUNNING REVIEW DONE FAILED Jira Worktree codex validate-only SoT</root></mxGraphModel></diagram></mxfile>',
    'utf8',
  );

  await writeFile(join(root, 'docs/design/kanban-task-engine-one-page.svg'), options.svg, 'utf8');
  await mkdir(join(root, 'packages/schema/src'), { recursive: true });
  await writeFile(
    join(root, 'packages/schema/src/status.ts'),
    options.statusSource ??
      `export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;
export const VALID_ISSUE_TRANSITIONS = [
  { from: 'TODO', to: 'READY' },
  { from: 'READY', to: 'RUNNING' },
  { from: 'READY', to: 'TODO' },
  { from: 'RUNNING', to: 'REVIEW' },
  { from: 'RUNNING', to: 'FAILED' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'FAILED', to: 'READY' },
];`,
    'utf8',
  );

  return root;
}

function runVerify(root: string): { status: number | null; output: string } {
  const result = spawnSync('python3', [verifier, '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

function validSvg(extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480">
  <title>Architecture fixture</title>
  <desc>Fixture SVG for docs verification tests.</desc>
  <defs>
    <style>
      .title { font-size: 22px; font-weight: 700; fill: #172033; }
      .body { font-size: 14px; fill: #263548; }
    </style>
  </defs>
  <rect x="0" y="0" width="720" height="480" fill="#f8fafc"></rect>
  <text x="32" y="48" class="title">kanban-task-engine Architecture</text>
  <text x="32" y="90" class="body">Vault Engine Markdown Canonical Recipe</text>
  <text x="32" y="120" class="body">READY RUNNING REVIEW DONE FAILED</text>
  <text x="32" y="150" class="body">IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</text>
  <text x="32" y="180" class="body">Jira Worktree codex-runner validate-only SoT</text>
  ${extra}
</svg>`;
}

describe('verify-docs SVG rendering contract', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('fails when SVG text uses an undefined class', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="190" class="missing">Undefined class text</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('undefined SVG classes');
    expect(result.output).toContain('missing');
  });

  it('fails when SVG has no full-viewBox background', async () => {
    const root = await makeFixture({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480">
        <text x="32" y="48" font-size="18">Vault Engine Markdown Canonical Recipe READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT</text>
      </svg>`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('full-viewBox background');
  });

  it('fails when README effective body font is too small at 900px', async () => {
    const root = await makeFixture({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
        <rect x="0" y="0" width="1600" height="900" fill="#f8fafc"></rect>
        <text x="20" y="40" font-size="10">Vault Engine Markdown Canonical Recipe READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT</text>
      </svg>`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('effective README font-size');
  });

  it('fails on external SVG references', async () => {
    const root = await makeFixture({
      svg: validSvg('<style>@import url("https://example.com/a.css");</style><image href="https://example.com/a.png"></image>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('external SVG reference');
  });

  it('fails on false package labels not backed by repo packages', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="190" class="body">packages/adapter-codex</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('non-existent package label');
    expect(result.output).toContain('packages/adapter-codex');
  });

  it('fails on the bare adapter-codex label because no such package exists', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="190" class="body">adapter-codex</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('forbidden Codex adapter label');
    expect(result.output).toContain('adapter-codex');
  });

  it('ignores unrelated decorative README SVGs when checking architecture readability', async () => {
    const root = await makeFixture({
      readmeImage: 'docs/design/kanban-task-engine-architecture-overview.svg',
      svg: validSvg(),
    });
    await writeFile(
      join(root, 'README.md'),
      [
        '# fixture',
        '',
        '<img src="docs/design/hero-header.svg" alt="decorative header" width="100%" />',
        '',
        '<p align="center">',
        '  <a href="docs/design/kanban-task-engine-one-page.svg">',
        '    <img src="docs/design/kanban-task-engine-architecture-overview.svg" alt="Architecture overview" width="100%" />',
        '  </a>',
        '</p>',
        '',
        'validate-only READY RUNNING',
        '',
        '<details><summary>Architecture Detail (Text Version)</summary>',
        'Vault Engine External Work Mode lifecycle policy codex-runner REVIEW DONE FAILED',
        '</details>',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(root, 'docs/design/hero-header.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 200"><text x="1" y="12" font-size="6">tiny decorative text</text></svg>',
      'utf8',
    );
    await writeFile(join(root, 'docs/design/kanban-task-engine-architecture-overview.svg'), validSvg(), 'utf8');

    const result = runVerify(root);

    expect(result.status).toBe(0);
    expect(result.output).not.toContain('hero-header.svg');
  });

  it('fails when drawio and svg critical labels drift', async () => {
    const root = await makeFixture({
      svg: validSvg(),
      drawio: '<mxfile><diagram><mxGraphModel><root>Vault Engine Markdown Canonical Recipe READY RUNNING REVIEW DONE FAILED Jira Worktree validate-only SoT</root></mxGraphModel></diagram></mxfile>',
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('drawio/svg critical label drift');
    expect(result.output).toContain('codex');
  });

  it('fails when diagram status truth drifts from packages/schema/src/status.ts', async () => {
    const root = await makeFixture({
      svg: validSvg(),
      statusSource:
        `export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE'] as const;
export const VALID_ISSUE_TRANSITIONS = [
  { from: 'TODO', to: 'READY' },
];`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('status.ts/SVG status drift');
    expect(result.output).toContain('FAILED');
    expect(result.output).toContain('8');
  });

  it('fails when SVG contains script or foreignObject', async () => {
    const root = await makeFixture({
      svg: validSvg('<script>alert(1)</script><foreignObject x="1" y="1" width="1" height="1"></foreignObject>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('forbidden SVG element');
  });

  it('passes a self-contained README-safe SVG', async () => {
    const root = await makeFixture({ svg: validSvg() });

    const result = runVerify(root);

    expect(result.status).toBe(0);
    expect(result.output).toContain('ALL CHECKS PASSED');
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run scripts/verify-docs.test.ts
```

Expected now: FAIL. At least the first test should fail because `scripts/verify-docs.py` does not support `--root` and still passes the real repo's currently broken SVG.

- [ ] **Step 3: Commit only if this task is executed in isolation**

Do not commit yet if Task 2 will immediately follow in the same worker. The failing test is the RED proof and should be referenced in the implementation commit.

---

## Task 2: Implement Fixtureable XML-Based Verifier

**Uses:** `superpowers:test-driven-development`, `testing-strategy`, `tech-debt`, `code-simplifier`

**Files:**
- Modify: `scripts/verify-docs.py`
- Test: `scripts/verify-docs.test.ts`

- [ ] **Step 1: Add CLI root injection**

In `scripts/verify-docs.py`, replace the global root constant with argument parsing:

```python
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_ROOT = Path(__file__).parent.parent
README_RENDER_WIDTH = 900
MIN_BODY_EFFECTIVE_PX = 8
MIN_TITLE_EFFECTIVE_PX = 12


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify kanban-task-engine docs/design assets.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Repository or fixture root")
    return parser.parse_args(argv)
```

Update every check function to accept `root: Path`, for example:

```python
def check_files_exist(root: Path) -> bool:
    required = [
        root / "README.md",
        root / "docs/design/kanban-task-engine-one-page.drawio",
        root / "docs/design/kanban-task-engine-one-page.svg",
        root / "docs/design/README.md",
    ]
    missing = [str(p.relative_to(root)) for p in required if not p.exists()]
    if missing:
        print(f"FAIL: Missing files: {missing}")
        return False
    print("PASS: All required files exist")
    return True
```

Update `main()`:

```python
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
        check_drawio_xml_valid(root),
    ]

    print()
    if all(results):
        print("=== ALL CHECKS PASSED ===")
        sys.exit(0)

    failed = sum(1 for r in results if not r)
    print(f"=== {failed} CHECK(S) FAILED ===")
    sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Implement XML and CSS helpers**

Add helpers below `ROOT` replacement area:

```python
def strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def parse_svg(svg_path: Path) -> ET.Element | None:
    if not svg_path.exists():
        print(f"FAIL: SVG file does not exist: {svg_path}")
        return None
    try:
        return ET.fromstring(svg_path.read_text(encoding="utf-8"))
    except ET.ParseError as exc:
        print(f"FAIL: SVG XML parse error: {exc}")
        return None


def parse_style_blocks(root: ET.Element) -> dict[str, dict[str, str]]:
    rules: dict[str, dict[str, str]] = {}
    for element in root.iter():
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
    parts = [float(part) for part in re.split(r"[\s,]+", viewbox.strip()) if part]
    if len(parts) != 4:
        return None
    return (parts[0], parts[1], parts[2], parts[3])
```

- [ ] **Step 3: Implement rendering contract check**

Add:

```python
def element_classes(element: ET.Element) -> list[str]:
    return [part for part in element.attrib.get("class", "").split() if part]


def resolved_font_size(element: ET.Element, rules: dict[str, dict[str, str]]) -> float | None:
    direct = parse_size(element.attrib.get("font-size"))
    if direct is not None:
        return direct
    for class_name in element_classes(element):
        value = rules.get(f".{class_name}", {}).get("font-size")
        size = parse_size(value)
        if size is not None:
            return size
    return parse_size(rules.get("text", {}).get("font-size"))


def has_full_viewbox_background(svg_root: ET.Element, viewbox: tuple[float, float, float, float]) -> bool:
    min_x, min_y, width, height = viewbox
    for element in svg_root:
        if strip_namespace(element.tag) != "rect":
            continue
        x = parse_size(element.attrib.get("x", "0")) or 0
        y = parse_size(element.attrib.get("y", "0")) or 0
        w = parse_size(element.attrib.get("width"))
        h = parse_size(element.attrib.get("height"))
        fill = element.attrib.get("fill", "")
        if x <= min_x and y <= min_y and w is not None and h is not None and w >= width and h >= height and fill and fill != "none":
            return True
    return False


def find_external_svg_references(svg_root: ET.Element, rules: dict[str, dict[str, str]]) -> list[str]:
    refs: list[str] = []
    if "__external__" in rules:
        refs.append("style block contains @import/url()/@font-face")
    for element in svg_root.iter():
        tag = strip_namespace(element.tag)
        if tag in {"script", "foreignObject"}:
            refs.append(f"forbidden SVG element: {tag}")
        for key, value in element.attrib.items():
            normalized_key = key.rsplit("}", 1)[-1]
            if normalized_key in {"href", "xlink:href"} and re.match(r"^[a-z]+://", value):
                refs.append(f"{tag} {normalized_key}={value}")
        if tag == "image":
            refs.append("image element is not allowed in README SVG")
    return refs


def find_nonexistent_package_labels(text_values: list[str], repo_root: Path) -> list[str]:
    existing = {path.name for path in (repo_root / "packages").glob("*") if path.is_dir()}
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


def check_single_svg_rendering_contract(root: Path, svg_path: Path, label: str, target_render_width: int | None) -> bool:
    svg_root = parse_svg(svg_path)
    if svg_root is None:
        return False

    issues: list[str] = []
    rules = parse_style_blocks(svg_root)
    viewbox = parse_viewbox(svg_root)
    top_level_tags = {strip_namespace(child.tag) for child in svg_root}
    if "title" not in top_level_tags:
        issues.append("SVG missing <title>")
    if "desc" not in top_level_tags:
        issues.append("SVG missing <desc>")
    if viewbox is None:
        issues.append("SVG missing valid viewBox")
    elif not has_full_viewbox_background(svg_root, viewbox):
        issues.append("SVG missing full-viewBox background")

    external_refs = find_external_svg_references(svg_root, rules)
    if external_refs:
        issues.append(f"external SVG reference: {external_refs}")

    defined_classes = {
        selector[1:]
        for selector in rules
        if selector.startswith(".")
    }
    used_classes = sorted({class_name for element in svg_root.iter() for class_name in element_classes(element)})
    undefined = [class_name for class_name in used_classes if class_name not in defined_classes]
    if undefined:
        issues.append(f"undefined SVG classes: {undefined}")

    text_values: list[str] = []
    for element in svg_root.iter():
        if strip_namespace(element.tag) != "text":
            continue
        text = "".join(element.itertext()).strip()
        if text:
            text_values.append(text)
        size = resolved_font_size(element, rules)
        if size is None:
            issues.append(f"text missing resolved font-size: {text[:60]}")
            continue
        if viewbox is not None and target_render_width is not None:
            effective = size * target_render_width / viewbox[2]
            is_title = any(class_name in {"title", "ttl", "zone"} for class_name in element_classes(element))
            minimum = MIN_TITLE_EFFECTIVE_PX if is_title else MIN_BODY_EFFECTIVE_PX
            if effective < minimum:
                issues.append(
                    f"{label} effective README font-size too small ({effective:.2f}px < {minimum}px): {text[:60]}"
                )

    missing_packages = find_nonexistent_package_labels(text_values, root)
    if missing_packages:
        issues.append(f"non-existent package label: {missing_packages}")
    forbidden_runtime_labels = find_forbidden_runtime_labels(text_values)
    if forbidden_runtime_labels:
        issues.append(f"forbidden Codex adapter label: {forbidden_runtime_labels}; use codex-runner backed by packages/core/src/executor/codex-runner.ts")

    if issues:
        for issue in issues:
            print(f"FAIL: {issue}")
        return False
    print(f"PASS: {label} SVG rendering contract is satisfied")
    return True


def check_svg_rendering_contract(root: Path) -> bool:
    return check_single_svg_rendering_contract(
        root,
        root / "docs/design/kanban-task-engine-one-page.svg",
        "one-page raw SVG",
        target_render_width=None,
    )
```

The one-page raw SVG deliberately uses `target_render_width=None`; 900px effective font-size belongs to the compact README embed asset in Task 5.

Add a source/render parity check:

```python
def check_drawio_svg_parity(root: Path) -> bool:
    drawio = (root / "docs/design/kanban-task-engine-one-page.drawio").read_text(encoding="utf-8")
    svg = (root / "docs/design/kanban-task-engine-one-page.svg").read_text(encoding="utf-8")
    critical = ["Vault", "Engine", "Markdown", "Canonical", "READY", "RUNNING", "REVIEW", "DONE", "FAILED", "Jira", "Worktree", "codex", "validate-only", "SoT"]
    missing = [label for label in critical if label not in drawio or label not in svg]
    if missing:
        print(f"FAIL: drawio/svg critical label drift: {missing}")
        return False
    print("PASS: drawio/svg critical labels are aligned")
    return True
```

Add a status truth check backed by `packages/schema/src/status.ts`:

```python
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
    svg = (root / "docs/design/kanban-task-engine-one-page.svg").read_text(encoding="utf-8")
    drawio = (root / "docs/design/kanban-task-engine-one-page.drawio").read_text(encoding="utf-8")
    readme = (root / "README.md").read_text(encoding="utf-8")
    combined = "\n".join([svg, drawio, readme])

    known_status_tokens = {"TODO", "READY", "RUNNING", "REVIEW", "DONE", "FAILED"}
    documented_statuses = {token for token in known_status_tokens if token in combined}
    missing = [status for status in statuses if status not in documented_statuses]
    stale = sorted(documented_statuses - set(statuses))
    expected_count_labels = [
        f"IssueStatus ({len(statuses)})",
        f"{transition_count} valid transitions",
        f"{transition_count}개 전이",
        f"VALID_ISSUE_TRANSITIONS ({transition_count})",
    ]
    has_transition_count = any(label in combined for label in expected_count_labels)

    if missing or stale or not has_transition_count:
        print(
            "FAIL: status.ts/SVG status drift: "
            f"missing={missing}, stale={stale}, expected_statuses={len(statuses)}, "
            f"expected_transitions={transition_count}"
        )
        return False
    print("PASS: status.ts status labels and transition count match docs assets")
    return True
```

- [ ] **Step 4: Remove old font-size false-positive check**

Delete `check_font_sizes()` from the `results` list. Keep the function only if it delegates to `check_svg_rendering_contract`; otherwise remove it to avoid duplicate/confusing PASS output.

- [ ] **Step 5: Verify GREEN on fixture tests except real asset**

Run:

```bash
pnpm exec vitest run scripts/verify-docs.test.ts
```

Expected: the fixture tests for missing style/background/effective font/external refs/false package labels fail and pass as asserted. The final "self-contained README-safe SVG" test passes.

If the real repo integration is still failing, that is expected until Task 3 and Task 4 fix assets.

- [ ] **Step 6: Run real verifier and capture current failures**

Run:

```bash
python3 scripts/verify-docs.py
```

Expected now: FAIL with current real asset issues, including undefined classes and/or forbidden `adapter-codex` runtime label. Keep this output as RED evidence in the implementation notes.

---

## Task 3: Fix One-Page SVG Self-Contained Raw Render

**Uses:** `frontend-design`, `architecture`, `system-design`, `superpowers:test-driven-development`

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.svg`
- Modify: `docs/design/kanban-task-engine-one-page.drawio` if labels change

- [ ] **Step 1: Confirm RED against real asset**

Run:

```bash
python3 scripts/verify-docs.py
```

Expected before asset changes: FAIL. It must name current SVG contract issues.

- [ ] **Step 2: Add SVG-owned background and internal style**

At the top of `docs/design/kanban-task-engine-one-page.svg`, make the first visual element a full background rect and define every used class inside `<defs><style>`.

Required style class mapping:

```xml
<style>
  text { font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif; }
  .ttl { font-size: 24px; font-weight: 800; fill: #172033; }
  .zone { font-size: 18px; font-weight: 800; }
  .bh { font-size: 15px; font-weight: 700; }
  .bs { font-size: 14px; font-weight: 500; }
  .al { font-size: 14px; font-weight: 600; fill: #344054; }
  .ann { font-size: 14px; font-weight: 650; fill: #7a3900; }
  .ptl { font-size: 17px; font-weight: 800; }
  .stxt { font-size: 15px; font-weight: 800; }
  .nt { font-size: 14px; font-weight: 500; }
</style>
```

Add immediately after `</defs>`:

```xml
<rect x="0" y="0" width="1600" height="900" fill="#f8fafc"></rect>
```

- [ ] **Step 3: Fix runtime truth labels**

Replace the misleading adapter label:

```xml
<text x="834" y="112" text-anchor="middle" class="bs" fill="#555">adapter-codex</text>
```

with:

```xml
<text x="834" y="112" text-anchor="middle" class="bs" fill="#555">codex-runner</text>
```

Ensure adjacent labels or footnotes make the backing source explicit:

```xml
<text x="834" y="184" text-anchor="middle" class="bs" fill="#888" font-style="italic">core/executor</text>
```

Reflect the same semantic correction in `docs/design/kanban-task-engine-one-page.drawio`: use `codex-runner` or `packages/core/src/executor/codex-runner.ts`, not `packages/adapter-codex`.

Also align the status constant label with `packages/schema/src/status.ts`:

```xml
<text x="614" y="136" text-anchor="middle" class="bs" fill="#555">VALID_ISSUE_TRANSITIONS (8)</text>
```

Reflect the same `IssueStatus (6)` and `VALID_ISSUE_TRANSITIONS (8)` wording in `docs/design/kanban-task-engine-one-page.drawio`.

- [ ] **Step 4: Run verifier**

Run:

```bash
python3 scripts/verify-docs.py
```

Expected: If one-page still fails effective README font-size, do not shrink the contract. Proceed to Task 4 and use compact README overview. One-page raw SVG must still pass undefined class, background, external ref, and runtime truth checks.

- [ ] **Step 5: Commit boundary**

Commit after Task 4 if compact overview is created in the same branch; one-page and README embed should be reviewed together.

---

## Task 4: Create Compact README Architecture Overview SVG

**Uses:** `frontend-design`, `architecture`, `system-design`, `documentation`

**Files:**
- Create: `docs/design/kanban-task-engine-architecture-overview.svg`
- Modify: `README.md`
- Modify: `docs/design/README.md`

- [ ] **Step 1: Create README-safe compact SVG**

Create `docs/design/kanban-task-engine-architecture-overview.svg` with `viewBox="0 0 720 540"`, SVG-owned background, no external assets, inline or internal styles, and these mandatory labels:

```text
kanban-task-engine
Vault
Markdown issues
Engine
packages/core
packages/schema
codex-runner
CLI
External
Jira export
validate-only
READY -> RUNNING -> REVIEW -> DONE
FAILED
```

Use this concrete layout skeleton, then adjust copy only if verifier or screenshot QA fails:

```xml
<svg viewBox="0 0 720 540" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">
  <title>kanban-task-engine architecture overview</title>
  <desc>Compact GitHub README diagram showing Markdown Vault, Engine packages, CLI, codex-runner, validate-only, and Jira export flow.</desc>
  <defs>
    <style>
      .title { font-size: 26px; font-weight: 800; fill: #172033; }
      .subtitle { font-size: 13px; font-weight: 600; fill: #475467; }
      .zone-title { font-size: 16px; font-weight: 800; fill: #172033; }
      .label { font-size: 13px; font-weight: 700; fill: #263548; }
      .small { font-size: 11px; font-weight: 600; fill: #475467; }
      .badge { font-size: 11px; font-weight: 800; fill: #ffffff; }
      .note { font-size: 11px; font-weight: 650; fill: #6b4e16; }
    </style>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"></path>
    </marker>
  </defs>
  <rect x="0" y="0" width="720" height="540" fill="#f8fafc"></rect>
  <text x="360" y="38" text-anchor="middle" class="title">kanban-task-engine</text>
  <text x="360" y="62" text-anchor="middle" class="subtitle">Markdown-native task lifecycle engine - Home and Work</text>

  <rect x="42" y="92" width="176" height="210" rx="8" fill="#f7e8ff" stroke="#8b2bb6" stroke-width="2" stroke-dasharray="7 4"></rect>
  <text x="130" y="122" text-anchor="middle" class="zone-title">Vault</text>
  <text x="130" y="150" text-anchor="middle" class="label">Markdown issues</text>
  <text x="130" y="172" text-anchor="middle" class="small">.md + YAML frontmatter</text>
  <text x="130" y="196" text-anchor="middle" class="label">Recipes</text>
  <text x="130" y="218" text-anchor="middle" class="small">validate-only</text>
  <text x="130" y="240" text-anchor="middle" class="small">home-assisted</text>
  <text x="130" y="270" text-anchor="middle" class="note">Source of Truth</text>

  <rect x="272" y="92" width="176" height="210" rx="8" fill="#e8f7ee" stroke="#2f8f4e" stroke-width="2"></rect>
  <text x="360" y="122" text-anchor="middle" class="zone-title">Engine</text>
  <text x="360" y="150" text-anchor="middle" class="label">packages/core</text>
  <text x="360" y="172" text-anchor="middle" class="small">state machine</text>
  <text x="360" y="194" text-anchor="middle" class="small">policy + store</text>
  <text x="360" y="224" text-anchor="middle" class="label">packages/schema</text>
  <text x="360" y="246" text-anchor="middle" class="small">Canonical JSON</text>
  <text x="360" y="276" text-anchor="middle" class="note">No live state</text>

  <rect x="502" y="92" width="176" height="210" rx="8" fill="#e8f1ff" stroke="#2474c6" stroke-width="2" stroke-dasharray="7 4"></rect>
  <text x="590" y="122" text-anchor="middle" class="zone-title">External</text>
  <text x="590" y="150" text-anchor="middle" class="label">CLI</text>
  <text x="590" y="172" text-anchor="middle" class="small">run / next / approve</text>
  <text x="590" y="202" text-anchor="middle" class="label">codex-runner</text>
  <text x="590" y="224" text-anchor="middle" class="small">core executor</text>
  <text x="590" y="254" text-anchor="middle" class="label">Jira export</text>
  <text x="590" y="276" text-anchor="middle" class="small">Work mode one-way</text>

  <line x1="218" y1="188" x2="270" y2="188" stroke="#667085" stroke-width="2" marker-end="url(#arrow)"></line>
  <text x="244" y="178" text-anchor="middle" class="small">parse</text>
  <line x1="448" y1="188" x2="500" y2="188" stroke="#667085" stroke-width="2" marker-end="url(#arrow)"></line>
  <text x="474" y="178" text-anchor="middle" class="small">adapter</text>

  <rect x="74" y="344" width="572" height="78" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"></rect>
  <text x="360" y="370" text-anchor="middle" class="zone-title">Lifecycle</text>
  <rect x="122" y="388" width="72" height="24" rx="12" fill="#fff3c4" stroke="#c98a04"></rect>
  <text x="158" y="405" text-anchor="middle" class="small">READY</text>
  <rect x="238" y="388" width="82" height="24" rx="12" fill="#dceeff" stroke="#2374c6"></rect>
  <text x="279" y="405" text-anchor="middle" class="small">RUNNING</text>
  <rect x="364" y="388" width="78" height="24" rx="12" fill="#fff3c4" stroke="#c98a04"></rect>
  <text x="403" y="405" text-anchor="middle" class="small">REVIEW</text>
  <rect x="486" y="388" width="70" height="24" rx="12" fill="#e3f4e8" stroke="#2f8f4e"></rect>
  <text x="521" y="405" text-anchor="middle" class="small">DONE</text>
  <line x1="194" y1="400" x2="236" y2="400" stroke="#667085" marker-end="url(#arrow)"></line>
  <line x1="320" y1="400" x2="362" y2="400" stroke="#667085" marker-end="url(#arrow)"></line>
  <line x1="442" y1="400" x2="484" y2="400" stroke="#667085" marker-end="url(#arrow)"></line>
  <text x="360" y="448" text-anchor="middle" class="note">FAILED is terminal; validate-only checks policy without mutation.</text>

  <rect x="188" y="468" width="344" height="34" rx="17" fill="#243b53"></rect>
  <text x="360" y="490" text-anchor="middle" class="badge">Click for full-size one-page system map</text>
</svg>
```

Approved palette contrast pairs:

| Text | Background | Ratio requirement |
|---|---|---|
| `#172033` | `#f8fafc` | >= 4.5:1 |
| `#263548` | zone light backgrounds | >= 4.5:1 |
| `#475467` | `#f8fafc` / white | >= 4.5:1 |
| `#ffffff` | `#243b53` | >= 4.5:1 |

Do not use `<foreignObject>`, `<script>`, `<image>`, `href`, `xlink:href`, `@import`, `url(...)`, or remote fonts.

- [ ] **Step 2: Update README embed**

In `README.md` architecture section, change the `<img>` source to compact overview while keeping the full-size link to the one-page SVG:

```html
<p align="center">
  <a href="docs/design/kanban-task-engine-one-page.svg">
    <img src="docs/design/kanban-task-engine-architecture-overview.svg" alt="kanban-task-engine architecture overview: Markdown Vault, Engine packages, CLI, codex-runner, validate-only, and Jira export" width="100%" />
  </a>
</p>
```

Keep the adjacent prose:

```markdown
> 이미지를 클릭하면 full-size one-page 다이어그램을 볼 수 있습니다. 로컬 인터랙티브 버전은 [`docs/design/kanban-task-engine-one-page.html`](docs/design/kanban-task-engine-one-page.html)을 브라우저로 열어주세요.
```

- [ ] **Step 3: Update design README index**

Add a row to `docs/design/README.md` file list:

```markdown
| `kanban-task-engine-architecture-overview.svg` | GitHub README embed용 compact SVG 렌더링 (manually authored SVG) |
```

Add this GitHub README SVG contract section:

```markdown
## GitHub README SVG Contract

- README에 직접 embed되는 SVG는 반드시 self-contained여야 합니다.
- SVG 내부 class를 쓰면 같은 파일의 `<style>`에서 정의합니다.
- 전체 `viewBox`를 덮는 배경 `<rect>`를 둡니다.
- 외부 asset, remote font, `@import`, CSS `url(...)`, `<image>`를 사용하지 않습니다.
- README 900px 폭 기준 `effective_px = resolved_font_size * 900 / viewBox_width`가 body text 8px 이상, title/zone label 12px 이상이어야 합니다.
- draw.io export 후에는 그대로 커밋하지 말고 `python3 scripts/verify-docs.py`를 통과시킵니다.
- `kanban-task-engine-architecture-overview.svg`는 README용 manually authored SVG입니다. 의미가 바뀌는 label은 one-page `.drawio`, one-page `.svg`, compact overview `.svg`, README text version을 함께 갱신합니다.
```

Replace any existing `python scripts/verify-docs.py` examples in `docs/design/README.md` with `python3 scripts/verify-docs.py`.

- [ ] **Step 4: Run docs verifier**

Run:

```bash
python3 scripts/verify-docs.py
```

Expected: PASS for SVG rendering contract and README link/content checks. If it fails because verifier only checks `kanban-task-engine-one-page.svg`, extend verifier to also validate the README embed SVG path.

---

## Task 5: Update Verifier for README Embed Asset and Docs Truth

**Uses:** `testing-strategy`, `superpowers:test-driven-development`, `documentation`

**Files:**
- Modify: `scripts/verify-docs.test.ts`
- Modify: `scripts/verify-docs.py`

- [ ] **Step 1: Add RED test for README embed SVG path**

Append to `scripts/verify-docs.test.ts`:

```ts
it('verifies the actual SVG path embedded by README', async () => {
  const root = await makeFixture({
    readmeImage: 'docs/design/kanban-task-engine-architecture-overview.svg',
    svg: validSvg(),
  });
  await writeFile(
    join(root, 'docs/design/kanban-task-engine-architecture-overview.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
      <rect x="0" y="0" width="1600" height="900" fill="#f8fafc"></rect>
      <text x="20" y="40" font-size="10">too small</text>
    </svg>`,
    'utf8',
  );

  const result = runVerify(root);

  expect(result.status).not.toBe(0);
  expect(result.output).toContain('README embed SVG');
  expect(result.output).toContain('effective README font-size');
});
```

Append a missing-file RED test:

```ts
it('fails clearly when the architecture README embed SVG path is missing', async () => {
  const root = await makeFixture({
    readmeImage: 'docs/design/Missing-Architecture.svg',
    svg: validSvg(),
  });

  const result = runVerify(root);

  expect(result.status).not.toBe(0);
  expect(result.output).toContain('architecture README embed SVG does not exist');
  expect(result.output).toContain('Missing-Architecture.svg');
});
```

Run:

```bash
pnpm exec vitest run scripts/verify-docs.test.ts
```

Expected: FAIL until the verifier discovers and validates the actual README embed SVG.

- [ ] **Step 2: Implement architecture README embed SVG discovery**

Add:

```python
def readme_architecture_svg_paths(root: Path) -> list[Path]:
    readme = (root / "README.md").read_text(encoding="utf-8")
    block_match = re.search(
        r'<a\s+href="docs/design/kanban-task-engine-one-page\.svg"[\s\S]*?</a>',
        readme,
    )
    if not block_match:
        print("FAIL: README architecture full-size one-page link block is missing")
        return []
    src_match = re.search(r'<img[^>]+src="([^"]+\.svg)"', block_match.group(0))
    if not src_match:
        print("FAIL: README architecture image is missing inside one-page link block")
        return []
    path = root / src_match.group(1)
    if not path.exists():
        print(f"FAIL: architecture README embed SVG does not exist: {path}")
        return []
    return [path]
```

Refactor `check_svg_rendering_contract(root)` into:

```python
def check_svg_rendering_contract(root: Path) -> bool:
    ok = True
    if not check_single_svg_rendering_contract(
        root,
        root / "docs/design/kanban-task-engine-one-page.svg",
        "one-page raw SVG",
        target_render_width=None,
    ):
        ok = False
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
```

Move the Task 2 body into `check_single_svg_rendering_contract(root, svg_path, label, target_render_width)`.

- [ ] **Step 3: Add README text-version and status truth parity checks**

Add a check that README text version includes these strings:

```python
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
```

If missing, print:

```python
print(f"FAIL: README text version missing architecture labels: {missing}")
```

After `readme_architecture_svg_paths(root)` exists, update `check_status_truth(root)` so the combined status-truth text also includes every README architecture embed SVG path returned by that function. This prevents the compact overview from drifting away from `packages/schema/src/status.ts` while the one-page SVG remains correct.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm exec vitest run scripts/verify-docs.test.ts
python3 scripts/verify-docs.py
```

Expected: both PASS after asset/docs are fixed.

---

## Task 6: Add Root Scripts and CI Docs Gate

**Uses:** `deploy-checklist`, `testing-strategy`, `superpowers:test-driven-development`

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/eval-superpowers.ts`
- Modify: `scripts/check-hardening.ts`

- [ ] **Step 1: Add RED eval expectations**

In `scripts/eval-superpowers.ts`, extend the existing `CI runs build, test, superpowers, and hardening gates` check to require docs verification. Use the parsed `packageJson` object, not regex on the object:

```ts
packageJson.scripts?.['docs:verify'] === 'python3 scripts/verify-docs.py'
  && packageJson.scripts?.['test:docs'] === 'vitest run scripts/verify-docs.test.ts && pnpm docs:verify'
  && /pnpm test:docs/.test(ciWorkflow)
```

In `scripts/check-hardening.ts`, add a similar guard near the CI workflow checks. Use the existing `pkg` object:

```ts
{
  name: 'CI runs docs verification',
  pass: pkg.scripts?.['docs:verify'] === 'python3 scripts/verify-docs.py'
    && pkg.scripts?.['test:docs'] === 'vitest run scripts/verify-docs.test.ts && pnpm docs:verify'
    && /pnpm test:docs/.test(ci),
}
```

Run:

```bash
pnpm eval:superpowers
pnpm eval:hardening
```

Expected: FAIL because package scripts and CI step do not exist yet.

- [ ] **Step 2: Add package scripts**

In root `package.json`, add:

```json
"docs:verify": "python3 scripts/verify-docs.py",
"test:docs": "vitest run scripts/verify-docs.test.ts && pnpm docs:verify"
```

Keep existing script keys and formatting.

- [ ] **Step 3: Add CI docs step**

In `.github/workflows/ci.yml`, after `Test` and before `Superpowers eval`, add:

```yaml
      - name: Docs verification
        run: pnpm test:docs
```

- [ ] **Step 4: Verify eval GREEN**

Run:

```bash
pnpm test:docs
pnpm eval:superpowers
pnpm eval:hardening
```

Expected: all PASS.

---

## Task 7: Documentation Handoff and Deploy Checklist Evidence

**Uses:** `documentation`, `deploy-checklist`, `skill-creator`, `tech-debt`

**Files:**
- Create: `docs/design/HANDOFF-2026-05-06.md`
- Modify: `docs/design/README.md`

- [ ] **Step 1: Create handoff note**

Create `docs/design/HANDOFF-2026-05-06.md`:

```markdown
# HANDOFF - GitHub README SVG Rendering Hardening - 2026-05-06

## Root Cause

The README image link was valid, but the SVG render was not self-contained. Text classes such as `bs`, `ttl`, and `zone` had no internal style definitions, and the asset had no full background rect. GitHub README loaded the SVG through `<img>`, so external README CSS could not repair those styles.

## Decision

- `kanban-task-engine-one-page.drawio` remains the semantic editing source.
- `kanban-task-engine-one-page.svg` is a production render with post-export hardening.
- `kanban-task-engine-architecture-overview.svg` is the compact GitHub README embed.
- `scripts/verify-docs.py --root <path>` validates both real repo assets and fixture roots.

## Changed Files

| File | Purpose |
|---|---|
| `README.md` | Embed compact architecture overview and keep full-size one-page link. |
| `docs/design/kanban-task-engine-one-page.svg` | Self-contained raw SVG render. |
| `docs/design/kanban-task-engine-architecture-overview.svg` | README-safe compact SVG. |
| `scripts/verify-docs.py` | SVG rendering contract, fixture root, runtime truth checks. |
| `scripts/verify-docs.test.ts` | RED/GREEN regression tests. |
| `.github/workflows/ci.yml` | Docs verification gate. |

## Verification

```bash
pnpm test:docs
pnpm eval:superpowers
pnpm eval:hardening
pnpm -r build
pnpm -r test
```

## Hosted GitHub Caveat

Local verification and screenshot QA make the repo code ready. The GitHub-hosted issue is closed only after pushing and confirming the rendered README and raw SVG on github.com.
```

- [ ] **Step 2: Add tech debt note to design README**

In `docs/design/README.md`, add:

```markdown
## Maintenance Debt Guard

SVG 수동 수정은 draw.io export와 drift될 수 있습니다. 의미가 바뀌는 label, package name, runtime component는 `.drawio`와 `.svg`를 함께 수정합니다. README-safe style layer는 SVG production render의 일부이므로 draw.io export 후 사라질 수 있으며, 이 경우 `scripts/verify-docs.py`가 실패해야 합니다.
```

- [ ] **Step 3: Verify docs**

Run:

```bash
pnpm docs:verify
```

Expected: PASS.

---

## Task 8: Browser Use Visual QA

**Uses:** `frontend-design`, `browser-use:browser`, `deploy-checklist`, `superpowers:verification-before-completion`

**Files:**
- No source edits unless screenshot reveals a readability failure.
- Evidence paths under `/private/tmp/`.

- [ ] **Step 1: Prepare GitHub-like local README previews**

Create two temporary preview HTML files outside the repo. Do not commit them.

`/private/tmp/kanban-readme-preview-light.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #ffffff; color: #24292f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: 900px; max-width: 100%; margin: 0 auto; padding: 32px; box-sizing: border-box; }
    p { margin: 16px 0; }
    img { max-width: 100%; height: auto; }
    .note { color: #57606a; font-size: 14px; }
  </style>
</head>
<body>
<main>
  <h2>Architecture Overview</h2>
  <p align="center">
    <a href="file:///Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.svg">
      <img src="file:///Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-architecture-overview.svg" alt="kanban-task-engine architecture overview" width="100%">
    </a>
  </p>
  <p class="note">이미지를 클릭하면 full-size one-page 다이어그램을 볼 수 있습니다.</p>
</main>
</body>
</html>
```

`/private/tmp/kanban-readme-preview-dark.html` is the same except:

```css
body { margin: 0; background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.note { color: #8b949e; font-size: 14px; }
```

- [ ] **Step 2: Capture screenshots**

Capture these views:

```text
/private/tmp/kanban-svg-readme-desktop-light.png
/private/tmp/kanban-svg-readme-desktop-dark.png
/private/tmp/kanban-svg-readme-mobile.png
/private/tmp/kanban-svg-raw.png
```

Required viewport checks:

```text
Desktop: 900px content width
Mobile: 360px content width
Raw SVG: full SVG viewport
```

Browser Use should capture:

1. Light preview at `900x700` viewport.
2. Dark preview at `900x700` viewport.
3. Light preview at `360x700` viewport.
4. Raw one-page SVG file with a viewport that shows the whole `1600x900` viewBox.

Manual contrast audit:

- Confirm compact SVG uses only approved palette pairs from Task 4 or stronger contrast.
- Confirm both compact and one-page SVG include `<title>` and `<desc>`.

- [ ] **Step 3: Evaluate screenshots**

Pass criteria:

- Desktop light/dark: title, Vault, Engine, CLI, External, validate-only, codex-runner, Jira export are readable.
- Mobile: compact overview title and zone headings are visible; full-size guidance remains adjacent in README.
- Raw SVG: one-page background and text render; no dark-theme invisibility.

If any fail, return to Task 3 or Task 4, adjust SVG layout or font sizes, and re-run `pnpm test:docs`.

---

## Task 9: Final Verification and Review Gate

**Uses:** `superpowers:requesting-code-review`, `code-simplifier`, `deploy-checklist`, `superpowers:verification-before-completion`

**Files:**
- All modified files from previous tasks.

- [ ] **Step 1: Run full local verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm test:docs
pnpm eval:superpowers
pnpm eval:hardening -- --strict-architecture
pnpm -r test
git diff --check HEAD
```

Expected: all PASS.

- [ ] **Step 2: Multi-agent code review**

Dispatch at least three reviewers:

| Reviewer | Focus |
|---|---|
| Review A | `scripts/verify-docs.py` correctness, XML parsing, root injection, security/external refs. |
| Review B | SVG/README visual readability, accessibility, frontend design quality. |
| Review C | CI/test/dependency debt, docs handoff, source/render drift. |

All P0/P1 review findings must be fixed before completion.

- [ ] **Step 3: Code simplifier pass**

Run a focused code-simplifier review on recently modified code only:

```text
scripts/verify-docs.py
scripts/verify-docs.test.ts
scripts/eval-superpowers.ts
scripts/check-hardening.ts
```

Refactor only when behavior-preserving and tests remain green.

- [ ] **Step 4: Completion language**

Final status must distinguish:

```text
local_repo_ready: true/false
github_hosted_verified: true/false
```

Do not claim GitHub-hosted README is fixed until pushed and verified on github.com.

---

## Plan Self-Review

### Spec Coverage

| Spec requirement | Plan task |
|---|---|
| Self-contained SVG contract | Tasks 2, 3, 4, 5 |
| Compact README fallback mandatory | Task 4 |
| Fixture root injection | Tasks 1, 2 |
| CI docs gate | Task 6 |
| Runtime truth labels | Tasks 2, 3, 5 |
| Source/render boundary | Tasks 3, 7 |
| Documentation updates | Tasks 4, 7 |
| Deploy checklist and hosted caveat | Tasks 7, 8, 9 |
| Multi-agent review + simplifier | Task 9 |

### Placeholder Scan

This plan intentionally contains no `TBD`, no "implement later", and no unnamed test target. Compact SVG visual composition is constrained by exact labels, viewBox, style classes, forbidden SVG features, and verification gates.

### Type / Command Consistency

- Use `python3`, not `python`.
- Use `pnpm test:docs` as the CI docs gate.
- Use `--root <path>` for all fixture verifier tests.
- Keep `codex-runner` as executor label and avoid `packages/adapter-codex`.

---

## Multi-Agent Plan Review Results

| Reviewer | Focus | Blocking Findings | Plan Patch |
|---|---|---|---|
| A | TDD and fixture execution | README SVG discovery was too broad; missing-file fixture was absent. | Scoped discovery to the architecture one-page link block and added missing embed SVG RED test. |
| B | Frontend SVG readability | Compact SVG was under-specified; light/dark/mobile screenshot evidence was not concrete enough. | Added a concrete `720x540` SVG skeleton, palette constraints, title/desc requirements, and Browser Use preview files/screenshots. |
| C | CI and tech debt | CI/eval checks used brittle object regex examples; `status.ts` truth and existing `python` docs drift were not gated. | Switched eval snippets to parsed script fields, added `check_status_truth(root)`, and required replacing `python scripts/verify-docs.py` docs examples with `python3`. |

All P0/P1 plan-review findings are incorporated before implementation begins.
