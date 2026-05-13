# Obsidian Board Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `superpowers:test-driven-development`: write the failing test first, run it and confirm the intended failure, then implement the smallest production change.

**Goal:** Implement Phase 2 so `kanban board --write --space <space>` and `kanban board --write --all` generate Obsidian Kanban board files and Dataview index files from vault issue notes, while `kanban board --space <space>` prints the same Obsidian board contract without writing.

**Architecture:** Core owns registry parsing, vault path containment, issue scanning, Obsidian renderer, Dataview renderer, projection checksum, and board/index writes. CLI owns only argument parsing, explicit `KANBAN_HOME` enforcement, result formatting, and exit-code mapping. `issues/**/*.md` remain source of truth; `boards/**/*.md` are generated projections and Phase 3 alone reconciles board edits back to issues.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest one-shot `vitest run`, Node `fs/promises`, Node `crypto`, `yaml`, Obsidian Kanban markdown contract, Dataview DQL, `architecture`, `system-design`, `testing-strategy`, `documentation`, `deploy-checklist`, `tech-debt`, `context7` fallback evidence, `code-simplifier`.

---

## 0. Spec and Harness Gate

Source spec:

- `docs/superpowers/specs/2026-05-13-obsidian-board-write-spec.md`
- `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`
- `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`

Harness routing:

| Work | Harness/plugin |
| --- | --- |
| Current external syntax | `context7` first; quota exceeded in this session, so use upstream Obsidian Kanban clone and Dataview official docs fallback already recorded in the spec. |
| Design boundaries | `architecture`, `system-design` |
| Plan execution | `superpowers:subagent-driven-development` |
| Implementation style | `superpowers:test-driven-development` |
| Test matrix | `testing-strategy` |
| Docs/runbook | `documentation`, `deploy-checklist` |
| Debt guard | `tech-debt`, `code-simplifier` |
| Completion | `superpowers:verification-before-completion` |
| Review | `superpowers:requesting-code-review`, `code-review`, `code-simplifier` |

Before coding, confirm:

```bash
pnpm install --frozen-lockfile
pnpm -r build
git status --short
test -f docs/superpowers/specs/2026-05-13-obsidian-board-write-spec.md
test -f docs/superpowers/plans/2026-05-12-obsidian-board-write-plan.md
```

Expected: dependency and dist baselines exist, dirty Phase 1 changes may exist, and the two Phase 2 docs exist. Targeted RED failures below must be missing-module or missing-assertion failures from the new Phase 2 tests, not workspace `dist` or install setup failures.

## 1. File Responsibility Map

Create:

- `packages/core/src/boards/obsidian-board-renderer.ts`
- `packages/core/src/boards/dataview-index-renderer.ts`
- `packages/core/src/boards/board-projection.ts`
- `packages/core/tests/obsidian-board-renderer.test.ts`
- `packages/core/tests/board-projection.test.ts`
- `packages/cli/tests/obsidian-board.test.ts`

Modify:

- `packages/core/src/index.ts`
- `packages/core/src/boards/board-generator.ts` only if shared constants/types are needed; keep legacy tests green.
- `packages/cli/src/commands/board.ts`
- `packages/cli/src/index.ts`
- `docs/kanban-runtime.md`
- `docs/deploy-checklist.md`

Do not modify:

- `packages/cli/src/vault.ts` except if a compile error forces a narrow type export. New traversal/parser logic must not be added there.
- Any live vault under `~/.openclaw/workspace-kanban/kanban`.

## 2. Task Decomposition and Worker Ownership

If using subagents, assign disjoint write scopes:

| Worker | Scope |
| --- | --- |
| Worker A | `packages/core/src/boards/obsidian-board-renderer.ts`, `packages/core/tests/obsidian-board-renderer.test.ts` |
| Worker B | `packages/core/src/boards/dataview-index-renderer.ts`, `packages/core/src/boards/board-projection.ts`, `packages/core/tests/board-projection.test.ts` |
| Worker C | `packages/cli/src/commands/board.ts`, `packages/cli/src/index.ts`, `packages/cli/tests/obsidian-board.test.ts` |
| Worker D | `docs/kanban-runtime.md`, `docs/deploy-checklist.md`, runtime smoke evidence |

Workers are not alone in the codebase. They must not revert other workers' edits, Phase 1 authoring changes, or unrelated dirty files.

## Task 1: Obsidian Kanban Renderer

**Files:**

- Create: `packages/core/src/boards/obsidian-board-renderer.ts`
- Create: `packages/core/tests/obsidian-board-renderer.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `packages/core/tests/obsidian-board-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeBoardProjectionChecksum,
  renderObsidianBoardMarkdown,
  type ObsidianBoardIssue,
} from '../src/boards/obsidian-board-renderer';

const issues: ObsidianBoardIssue[] = [
  {
    id: 'VC-001',
    title: 'Top priority ready',
    type: 'task',
    status: 'READY',
    priority: 'P0',
    project: 'kanban-task-engine',
    epic: 'VC-100',
    updated: '2026-05-13T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-top-priority-ready.md',
  },
  {
    id: 'VC-002',
    title: 'Done item',
    type: 'task',
    status: 'DONE',
    priority: 'P2',
    project: 'kanban-task-engine',
    updated: '2026-05-12T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-002-done-item.md',
  },
  {
    id: 'VC-003',
    title: 'A ]] tricky | title\nnext',
    type: 'task',
    status: 'TODO',
    project: 'kanban-task-engine',
    updated: '2026-05-12T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-003-tricky.md',
  },
  {
    id: 'VC-900',
    title: 'Epic should be indexed elsewhere',
    type: 'epic',
    status: 'TODO',
    priority: 'P1',
    project: '',
    updated: '2026-05-11T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/_epics/VC-900-epic.md',
  },
];

describe('Obsidian board renderer', () => {
  it('renders an Obsidian Kanban board with all status lanes and no dummy cards', () => {
    const markdown = renderObsidianBoardMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issues,
    });

    expect(markdown).toContain('kanban-plugin: board');
    expect(markdown.startsWith('---\nkanban-plugin: board\n')).toBe(true);
    expect(markdown).toContain('GENERATED PROJECTION by kanban-task-engine');
    for (const status of ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED']) {
      expect(markdown).toContain(`## ${status}`);
    }
    expect(markdown).not.toContain('- No issues');
    expect(markdown).not.toContain('Epic should be indexed elsewhere');
  });

  it('renders issue cards as wikilinks with reconciliation metadata', () => {
    const markdown = renderObsidianBoardMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issues,
    });
    const checksum = computeBoardProjectionChecksum(issues[0]);

    expect(markdown).toContain(
      `- [ ] [[issues/vibe-coding/kanban-task-engine/VC-001-top-priority-ready|VC-001 Top priority ready]] \`P0\` <!-- kanban-task-engine:id=VC-001 status=READY checksum=${checksum} source=issues/vibe-coding/kanban-task-engine/VC-001-top-priority-ready.md generatedAt=2026-05-13T01:00:00.000Z -->`,
    );
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('formats hostile titles as one safe wikilink alias and defaults missing priority', () => {
    const markdown = renderObsidianBoardMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issues,
    });

    expect(markdown).toContain('[[issues/vibe-coding/kanban-task-engine/VC-003-tricky|VC-003 A ] ] tricky / title next]] `P2`');
    expect(markdown).not.toContain('| title\nnext');
  });

  it('renders a Kanban settings footer in the upstream parser shape', () => {
    const markdown = renderObsidianBoardMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issues,
    });

    expect(markdown).toContain('%% kanban:settings\n```\n');
    expect(markdown).not.toContain('```json');
    expect(markdown).toContain('"metadataKey":"status"');
    expect(markdown).toContain('"containsMarkdown":false');
    expect(markdown.trimEnd().endsWith('%%')).toBe(true);
  });
});
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/obsidian-board-renderer.test.ts
```

Expected: FAIL because `../src/boards/obsidian-board-renderer` does not exist.

- [ ] **Step 3: Implement renderer**

Create `packages/core/src/boards/obsidian-board-renderer.ts`:

```ts
import { createHash } from 'crypto';
import { ISSUE_STATUSES, type IssueStatus } from '@kanban-task-engine/schema';

export interface ObsidianBoardIssue {
  id: string;
  title: string;
  type: string;
  status: IssueStatus;
  project: string;
  updated: string;
  relativePath: string;
  epic?: string;
  priority?: string;
}

export interface RenderObsidianBoardOptions {
  space: string;
  generatedAt: string;
  issues: ObsidianBoardIssue[];
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const WARNING = '<!-- GENERATED PROJECTION by kanban-task-engine. issues/**/*.md are source of truth. Moving existing cards is a pending proposal until reconcile-board --apply. Do not create/delete cards or edit kanban-task-engine metadata. -->';
const METADATA_KEYS = ['status', 'priority', 'project', 'epic', 'updated'] as const;

export function renderObsidianBoardMarkdown(options: RenderObsidianBoardOptions): string {
  const issues = options.issues
    .filter(issue => issue.type !== 'epic')
    .sort(compareIssues);
  const lines: string[] = [
    '---',
    'kanban-plugin: board',
    'kanban-task-engine:',
    `  generatedAt: "${options.generatedAt}"`,
    `  space: ${options.space}`,
    '  source: issues',
    '---',
    '',
    WARNING,
    '',
  ];

  for (const status of ISSUE_STATUSES) {
    lines.push(`## ${status}`, '');
    for (const issue of issues.filter(item => item.status === status)) {
      lines.push(renderCard(issue, options.generatedAt));
    }
    lines.push('');
  }

  lines.push(renderKanbanSettingsFooter());
  return `${lines.join('\n').trimEnd()}\n`;
}

export function computeBoardProjectionChecksum(issue: ObsidianBoardIssue): string {
  const payload = stableStringify({
    epic: issue.epic ?? '',
    id: issue.id,
    priority: issue.priority,
    project: issue.project,
    relativePath: issue.relativePath,
    status: issue.status,
    title: issue.title,
    type: issue.type,
    updated: issue.updated,
  });
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function renderCard(issue: ObsidianBoardIssue, generatedAt: string): string {
  const linkTarget = stripMarkdownExtension(issue.relativePath);
  const alias = formatCardAlias(issue);
  const priority = issue.priority ?? 'P2';
  const checksum = computeBoardProjectionChecksum(issue);
  return `- [ ] [[${linkTarget}|${alias}]] \`${priority}\` <!-- kanban-task-engine:id=${issue.id} status=${issue.status} checksum=${checksum} source=${issue.relativePath} generatedAt=${generatedAt} -->`;
}

function formatCardAlias(issue: ObsidianBoardIssue): string {
  const title = issue.title
    .replace(/\s+/g, ' ')
    .replace(/\]\]/g, '] ]')
    .replace(/\|/g, '/')
    .trim();
  const alias = `${issue.id} ${title}`.trim();
  return alias.length > 120 ? `${alias.slice(0, 117)}...` : alias;
}

function renderKanbanSettingsFooter(): string {
  const metadataKeys = METADATA_KEYS.map(metadataKey => ({
    metadataKey,
    label: '',
    shouldHideLabel: false,
    containsMarkdown: false,
  }));
  return [
    '%% kanban:settings',
    '```',
    JSON.stringify({ 'kanban-plugin': 'board', 'metadata-keys': metadataKeys }),
    '```',
    '%%',
  ].join('\n');
}

function stripMarkdownExtension(relativePath: string): string {
  return relativePath.endsWith('.md') ? relativePath.slice(0, -3) : relativePath;
}

function compareIssues(a: ObsidianBoardIssue, b: ObsidianBoardIssue): number {
  return (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
    || a.id.localeCompare(b.id);
}

function stableStringify(input: unknown): string {
  if (input === null || input === undefined) return 'null';
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(stableStringify).join(',')}]`;
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
```

Modify `packages/core/src/index.ts`:

```ts
export {
  computeBoardProjectionChecksum,
  renderObsidianBoardMarkdown,
} from './boards/obsidian-board-renderer';
export type {
  ObsidianBoardIssue,
  RenderObsidianBoardOptions,
} from './boards/obsidian-board-renderer';
```

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/obsidian-board-renderer.test.ts
```

Expected: PASS.

## Task 2: Dataview Index Renderer

**Files:**

- Create: `packages/core/src/boards/dataview-index-renderer.ts`
- Modify: `packages/core/tests/obsidian-board-renderer.test.ts` or create Dataview tests inside `packages/core/tests/board-projection.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing Dataview renderer tests**

Modify the top import block in `packages/core/tests/obsidian-board-renderer.test.ts` to also import Dataview rendering, then append the new `describe` block:

```ts
import { renderDataviewIndexMarkdown } from '../src/boards/dataview-index-renderer';

describe('Dataview index renderer', () => {
  it('renders issue and epic Dataview queries without Kanban markers', () => {
    const markdown = renderDataviewIndexMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issueRoot: 'issues/vibe-coding',
      epicRoot: 'issues/vibe-coding/_epics',
    });

    expect(markdown).toContain('GENERATED PROJECTION by kanban-task-engine');
    expect(markdown).toContain('TABLE status, priority, project, epic, updated');
    expect(markdown).toContain('FROM "issues/vibe-coding"');
    expect(markdown).toContain('WHERE type != "epic"');
    expect(markdown).toContain('FROM "issues/vibe-coding/_epics"');
    expect(markdown).not.toContain('kanban-plugin: board');
    expect(markdown).not.toContain('%% kanban:settings');
  });
});
```

- [ ] **Step 2: Run Dataview tests and verify RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/obsidian-board-renderer.test.ts
```

Expected: FAIL because `dataview-index-renderer` does not exist.

- [ ] **Step 3: Implement Dataview renderer**

Create `packages/core/src/boards/dataview-index-renderer.ts`:

```ts
export interface RenderDataviewIndexOptions {
  space: string;
  generatedAt: string;
  issueRoot: string;
  epicRoot: string;
}

const WARNING = '<!-- GENERATED PROJECTION by kanban-task-engine. issues/**/*.md are source of truth. This Dataview index is read-only from the engine perspective. -->';

export function renderDataviewIndexMarkdown(options: RenderDataviewIndexOptions): string {
  return `${[
    WARNING,
    '',
    `# ${options.space} Index`,
    '',
    `Generated: ${options.generatedAt}`,
    '',
    '## Issues',
    '',
    '```dataview',
    'TABLE status, priority, project, epic, updated',
    `FROM "${options.issueRoot}"`,
    'WHERE type != "epic"',
    'SORT status ASC, priority ASC, updated DESC',
    '```',
    '',
    '## Epics',
    '',
    '```dataview',
    'TABLE status, priority, updated',
    `FROM "${options.epicRoot}"`,
    'WHERE type = "epic"',
    'SORT updated DESC',
    '```',
  ].join('\n').trimEnd()}\n`;
}
```

Modify `packages/core/src/index.ts`:

```ts
export { renderDataviewIndexMarkdown } from './boards/dataview-index-renderer';
export type { RenderDataviewIndexOptions } from './boards/dataview-index-renderer';
```

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/obsidian-board-renderer.test.ts
```

Expected: PASS.

## Task 3: Core Projection Writer and Path Safety

**Files:**

- Create: `packages/core/src/boards/board-projection.ts`
- Create: `packages/core/tests/board-projection.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing projection tests**

Create `packages/core/tests/board-projection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
} from '../src/boards/board-projection';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-board-projection-'));
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/openclaw'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/openclaw/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
`);
  await writeIssue(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md', {
    id: 'VC-001',
    title: 'Ready item',
    type: 'task',
    status: 'READY',
    priority: 'P1',
    project: 'kanban-task-engine',
  });
  await writeIssue(vault, 'issues/vibe-coding/_epics/VC-900-epic.md', {
    id: 'VC-900',
    title: 'Epic',
    type: 'epic',
    status: 'TODO',
    priority: 'P1',
    project: '',
  });
  await writeIssue(vault, 'issues/openclaw/OC-001-todo.md', {
    id: 'OC-001',
    title: 'OpenClaw todo',
    type: 'task',
    status: 'TODO',
    priority: 'P2',
    project: '',
  });
  return vault;
}

async function writeIssue(vault: string, relativePath: string, fields: Record<string, string>): Promise<void> {
  const body = fields.type === 'epic'
    ? ['## 목표', 'x', '', '## 범위', 'x', '', '## 성공 지표', 'x', '', '## 하위 티켓', 'x', '', '## 로그', 'x'].join('\n')
    : ['## 목적', 'x', '', '## 컨텍스트', 'x', '', '## Acceptance Criteria', 'x', '', '## 실행 힌트', 'x', '', '## 로그', 'x'].join('\n');
  await fs.writeFile(path.join(vault, relativePath), `---
executor: human
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}
---

# ${fields.title}

${body}
`);
}

describe('board projection writer', () => {
  it('collects a space projection and excludes epics from the main board', async () => {
    const vault = await createVault();
    const projection = await collectBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(projection.boardMarkdown).toContain('kanban-plugin: board');
    expect(projection.boardMarkdown).toContain('VC-001 Ready item');
    expect(projection.boardMarkdown).not.toContain('VC-900 Epic');
    expect(projection.indexMarkdown).toContain('FROM "issues/vibe-coding"');
    expect(projection.boardPath).toBe(path.join(vault, 'boards/vibe-coding.md'));
    expect(projection.indexPath).toBe(path.join(vault, 'boards/vibe-coding-epics.md'));
  });

  it('writes board and index files for one space', async () => {
    const vault = await createVault();
    const result = await writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(result.space).toBe('vibe-coding');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-plugin: board');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('```dataview');
  });

  it('writes every registry space for --all', async () => {
    const vault = await createVault();
    const results = await writeBoardProjections({
      vaultRoot: vault,
      all: true,
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(results.map(result => result.space)).toEqual(['vibe-coding', 'openclaw']);
    await expect(fs.readFile(path.join(vault, 'boards/openclaw.md'), 'utf8')).resolves.toContain('OC-001 OpenClaw todo');
  });

  it.each([
    ['absolute board path', 'board: boards/vibe-coding.md', 'board: /tmp/evil.md'],
    ['traversal board path', 'board: boards/vibe-coding.md', 'board: ../evil.md'],
    ['backslash board path', 'board: boards/vibe-coding.md', 'board: boards\\\\evil.md'],
    ['duplicate separator board path', 'board: boards/vibe-coding.md', 'board: boards//evil.md'],
    ['nul board path', 'board: boards/vibe-coding.md', 'board: "boards/evil\\u0000.md"'],
    ['unsafe epicBoard path', 'epicBoard: boards/vibe-coding-epics.md', 'epicBoard: ../evil.md'],
    ['unsafe issues root', 'issues: issues/vibe-coding', 'issues: ../issues/vibe-coding'],
    ['unsafe epics root', 'epics: issues/vibe-coding/_epics', 'epics: issues//vibe-coding/_epics'],
    ['unsafe project root', 'path: issues/vibe-coding/kanban-task-engine', 'path: /tmp/project'],
  ])('rejects unsafe registry %s before writing', async (_name, search, replacement) => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace(search, replacement));
    await fs.mkdir(path.join(vault, 'boards'), { recursive: true });
    await fs.writeFile(path.join(vault, 'boards/vibe-coding.md'), 'existing board\n');

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/unsafe|relative safe path|Vault path escapes root/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toBe('existing board\n');
  });

  it('rejects board and issue symlink escapes before writing', async () => {
    const vault = await createVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-board-outside-'));
    await fs.symlink(outside, path.join(vault, 'escape'));
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(
      registryPath,
      original
        .replace('board: boards/vibe-coding.md', 'board: escape/vibe-coding.md')
        .replace('path: issues/vibe-coding/kanban-task-engine', 'path: escape/project'),
    );
    await fs.mkdir(path.join(vault, 'boards'), { recursive: true });
    await fs.writeFile(path.join(vault, 'boards/vibe-coding.md'), 'existing board\n');

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/Vault path escapes root/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toBe('existing board\n');
  });

  it('requires board and epicBoard paths for the selected space', async () => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace('    board: boards/vibe-coding.md\n', ''));

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/board|required|string/i);
  });

  it('validates issue frontmatter against registry prefix and space type', async () => {
    const vault = await createVault();
    await writeIssue(vault, 'issues/openclaw/OC-002-empty-project.md', {
      id: 'OC-002',
      title: 'Single space empty project is valid',
      type: 'task',
      status: 'READY',
      priority: 'P2',
      project: '',
    });
    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'openclaw',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).resolves.toMatchObject({ space: 'openclaw' });

    await writeIssue(vault, 'issues/openclaw/WRONG-001-bad-prefix.md', {
      id: 'WRONG-001',
      title: 'Bad prefix',
      type: 'task',
      status: 'TODO',
      priority: 'P2',
      project: '',
    });
    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'openclaw',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/expected prefix OC/i);
  });

  it('preflights every --all space before writing any projection', async () => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace('board: boards/openclaw.md', 'board: ../openclaw.md'));

    await expect(writeBoardProjections({
      vaultRoot: vault,
      all: true,
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/unsafe|relative safe path|Vault path escapes root/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails before writing when a selected issue is schema-invalid', async () => {
    const vault = await createVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-999-bad.md'), `---
id: VC-999
title: Bad
type: task
status: READY
---

# Bad
`);

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/schema|frontmatter|Missing required field/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

- [ ] **Step 2: Run projection tests and verify RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-projection.test.ts
```

Expected: FAIL because `board-projection` does not exist.

- [ ] **Step 3: Implement projection writer**

Create `packages/core/src/boards/board-projection.ts` with these public types/functions:

```ts
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import {
  validateIssueFrontmatterForRegistry,
  type IssueFrontmatter,
  type IssueStatus,
} from '@kanban-task-engine/schema';
import {
  getRegistrySpace,
  listRegistrySpaces,
  loadRegistry,
  type RegistrySpace,
} from '../store/registry';
import { atomicWriteFile } from '../store/fs-utils';
import { resolveVaultPath } from '../store/vault-path';
import {
  renderObsidianBoardMarkdown,
  type ObsidianBoardIssue,
} from './obsidian-board-renderer';
import { renderDataviewIndexMarkdown } from './dataview-index-renderer';

export interface CollectBoardProjectionOptions {
  vaultRoot: string;
  space: string;
  generatedAt?: string;
}

export interface WriteBoardProjectionOptions extends CollectBoardProjectionOptions {}

export interface WriteBoardProjectionsOptions {
  vaultRoot: string;
  all: true;
  generatedAt?: string;
}

export interface BoardProjection {
  space: string;
  boardPath: string;
  indexPath: string;
  boardRelativePath: string;
  indexRelativePath: string;
  issueCount: number;
  boardMarkdown: string;
  indexMarkdown: string;
}

export type BoardProjectionWriteResult = Omit<BoardProjection, 'boardMarkdown' | 'indexMarkdown'>;
```

Implement behavior:

- load `path.join(vaultRoot, 'registry.yaml')` through `loadRegistry`,
- use `getRegistrySpace` / `listRegistrySpaces`,
- resolve `space.board` and `space.epicBoard` with a helper that rejects empty, `\\`, `//`, absolute, `..`, NUL, and symlink escapes through `resolveVaultPath`,
- collect issue roots from `space.projects.*.path` for container spaces or `space.issues` for single spaces,
- collect epic root from `space.epics`,
- recursively scan `.md` files while ignoring dot dirs,
- parse each issue with a registry-aware parser, not bare `parseIssueMarkdown`,
- call `validateIssueFrontmatterForRegistry(frontmatter, { idPrefix: space.idPrefix, spaceType: space.type })` so single-space empty `project: ""` is valid and wrong id prefixes fail,
- validate required body sections using the same section names as Phase 1 authoring (`목적`, `컨텍스트`, `Acceptance Criteria`, `실행 힌트`, `로그` for tasks; `목표`, `범위`, `성공 지표`, `하위 티켓`, `로그` for epics),
- reject parse/schema errors in write/collect path,
- map frontmatter to `ObsidianBoardIssue`,
- render board and index,
- create target directories and write with `atomicWriteFile`.

Use this helper shape:

```ts
function assertSafeRegistryPath(value: string, field: string): void {
  if (
    value.trim() === '' ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.includes('//') ||
    path.isAbsolute(value) ||
    value.split('/').includes('..')
  ) {
    throw new Error(`Unsafe registry ${field} path: ${value}`);
  }
}
```

Use this helper shape for registry-safe path resolution:

```ts
async function resolveRegistryVaultPath(vaultRoot: string, relativePath: string, field: string): Promise<string> {
  assertSafeRegistryPath(relativePath, field);
  return resolveVaultPath(vaultRoot, ...relativePath.split('/'));
}
```

Use this helper shape for issue parsing:

```ts
const TASK_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'];
const EPIC_SECTIONS = ['목표', '범위', '성공 지표', '하위 티켓', '로그'];

function parseIssueForRegistry(markdown: string, space: RegistrySpace): IssueFrontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) throw new Error('Invalid issue markdown: Missing YAML frontmatter');

  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    throw new Error(`Invalid issue markdown: Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = validateIssueFrontmatterForRegistry(frontmatter, {
    idPrefix: space.idPrefix,
    spaceType: space.type,
  });
  const errors = result.ok ? [] : [...result.errors];
  const sections = extractSections(normalized.slice(frontmatterMatch[0].length));
  const requiredSections = isRecord(frontmatter) && frontmatter.type === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS;
  for (const section of requiredSections) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) throw new Error(`Invalid issue markdown: ${errors.join('; ')}`);
  return result.value;
}
```

`writeBoardProjections({ all: true })` must first collect and validate every selected projection, including target paths and issue parsing, and only then perform writes. A failure in `openclaw` must leave the already-valid `vibe-coding` board/index unwritten.

Export:

```ts
export async function collectBoardProjection(options: CollectBoardProjectionOptions): Promise<BoardProjection>;
export async function writeBoardProjection(options: WriteBoardProjectionOptions): Promise<BoardProjectionWriteResult>;
export async function writeBoardProjections(options: WriteBoardProjectionsOptions): Promise<BoardProjectionWriteResult[]>;
```

Modify `packages/core/src/index.ts`:

```ts
export {
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
} from './boards/board-projection';
export type {
  BoardProjection,
  BoardProjectionWriteResult,
  CollectBoardProjectionOptions,
  WriteBoardProjectionOptions,
  WriteBoardProjectionsOptions,
} from './boards/board-projection';
```

- [ ] **Step 4: Run projection tests and verify GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/obsidian-board-renderer.test.ts tests/board-projection.test.ts
```

Expected: PASS.

## Task 4: CLI Board Command

**Files:**

- Modify: `packages/cli/src/commands/board.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/tests/obsidian-board.test.ts`
- Modify: `packages/cli/tests/index.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `packages/cli/tests/obsidian-board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-board-'));
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
`);
  await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), `---
id: VC-001
title: Ready item
type: task
status: READY
priority: P1
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Ready item

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x

## 로그
x
`);
  return vault;
}

describe('Obsidian board CLI', () => {
  it('prints one Obsidian board for --space without writing files', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--space', 'vibe-coding'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kanban-plugin: board');
    expect(result.stdout).toContain('VC-001 Ready item');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes board and index for --write --space', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--space', 'vibe-coding'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wrote vibe-coding board: boards/vibe-coding.md');
    expect(result.stdout).toContain('wrote vibe-coding index: boards/vibe-coding-epics.md');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-task-engine:id=VC-001');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('```dataview');
  });

  it('writes every space for --write --all', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--all'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wrote vibe-coding board: boards/vibe-coding.md');
  });

  it('rejects write without explicit KANBAN_HOME', async () => {
    const result = await runCli(['board', '--write', '--all'], createCliContext({ HOME: '/home/user' }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects invalid argument combinations', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault });

    expect((await runCli(['board', '--space'], context)).stderr).toContain('Missing value for --space');
    expect((await runCli(['board', '--wat'], context)).stderr).toContain('Unknown option: --wat');
    expect((await runCli(['board', '--all'], context)).stderr).toContain('--all requires --write');
    expect((await runCli(['board', '--write'], context)).stderr).toContain('Exactly one of --space or --all is required');
    expect((await runCli(['board', '--write', '--space', 'vibe-coding', '--all'], context)).stderr).toContain('Exactly one of --space or --all is required');
  });

  it('rejects unknown spaces before writing', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--space', 'missing'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown registry space: missing');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

Modify `packages/cli/tests/index.test.ts` help test expectation:

```ts
expect(result.stdout).toContain('board [--space <space>] [--write (--space <space>|--all)]');
```

- [ ] **Step 2: Run CLI tests and verify RED**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec vitest run tests/obsidian-board.test.ts tests/index.test.ts
```

Expected: FAIL because `commandBoard` does not parse these flags and help text does not mention the new shape.

- [ ] **Step 3: Implement CLI command**

Modify `packages/cli/src/commands/board.ts`:

```ts
import {
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
} from '@kanban-task-engine/core';
import { CliHandler, fail, ok } from '../index.js';
import { loadVaultIssueIndex, renderIssueBoard } from '../vault.js';

interface BoardArgs {
  write: boolean;
  all: boolean;
  space?: string;
}

export const commandBoard: CliHandler = async (args, context) => {
  const parsed = parseBoardArgs(args);
  if ('exitCode' in parsed) return parsed;

  if (parsed.write && !context.vaultRootExplicit) {
    return fail('KANBAN_HOME must be explicitly set for board --write');
  }

  try {
    if (parsed.write) {
      const generatedAt = new Date().toISOString();
      const results = parsed.all
        ? await writeBoardProjections({ vaultRoot: context.vaultRoot, all: true, generatedAt })
        : [await writeBoardProjection({ vaultRoot: context.vaultRoot, space: parsed.space as string, generatedAt })];
      return ok(results.map(result => [
        `wrote ${result.space} board: ${result.boardRelativePath}`,
        `wrote ${result.space} index: ${result.indexRelativePath}`,
        `issues: ${result.issueCount}`,
      ].join('\n')).join('\n'));
    }

    if (parsed.space) {
      const projection = await collectBoardProjection({
        vaultRoot: context.vaultRoot,
        space: parsed.space,
        generatedAt: new Date().toISOString(),
      });
      return ok(projection.boardMarkdown);
    }

    const index = await loadVaultIssueIndex(context.vaultRoot);
    return ok(renderIssueBoard('Kanban Board', index.issues, new Date().toISOString()));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseBoardArgs(args: string[]): BoardArgs | ReturnType<typeof fail> {
  const parsed: BoardArgs = { write: false, all: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--all') {
      parsed.all = true;
    } else if (arg === '--space') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) return fail('Missing value for --space');
      parsed.space = value;
      index += 1;
    } else {
      return fail(`Unknown option: ${arg}`);
    }
  }

  if (parsed.all && !parsed.write) {
    return fail('--all requires --write');
  }
  if (parsed.write && Number(Boolean(parsed.space)) + Number(parsed.all) !== 1) {
    return fail('Exactly one of --space or --all is required for board --write');
  }
  if (parsed.space && parsed.all) {
    return fail('Exactly one of --space or --all is required for board');
  }
  return parsed;
}
```

Modify `packages/cli/src/index.ts` help command line:

```ts
'  board [--space <space>] [--write (--space <space>|--all)]',
```

- [ ] **Step 4: Run CLI tests and verify GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec vitest run tests/obsidian-board.test.ts tests/index.test.ts
```

Expected: PASS.

## Task 5: Documentation, Deploy Checklist, and Built CLI Smoke

**Files:**

- Modify: `docs/kanban-runtime.md`
- Modify: `docs/deploy-checklist.md`
- Optional create: `packages/core/tests/board-runtime-smoke.test.ts` only if CLI smoke should be automated inside Vitest. Prefer direct built CLI command in final verification.

- [ ] **Step 1: Update runtime docs**

In `docs/kanban-runtime.md`, add these examples under lifecycle/projection commands:

```bash
DISPOSABLE_VAULT=$(mktemp -d)
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --space vibe-coding
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --write --space vibe-coding
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --write --all
```

Add this paragraph:

```md
`kanban board --write` writes generated projection files only. `boards/<space>.md` is an Obsidian Kanban board, and `boards/<space>-epics.md` is a Dataview index. These files are not source of truth; issue notes under `issues/**/*.md` remain authoritative. Moving an existing card in Obsidian is only a pending proposal until Phase 3 `kanban reconcile-board --apply` exists and succeeds.

Use a disposable vault for smoke tests. Do not point write examples at `$HOME/.openclaw/workspace-kanban/kanban` unless the operator explicitly approves mutating that live-adjacent vault for this run.
```

- [ ] **Step 2: Update deploy checklist**

In `docs/deploy-checklist.md`, add under Deploy:

```md
- [ ] After `pnpm -r build`, smoke test `DISPOSABLE_VAULT=$(mktemp -d)` plus `KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --write --all`.
- [ ] Confirm generated board files contain `kanban-plugin: board`, all six status lanes, no dummy cards, and `kanban-task-engine:id=... checksum=sha256:<64-hex>` metadata.
- [ ] Confirm generated index files contain Dataview queries and remain generated projections, not source-of-truth files.
```

Add rollback triggers:

```md
- `board --write` succeeds without explicit `KANBAN_HOME`.
- `board --write` writes outside the disposable vault or follows a symlink escape.
- Generated board/index files are edited or documented as source of truth.
- Generated cards omit issue id, source path, status, or projection checksum metadata.
```

- [ ] **Step 3: Run docs verification**

Run:

```bash
pnpm test:docs
pnpm docs:verify
```

Expected: PASS.

- [ ] **Step 4: Run built CLI disposable smoke**

Create a disposable vault with registry and at least one issue, then run:

```bash
DISPOSABLE_VAULT=$(mktemp -d)
mkdir -p "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine" "$DISPOSABLE_VAULT/issues/vibe-coding/_epics"
cat > "$DISPOSABLE_VAULT/registry.yaml" <<'YAML'
spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
YAML
cat > "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine/VC-001-ready.md" <<'MD'
---
id: VC-001
title: Ready item
type: task
status: READY
priority: P1
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Ready item

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x

## 로그
x
MD
pnpm -r build
KANBAN_HOME="$DISPOSABLE_VAULT" node packages/cli/dist/bin.js board --write --all
```

Check:

```bash
test -f "$DISPOSABLE_VAULT/boards/vibe-coding.md"
test -f "$DISPOSABLE_VAULT/boards/vibe-coding-epics.md"
grep -q 'kanban-plugin: board' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q '## TODO' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q '## FAILED' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q 'kanban-task-engine:id=VC-001' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -Eq 'checksum=sha256:[a-f0-9]{64}' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q '```dataview' "$DISPOSABLE_VAULT/boards/vibe-coding-epics.md"
set +e
env -u KANBAN_HOME node packages/cli/dist/bin.js board --write --all >/tmp/kanban-no-home.out 2>/tmp/kanban-no-home.err
NO_HOME_EXIT=$?
set -e
test "$NO_HOME_EXIT" -ne 0
grep -q 'KANBAN_HOME must be explicitly set' /tmp/kanban-no-home.err
```

Expected: all commands exit 0.

## Task 6: Review, Simplification, and Final Verification

**Files:** recently modified Phase 2 code/docs only.

- [ ] **Step 1: Request multi-agent code review**

Use `superpowers:requesting-code-review` and at least three agents:

1. Architecture/runtime boundary reviewer: source-of-truth, path containment, partial writes.
2. Obsidian/Dataview reviewer: file-shape, settings footer, no Dataview Kanban markers.
3. Testing/tech-debt reviewer: RED/GREEN evidence, CLI parser matrix, docs/deploy gates.

- [ ] **Step 2: Request code simplifier review**

Use `code-simplifier` on recently modified files. It should focus on:

- duplicated CLI parser branches,
- board projection helper size,
- confusing checksum naming,
- unnecessary abstractions.

- [ ] **Step 3: Apply P0/P1 and accepted P2 fixes**

Use `superpowers:receiving-code-review` if review feedback is unclear. Convert any behavioral review finding into a failing test first before production changes.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm -r build
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts tests/obsidian-board-renderer.test.ts tests/board-projection.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/index.test.ts tests/obsidian-board.test.ts
pnpm -r test
pnpm test:docs
pnpm docs:verify
git diff --check
```

Then repeat this built CLI smoke with a fresh disposable vault:

```bash
DISPOSABLE_VAULT=$(mktemp -d)
mkdir -p "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine" "$DISPOSABLE_VAULT/issues/vibe-coding/_epics"
cat > "$DISPOSABLE_VAULT/registry.yaml" <<'YAML'
spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
YAML
cat > "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine/VC-001-ready.md" <<'MD'
---
id: VC-001
title: Ready item
type: task
status: READY
priority: P1
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Ready item

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x

## 로그
x
MD
KANBAN_HOME="$DISPOSABLE_VAULT" node packages/cli/dist/bin.js board --write --all
grep -q 'kanban-plugin: board' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -Eq 'checksum=sha256:[a-f0-9]{64}' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q '```dataview' "$DISPOSABLE_VAULT/boards/vibe-coding-epics.md"
```

Expected acceptance labels:

- Code-level green: targeted and full tests pass.
- Disposable vault green: built CLI writes board/index files into temp vault.
- Obsidian file-shape green: renderer tests and smoke confirm `kanban-plugin: board`, lanes, metadata comment, settings footer, and Dataview query shape.

Do not claim:

- Obsidian GUI green.
- Live-adjacent vault green.
- Agent E2E green.

## Self-Review Checklist

- Spec coverage: every Phase 2 spec section maps to at least one task above.
- Placeholder scan: no `TBD`, no implementation-later placeholders.
- Type consistency: `ObsidianBoardIssue`, `BoardProjection`, and CLI result names match across tasks.
- Runtime command correctness: built CLI uses `node packages/cli/dist/bin.js`, not a missing `pnpm ... start` script.
- Source-of-truth boundary: generated `boards/**/*.md` are projection only.
