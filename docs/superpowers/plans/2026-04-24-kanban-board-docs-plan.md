# Kanban Board and Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate registry-aware Markdown boards and Epic indexes, wire stale-board checking into the CLI, and publish accurate MVP docs and examples without claiming unsupported execution or sync behavior.

**Architecture:** Core owns deterministic board and Epic index rendering from registry spaces plus parsed Markdown tasks. The CLI delegates board generation and stale checking to core services, while docs and examples describe only the inspection, validation, and board-rendering MVP surface.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, Node `fs/promises`, Node `path`, Markdown, YAML frontmatter, existing `MarkdownStore`, `WorkspaceResolver`, and `renderBoardMarkdown()` patterns.

---

## File Structure

**Modify:**

- `packages/core/src/boards/board-generator.ts` - extend board card rendering to exclude Epics, render project labels, support relative links, and add Epic index rendering plus broken-reference diagnostics.
- `packages/core/src/index.ts` - export new board renderer types and functions.
- `packages/core/tests/board-generator.test.ts` - add TDD coverage for main boards, Epic indexes, duplicate Epic ids, broken Epic references, and deterministic output.
- `packages/cli/src/commands/render-board.ts` - wire registry-aware rendering, `--check`, stale path reporting, and selected-space behavior into the user-facing CLI from `2026-04-24-kanban-cli-mvp-spec.md`.
- `packages/cli/tests/commands/render-board.test.ts` - test writing boards, check mode, stale detection, warning output, and no-write behavior.
- `packages/cli/tests/fixtures/minimal-vault/**` - either replace with a copy of `examples/minimal-vault` or keep it synchronized by fixture helper.
- `README.md` - replace the current title-only root README with the required README contract.
- `docs/getting-started.md` - document install/build, `examples/minimal-vault`, `kanban doctor`, `kanban validate`, and `kanban render-board`.
- `docs/architecture.md` - document Markdown issue control-plane architecture and explicit non-goals.
- `docs/schema.md` - document frontmatter, issue types, statuses, Epic relationships, and generated boards.
- `docs/vault-layout.md` - document registry fields, issue roots, `_epics`, boards, and example vault layout.
- `docs/cli.md` - document only implemented CLI commands and exit codes.
- `docs/execution-harness.md` - mark execution harness as planned and avoid `kanban run` quick-start claims.
- `docs/adapters/claude-code.md` - document status label and current scope.
- `docs/adapters/openclaw.md` - document status label and current scope.
- `docs/adapters/jira.md` - document status label and current scope, including no bidirectional Jira sync.
- `docs/adapters/github.md` - document status label and current scope.
- `docs/adapters/firebase.md` - document status label and current scope.
- Historical plan docs under `docs/superpowers/plans/2026-04-23-*.md` - add a short historical/superseded label only where steps no longer match the current schema decomposition.

**Create:**

- `examples/minimal-vault/registry.yaml` - minimal two-space registry.
- `examples/minimal-vault/issues/openclaw/OC-001-sample-task.md` - non-Epic single-space issue.
- `examples/minimal-vault/issues/openclaw/_epics/OC-010-sample-epic.md` - single-space Epic.
- `examples/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md` - non-Epic container-project issue.
- `examples/minimal-vault/issues/vibe-coding/_epics/VC-010-sample-epic.md` - container-space Epic.
- `examples/minimal-vault/boards/openclaw.md` - generated main board fixture.
- `examples/minimal-vault/boards/openclaw-epics.md` - generated Epic index fixture.
- `examples/minimal-vault/boards/vibe-coding.md` - generated main board fixture.
- `examples/minimal-vault/boards/vibe-coding-epics.md` - generated Epic index fixture.

**Do not modify:**

- Web UI files or browser-facing app code.
- Drag/drop, realtime collaboration, mobile sync, or Jira bidirectional sync code paths.
- Execution command implementation such as `kanban run`, `kanban approve`, or executor adapters beyond docs status labels.
- Files outside the task currently being executed. Other agents may be editing adjacent docs.

## Preconditions

- Work from `~/.config/superpowers/worktrees/kanban-task-engine/docs-gpt55-review-specs` on branch `docs/gpt55-review-specs`.
- Run `git status --short` before each task. If unrelated files are modified, leave them alone.
- This plan assumes the contract hardening, vault store, and CLI MVP plans have either landed or are being implemented in dependency order. If `packages/cli` does not exist yet, run the CLI MVP plan first or create only the tests in this plan after the package exists.
- Use exact commands from this plan. If a command fails because an upstream plan has not landed, stop and record the missing dependency instead of widening scope.

## Task 1: Lock Main Board Rendering Contract

**Files:**

- Modify: `packages/core/tests/board-generator.test.ts`
- Modify: `packages/core/src/boards/board-generator.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing main-board tests**

Replace the current single test in `packages/core/tests/board-generator.test.ts` with this test block while keeping the existing imports updated as shown:

```typescript
import { describe, expect, it } from 'vitest';
import { renderBoardMarkdown } from '../src/boards/board-generator';

describe('board generator', () => {
  it('renders a registry-aware main board for non-Epic issues only', () => {
    const markdown = renderBoardMarkdown({
      boardTitle: 'Vibe Coding',
      boardPath: 'boards/vibe-coding.md',
      generatedAt: '2026-04-24T00:00:00.000Z',
      issues: [
        {
          id: 'VC-010',
          title: 'Sample Epic',
          status: 'READY',
          priority: 'Critical',
          project: 'space:vibe-coding',
          path: 'issues/vibe-coding/_epics/VC-010-sample-epic.md',
          issueType: 'Epic',
        },
        {
          id: 'VC-001',
          title: 'Sample Task',
          status: 'READY',
          priority: 'High',
          project: 'kanban-task-engine',
          path: 'issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md',
          issueType: 'Task',
        },
      ],
    });

    expect(markdown).toContain('<!-- GENERATED BY kanban-task-engine. DO NOT EDIT DIRECTLY. -->');
    expect(markdown).toContain('type: kanban-board');
    expect(markdown).toContain('# Vibe Coding');
    expect(markdown).toContain('## TODO');
    expect(markdown).toContain('## READY');
    expect(markdown).toContain('- [Sample Task](../issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md) `High` `kanban-task-engine` <!-- VC-001 -->');
    expect(markdown).not.toContain('Sample Epic');
  });

  it('renders a single-space project label when project is omitted', () => {
    const markdown = renderBoardMarkdown({
      boardTitle: 'OpenClaw',
      boardPath: 'boards/openclaw.md',
      generatedAt: '2026-04-24T00:00:00.000Z',
      issues: [
        {
          id: 'OC-001',
          title: 'Sample Task',
          status: 'TODO',
          priority: 'Medium',
          project: '',
          space: 'openclaw',
          path: 'issues/openclaw/OC-001-sample-task.md',
          issueType: 'Task',
        },
      ],
    });

    expect(markdown).toContain('- [Sample Task](../issues/openclaw/OC-001-sample-task.md) `Medium` `space:openclaw` <!-- OC-001 -->');
  });
});
```

- [ ] **Step 2: Run board tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- board-generator.test.ts
```

Expected: FAIL with TypeScript errors for missing `boardPath`, `issueType`, or `space` fields, and assertion failures for the missing project label.

- [ ] **Step 3: Extend board renderer types and card rendering**

Edit `packages/core/src/boards/board-generator.ts` so these public types and helpers exist:

```typescript
import path from 'node:path';
import { IssueStatus, ISSUE_STATUSES } from '@kanban-task-engine/schema';

export interface BoardIssue {
  id: string;
  title: string;
  status: IssueStatus;
  priority: string;
  project?: string;
  space?: string;
  path: string;
  issueType?: string;
  epic?: string;
}

export interface RenderBoardOptions {
  boardTitle: string;
  boardPath: string;
  generatedAt: string;
  issues: BoardIssue[];
}

function isEpic(issue: BoardIssue): boolean {
  return issue.issueType === 'Epic' || issue.issueType === 'epic';
}

function projectLabel(issue: BoardIssue): string {
  if (issue.project && issue.project.trim().length > 0) return issue.project;
  if (issue.space && issue.space.trim().length > 0) return `space:${issue.space}`;
  return 'space:unknown';
}

function relativeIssueLink(boardPath: string, issuePath: string): string {
  const relative = path.posix.relative(path.posix.dirname(boardPath), issuePath);
  return relative.startsWith('.') ? relative : `./${relative}`;
}
```

Update `renderBoardMarkdown()` so it filters out Epics and renders card lines with the spec shape:

```typescript
export function renderBoardMarkdown(options: RenderBoardOptions): string {
  const lines: string[] = [
    '<!-- GENERATED BY kanban-task-engine. DO NOT EDIT DIRECTLY. -->',
    '---',
    'type: kanban-board',
    `title: ${options.boardTitle}`,
    `generatedAt: ${options.generatedAt}`,
    '---',
    '',
    `# ${options.boardTitle}`,
    '',
  ];

  const cards = options.issues.filter(issue => !isEpic(issue));

  for (const status of ISSUE_STATUSES) {
    lines.push(`## ${status}`, '');
    const issues = cards.filter(issue => issue.status === status);
    if (issues.length === 0) {
      lines.push('- No issues', '');
      continue;
    }
    for (const issue of issues) {
      lines.push(`- [${issue.title}](${relativeIssueLink(options.boardPath, issue.path)}) \`${issue.priority}\` \`${projectLabel(issue)}\` <!-- ${issue.id} -->`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
```

- [ ] **Step 4: Run core board tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- board-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run core build**

Run:

```bash
pnpm --filter @kanban-task-engine/core build
```

Expected: PASS. If exports fail, update `packages/core/src/index.ts` to export `BoardIssue` and `RenderBoardOptions` from `./boards/board-generator`.

- [ ] **Step 6: Commit main-board renderer**

Run:

```bash
git add packages/core/src/boards/board-generator.ts packages/core/src/index.ts packages/core/tests/board-generator.test.ts
git commit -m "feat(core): render registry-aware kanban boards"
```

Expected: commit includes only the files listed in this task.

## Task 2: Add Epic Index Rendering and Diagnostics

**Files:**

- Modify: `packages/core/tests/board-generator.test.ts`
- Modify: `packages/core/src/boards/board-generator.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing Epic index tests**

Append these tests inside the existing `describe('board generator', ...)` block:

```typescript
  it('renders an Epic index with child counts by status', () => {
    const result = renderEpicIndexMarkdown({
      boardTitle: 'Vibe Coding Epics',
      epicBoardPath: 'boards/vibe-coding-epics.md',
      generatedAt: '2026-04-24T00:00:00.000Z',
      issues: [
        {
          id: 'VC-010',
          title: 'Sample Epic',
          status: 'READY',
          priority: 'Critical',
          project: 'space:vibe-coding',
          path: 'issues/vibe-coding/_epics/VC-010-sample-epic.md',
          issueType: 'Epic',
        },
        {
          id: 'VC-001',
          title: 'Ready Child',
          status: 'READY',
          priority: 'High',
          project: 'kanban-task-engine',
          path: 'issues/vibe-coding/kanban-task-engine/VC-001-ready-child.md',
          issueType: 'Task',
          epic: 'VC-010',
        },
        {
          id: 'VC-002',
          title: 'Done Child',
          status: 'DONE',
          priority: 'Medium',
          project: 'kanban-task-engine',
          path: 'issues/vibe-coding/kanban-task-engine/VC-002-done-child.md',
          issueType: 'Bug',
          epic: 'VC-010',
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.markdown).toContain('type: epic-index');
    expect(result.markdown).toContain('| Epic | Status | Priority | TODO | READY | RUNNING | REVIEW | DONE | FAILED | Total |');
    expect(result.markdown).toContain('| [Sample Epic](../issues/vibe-coding/_epics/VC-010-sample-epic.md) | READY | Critical | 0 | 1 | 0 | 0 | 1 | 0 | 2 |');
  });

  it('reports broken Epic references as warnings', () => {
    const result = renderEpicIndexMarkdown({
      boardTitle: 'Vibe Coding Epics',
      epicBoardPath: 'boards/vibe-coding-epics.md',
      generatedAt: '2026-04-24T00:00:00.000Z',
      issues: [
        {
          id: 'VC-001',
          title: 'Broken Child',
          status: 'READY',
          priority: 'High',
          project: 'kanban-task-engine',
          path: 'issues/vibe-coding/kanban-task-engine/VC-001-broken-child.md',
          issueType: 'Task',
          epic: 'VC-999',
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        issueId: 'VC-001',
        issuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-broken-child.md',
        message: 'Issue VC-001 references missing Epic VC-999',
      },
    ]);
  });

  it('reports duplicate Epic ids as errors', () => {
    const result = renderEpicIndexMarkdown({
      boardTitle: 'OpenClaw Epics',
      epicBoardPath: 'boards/openclaw-epics.md',
      generatedAt: '2026-04-24T00:00:00.000Z',
      issues: [
        {
          id: 'OC-010',
          title: 'First Epic',
          status: 'TODO',
          priority: 'High',
          path: 'issues/openclaw/_epics/OC-010-first.md',
          issueType: 'Epic',
        },
        {
          id: 'OC-010',
          title: 'Duplicate Epic',
          status: 'READY',
          priority: 'High',
          path: 'issues/openclaw/_epics/OC-010-duplicate.md',
          issueType: 'Epic',
        },
      ],
    });

    expect(result.errors).toEqual([
      {
        issueId: 'OC-010',
        issuePath: 'issues/openclaw/_epics/OC-010-duplicate.md',
        message: 'Duplicate Epic id OC-010',
      },
    ]);
  });
```

Update the import at the top:

```typescript
import { renderBoardMarkdown, renderEpicIndexMarkdown } from '../src/boards/board-generator';
```

- [ ] **Step 2: Run board tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- board-generator.test.ts
```

Expected: FAIL with `renderEpicIndexMarkdown` not exported.

- [ ] **Step 3: Implement Epic index result types and renderer**

Add these types to `packages/core/src/boards/board-generator.ts`:

```typescript
export interface BoardDiagnostic {
  issueId: string;
  issuePath: string;
  message: string;
}

export interface RenderEpicIndexOptions {
  boardTitle: string;
  epicBoardPath: string;
  generatedAt: string;
  issues: BoardIssue[];
}

export interface RenderEpicIndexResult {
  markdown: string;
  warnings: BoardDiagnostic[];
  errors: BoardDiagnostic[];
}
```

Add this renderer:

```typescript
export function renderEpicIndexMarkdown(options: RenderEpicIndexOptions): RenderEpicIndexResult {
  const warnings: BoardDiagnostic[] = [];
  const errors: BoardDiagnostic[] = [];
  const epics = options.issues.filter(isEpic);
  const epicIds = new Set<string>();

  for (const epic of epics) {
    if (epicIds.has(epic.id)) {
      errors.push({
        issueId: epic.id,
        issuePath: epic.path,
        message: `Duplicate Epic id ${epic.id}`,
      });
    }
    epicIds.add(epic.id);
  }

  for (const issue of options.issues.filter(issue => !isEpic(issue) && issue.epic)) {
    if (!epicIds.has(issue.epic as string)) {
      warnings.push({
        issueId: issue.id,
        issuePath: issue.path,
        message: `Issue ${issue.id} references missing Epic ${issue.epic}`,
      });
    }
  }

  const lines: string[] = [
    '<!-- GENERATED BY kanban-task-engine. DO NOT EDIT DIRECTLY. -->',
    '---',
    'type: epic-index',
    `title: ${options.boardTitle}`,
    `generatedAt: ${options.generatedAt}`,
    '---',
    '',
    `# ${options.boardTitle}`,
    '',
    '| Epic | Status | Priority | TODO | READY | RUNNING | REVIEW | DONE | FAILED | Total |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const epic of epics) {
    const children = options.issues.filter(issue => !isEpic(issue) && issue.epic === epic.id);
    const counts = ISSUE_STATUSES.map(status => children.filter(issue => issue.status === status).length);
    const total = counts.reduce((sum, count) => sum + count, 0);
    lines.push(`| [${epic.title}](${relativeIssueLink(options.epicBoardPath, epic.path)}) | ${epic.status} | ${epic.priority} | ${counts.join(' | ')} | ${total} |`);
  }

  return {
    markdown: `${lines.join('\n').trimEnd()}\n`,
    warnings,
    errors,
  };
}
```

- [ ] **Step 4: Export Epic index APIs**

Update `packages/core/src/index.ts`:

```typescript
export { renderBoardMarkdown, renderEpicIndexMarkdown } from './boards/board-generator';
export type {
  BoardDiagnostic,
  BoardIssue,
  RenderBoardOptions,
  RenderEpicIndexOptions,
  RenderEpicIndexResult,
} from './boards/board-generator';
```

- [ ] **Step 5: Run core board tests and build**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- board-generator.test.ts
pnpm --filter @kanban-task-engine/core build
```

Expected: both PASS.

- [ ] **Step 6: Commit Epic index renderer**

Run:

```bash
git add packages/core/src/boards/board-generator.ts packages/core/src/index.ts packages/core/tests/board-generator.test.ts
git commit -m "feat(core): render epic index boards"
```

Expected: commit includes only the files listed in this task.

## Task 3: Wire Registry-Aware `render-board --check`

**Files:**

- Modify: `packages/cli/tests/commands/render-board.test.ts`
- Modify: `packages/cli/src/commands/render-board.ts`

- [ ] **Step 1: Confirm CLI package exists**

Run:

```bash
test -f packages/cli/src/commands/render-board.ts && test -f packages/cli/tests/commands/render-board.test.ts
```

Expected: PASS. If this fails, stop and run the CLI MVP plan first because this task depends on the package layout from `docs/superpowers/specs/2026-04-24-kanban-cli-mvp-spec.md`.

- [ ] **Step 2: Add failing `--check` tests**

Append these tests to `packages/cli/tests/commands/render-board.test.ts`, adapting only the local fixture helper name if the CLI MVP plan used a different helper:

```typescript
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRenderBoardCommand } from '../../src/commands/render-board';
import { copyFixtureVault } from '../helpers/fixtures';

describe('render-board command', () => {
  it('reports stale board paths and does not write in check mode', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'kanban-render-check-'));
    await copyFixtureVault('minimal-vault', vaultRoot);
    const boardPath = path.join(vaultRoot, 'boards/vibe-coding.md');
    await writeFile(boardPath, '# stale board\n', 'utf8');

    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = await runRenderBoardCommand({
      vaultRoot,
      check: true,
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join('')).toContain('stale board: boards/vibe-coding.md');
    expect(await readFile(boardPath, 'utf8')).toBe('# stale board\n');
  });

  it('writes main boards and Epic indexes by default', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'kanban-render-write-'));
    await copyFixtureVault('minimal-vault', vaultRoot);

    const result = await runRenderBoardCommand({
      vaultRoot,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    });

    expect(result.exitCode).toBe(0);
    await expect(readFile(path.join(vaultRoot, 'boards/openclaw.md'), 'utf8')).resolves.toContain('type: kanban-board');
    await expect(readFile(path.join(vaultRoot, 'boards/openclaw-epics.md'), 'utf8')).resolves.toContain('type: epic-index');
    await expect(readFile(path.join(vaultRoot, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('type: kanban-board');
    await expect(readFile(path.join(vaultRoot, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('type: epic-index');
  });

  it('renders only the selected space when --space is provided', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'kanban-render-space-'));
    await copyFixtureVault('minimal-vault', vaultRoot);
    await writeFile(path.join(vaultRoot, 'boards/openclaw.md'), '# stale openclaw\n', 'utf8');

    const result = await runRenderBoardCommand({
      vaultRoot,
      space: 'vibe-coding',
      check: true,
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    });

    expect(result.exitCode).toBe(0);
    await expect(readFile(path.join(vaultRoot, 'boards/openclaw.md'), 'utf8')).resolves.toBe('# stale openclaw\n');
  });
});
```

- [ ] **Step 3: Run CLI render-board tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- render-board.test.ts
```

Expected: FAIL because the command does not yet render Epic indexes, compare stale files, or preserve files in check mode.

- [ ] **Step 4: Implement command behavior**

Edit `packages/cli/src/commands/render-board.ts` with these behavior requirements:

```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BoardIssue,
  renderBoardMarkdown,
  renderEpicIndexMarkdown,
} from '@kanban-task-engine/core';
```

The command implementation must:

```typescript
interface RenderBoardCommandOptions {
  vaultRoot: string;
  check?: boolean;
  space?: string;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

interface RenderBoardCommandResult {
  exitCode: 0 | 1 | 2;
}
```

Use the existing CLI context builder to load `registry.yaml`, `WorkspaceResolver`, and `MarkdownStore`. Convert each canonical task to `BoardIssue` with these mappings:

```typescript
const issue: BoardIssue = {
  id: task.task_ref.external_id,
  title: task.summary,
  status: task.workflow.normalized_status,
  priority: task.classification.priority,
  project: inferProjectLabel(task),
  space: inferSpaceLabel(task),
  path: await store.resolveIssuePath(task.task_ref).then(absolute => path.posix.relative(vaultRoot, absolute)),
  issueType: task.classification.issue_type,
  epic: typeof task.planning.epic === 'string' ? task.planning.epic : undefined,
};
```

Generate exactly two outputs per selected registry space:

```typescript
const outputs = [
  {
    relativePath: space.board,
    text: renderBoardMarkdown({
      boardTitle: titleForSpace(spaceKey),
      boardPath: space.board,
      generatedAt,
      issues: issuesForSpace,
    }),
  },
  {
    relativePath: space.epicBoard,
    text: renderEpicIndexMarkdown({
      boardTitle: `${titleForSpace(spaceKey)} Epics`,
      epicBoardPath: space.epicBoard,
      generatedAt,
      issues: issuesForSpace,
    }),
  },
];
```

For `--check`, compare generated text with existing file content and never call `writeFile()`:

```typescript
if (options.check) {
  const stale = [];
  for (const output of outputs) {
    const absolutePath = path.join(options.vaultRoot, output.relativePath);
    const current = await readFile(absolutePath, 'utf8').catch(() => '');
    if (current !== output.text) stale.push(output.relativePath);
  }
  for (const relativePath of stale) {
    options.stderr.write(`stale board: ${relativePath}\n`);
  }
  return { exitCode: stale.length > 0 ? 1 : 0 };
}
```

For write mode, create parent directories and write both main and Epic files:

```typescript
for (const output of outputs) {
  const absolutePath = path.join(options.vaultRoot, output.relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, output.text, 'utf8');
  options.stdout.write(`wrote board: ${output.relativePath}\n`);
}
return { exitCode: 0 };
```

If `renderEpicIndexMarkdown()` returns warnings, print each warning as `warning: ${message} (${issuePath})`. If it returns errors, print each error as `error: ${message} (${issuePath})` and return exit code `1` without writing generated files.

- [ ] **Step 5: Run CLI render-board tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- render-board.test.ts
pnpm --filter @kanban-task-engine/cli build
```

Expected: both PASS.

- [ ] **Step 6: Commit CLI stale-check integration**

Run:

```bash
git add packages/cli/src/commands/render-board.ts packages/cli/tests/commands/render-board.test.ts
git commit -m "feat(cli): check registry-aware board freshness"
```

Expected: commit includes only the files listed in this task.

## Task 4: Add `examples/minimal-vault`

**Files:**

- Create: `examples/minimal-vault/registry.yaml`
- Create: `examples/minimal-vault/issues/openclaw/OC-001-sample-task.md`
- Create: `examples/minimal-vault/issues/openclaw/_epics/OC-010-sample-epic.md`
- Create: `examples/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md`
- Create: `examples/minimal-vault/issues/vibe-coding/_epics/VC-010-sample-epic.md`
- Create: `examples/minimal-vault/boards/openclaw.md`
- Create: `examples/minimal-vault/boards/openclaw-epics.md`
- Create: `examples/minimal-vault/boards/vibe-coding.md`
- Create: `examples/minimal-vault/boards/vibe-coding-epics.md`
- Modify: `packages/cli/tests/fixtures/minimal-vault/**`

- [ ] **Step 1: Create minimal registry**

Create `examples/minimal-vault/registry.yaml`:

```yaml
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
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
```

- [ ] **Step 2: Create single-space sample task**

Create `examples/minimal-vault/issues/openclaw/OC-001-sample-task.md`:

```markdown
---
id: OC-001
title: Sample OpenClaw task
type: task
status: TODO
executor: human
project: ""
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: Medium
epic: OC-010
---

## 목적
Show a minimal single-space issue.

## 컨텍스트
This file is used by CLI validation and board rendering examples.

## Acceptance Criteria
- The issue appears on `boards/openclaw.md`.

## 실행 힌트
No execution is required for this documentation fixture.
```

- [ ] **Step 3: Create single-space sample Epic**

Create `examples/minimal-vault/issues/openclaw/_epics/OC-010-sample-epic.md`:

```markdown
---
id: OC-010
title: Sample OpenClaw epic
type: epic
status: READY
executor: human
project: ""
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: High
---

## 목표
Group minimal OpenClaw documentation work.

## 범위
Only example vault documentation fixtures.

## 성공 지표
- Epic index generation counts child issues by status.

## 하위 티켓
- OC-001
```

- [ ] **Step 4: Create container-project sample task**

Create `examples/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md`:

```markdown
---
id: VC-001
title: Sample kanban task
type: task
status: READY
executor: human
project: kanban-task-engine
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: High
epic: VC-010
---

## 목적
Show a minimal container-project issue.

## 컨텍스트
This file demonstrates `issues/<container-space>/<project>/` layout.

## Acceptance Criteria
- The issue appears on `boards/vibe-coding.md`.

## 실행 힌트
No execution is required for this documentation fixture.
```

- [ ] **Step 5: Create container-space sample Epic**

Create `examples/minimal-vault/issues/vibe-coding/_epics/VC-010-sample-epic.md`:

```markdown
---
id: VC-010
title: Sample Vibe Coding epic
type: epic
status: READY
executor: human
project: ""
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: Critical
---

## 목표
Group minimal Vibe Coding documentation work.

## 범위
Only example vault documentation fixtures.

## 성공 지표
- Epic index generation counts child issues by status.

## 하위 티켓
- VC-001
```

- [ ] **Step 6: Generate board fixture files**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec kanban render-board --vault examples/minimal-vault
```

Expected: PASS and writes these files:

```text
examples/minimal-vault/boards/openclaw.md
examples/minimal-vault/boards/openclaw-epics.md
examples/minimal-vault/boards/vibe-coding.md
examples/minimal-vault/boards/vibe-coding-epics.md
```

- [ ] **Step 7: Sync CLI minimal fixture**

If `packages/cli/tests/fixtures/minimal-vault` already exists, replace its contents with the same files from `examples/minimal-vault`. If it does not exist, create it with the same files. Use `cp -R examples/minimal-vault/. packages/cli/tests/fixtures/minimal-vault/` and then inspect `git diff -- packages/cli/tests/fixtures/minimal-vault` before staging.

- [ ] **Step 8: Validate fixture and stale check**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec kanban validate --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban render-board --vault examples/minimal-vault --check
```

Expected: both PASS. The second command prints no stale board paths.

- [ ] **Step 9: Commit example vault**

Run:

```bash
git add examples/minimal-vault packages/cli/tests/fixtures/minimal-vault
git commit -m "docs: add minimal kanban vault example"
```

Expected: commit includes only example and CLI fixture files.

## Task 5: Publish Accurate User Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/getting-started.md`
- Create: `docs/architecture.md`
- Create: `docs/schema.md`
- Create: `docs/vault-layout.md`
- Create: `docs/cli.md`
- Create: `docs/execution-harness.md`

- [ ] **Step 1: Replace root README with required sections**

Edit `README.md` to use exactly these top-level sections:

````markdown
# kanban-task-engine

## What this is

`kanban-task-engine` is a Markdown issue control plane for humans and AI executors. It stores issues as Markdown files, validates them with shared schema rules, and renders generated board views from the vault.

## What this is not

This is not a Trello clone.

This is not a general web kanban UI.

This is not Jira bidirectional sync.

## Quick start

```bash
pnpm install
pnpm build
pnpm --filter @kanban-task-engine/cli exec kanban doctor --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban validate --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban render-board --vault examples/minimal-vault --check
```

The quick start uses `examples/minimal-vault`, which contains a small two-space registry, sample issues, generated main boards, and generated Epic indexes.

## Core concepts

- Vault: a directory containing `registry.yaml`, `issues/`, and `boards/`.
- Space: a top-level work area declared in `registry.yaml`.
- Project: an optional container-space subdirectory for non-Epic issues.
- Issue: a Markdown file with frontmatter and required sections.
- Epic: a Markdown issue with `type: epic`, stored under `_epics`.
- Generated board: a Markdown file under `boards/` produced by `kanban render-board`.

## Current implementation status

- Available: schema validation, core model mapping, Markdown store work, and generated board rendering.
- Available after the CLI MVP lands: `kanban doctor`, `kanban validate`, and `kanban render-board`.
- Planned: execution harness commands such as `kanban run`.
- Planned or experimental: external adapter workflows, depending on adapter-specific docs.

## Roadmap

1. Harden schema, store, and board contracts.
2. Ship the inspection and generated-board CLI MVP.
3. Add local execution harness behavior behind explicit commands.
4. Harden adapters around core contracts.
5. Keep generated boards and docs aligned with the Markdown vault contract.
````

Do not mention `kanban run` in Quick start.

- [ ] **Step 2: Create `docs/getting-started.md`**

Create `docs/getting-started.md`:

````markdown
# Getting Started

Start with the minimal example vault:

```bash
pnpm install
pnpm build
pnpm --filter @kanban-task-engine/cli exec kanban doctor --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban validate --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban render-board --vault examples/minimal-vault --check
```

The example vault includes:

- `registry.yaml`
- `issues/openclaw/`
- `issues/openclaw/_epics/`
- `issues/vibe-coding/kanban-task-engine/`
- `issues/vibe-coding/_epics/`
- `boards/*.md`

Use `kanban render-board --vault examples/minimal-vault` to rewrite generated board files after changing issue frontmatter or status.
````

- [ ] **Step 3: Create `docs/architecture.md`**

Create `docs/architecture.md`:

```markdown
# Architecture

`kanban-task-engine` keeps Markdown issues as the operational control plane. Core packages parse, validate, map, and render local files. CLI commands inspect and update generated board views without requiring a web application.

The MVP architecture is:

- `@kanban-task-engine/schema`: Markdown frontmatter, status, and parser validation.
- `@kanban-task-engine/core`: canonical model, store, resolver, state machine, and board rendering.
- `@kanban-task-engine/cli`: user-facing inspection, validation, and board rendering commands.
- Adapter packages: integration surfaces with explicit status labels in `docs/adapters/`.

Non-goals for this scope:

- No web kanban UI.
- No drag/drop board interactions.
- No realtime collaboration.
- No mobile sync.
- No bidirectional Jira sync.
```

- [ ] **Step 4: Create `docs/schema.md`**

Create `docs/schema.md`:

```markdown
# Schema

Issues are Markdown files with YAML frontmatter.

Common frontmatter fields:

- `id`: issue id such as `OC-001` or `VC-001`.
- `title`: display title.
- `type`: `task`, `bug`, `chore`, `docs`, or `epic`.
- `status`: `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, or `FAILED`.
- `executor`: `human`, `claude-code`, `openclaw`, or another supported executor value.
- `project`: project key for container-space issues, or an empty string for space-level issues.
- `priority`: canonical priority label.
- `epic`: optional Epic id for non-Epic child issues.

Non-Epic issues require these sections:

- `목적`
- `컨텍스트`
- `Acceptance Criteria`
- `실행 힌트`

Epic issues require these sections:

- `목표`
- `범위`
- `성공 지표`
- `하위 티켓`

Generated main boards exclude Epic issues. Generated Epic indexes count child issues where `child.frontmatter.epic === epic.frontmatter.id`.
```

- [ ] **Step 5: Create `docs/vault-layout.md`**

Create `docs/vault-layout.md`:

````markdown
# Vault Layout

A vault contains registry, issue, and generated board files.

```text
registry.yaml
issues/
boards/
```

Minimum registry shape:

```yaml
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
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
```

Supported issue roots:

```text
issues/<single-space>/<ISSUE-ID>-title.md
issues/<single-space>/_epics/<ISSUE-ID>-title.md
issues/<container-space>/<project>/<ISSUE-ID>-title.md
issues/<container-space>/_epics/<ISSUE-ID>-title.md
```

Board files under `boards/` are generated. Edit issue Markdown, then run `kanban render-board` to refresh board output.
````

- [ ] **Step 6: Create `docs/cli.md`**

Create `docs/cli.md`:

````markdown
# CLI

The user-facing CLI is limited to inspection, validation, and generated board rendering.

```bash
kanban doctor --vault <path>
kanban validate --vault <path>
kanban validate <issue-id> --vault <path>
kanban render-board --vault <path>
kanban render-board --vault <path> --check
kanban render-board --vault <path> --space <space>
```

Exit codes:

- `doctor`: `0` when required checks pass, `1` when a required check fails.
- `validate`: `0` when all checked issues are valid, `1` for validation failures, `2` for usage errors.
- `render-board`: `0` when boards were written or are current, `1` when `--check` finds stale output or board generation errors, `2` for usage errors.

The CLI does not expose execution, status-transition, merge, or external-adapter commands in the MVP.
````

- [ ] **Step 7: Create `docs/execution-harness.md`**

Create `docs/execution-harness.md`:

```markdown
# Execution Harness

Status: planned.

The execution harness will own explicit executor commands, lock handling, run artifacts, and status transitions. It is not part of the inspection and board-rendering CLI MVP.

Current docs and quick starts must not instruct users to run `kanban run` until the execution harness spec is implemented and verified.
```

- [ ] **Step 8: Scan docs for unsupported execution claims**

Run:

```bash
rg -n "kanban run|Trello clone|general web kanban|bidirectional Jira|drag/drop|realtime|mobile sync" README.md docs
```

Expected: matches exist only where they are explicit non-goals or planned status notes. No quick-start section should list `kanban run`.

- [ ] **Step 9: Commit user docs**

Run:

```bash
git add README.md docs/getting-started.md docs/architecture.md docs/schema.md docs/vault-layout.md docs/cli.md docs/execution-harness.md
git commit -m "docs: document kanban board MVP"
```

Expected: commit includes only the files listed in this task.

## Task 6: Add Adapter Status Documentation

**Files:**

- Create: `docs/adapters/claude-code.md`
- Create: `docs/adapters/openclaw.md`
- Create: `docs/adapters/jira.md`
- Create: `docs/adapters/github.md`
- Create: `docs/adapters/firebase.md`

- [ ] **Step 1: Create adapter docs directory**

Run:

```bash
mkdir -p docs/adapters
```

Expected: directory exists. Do not stage anything yet.

- [ ] **Step 2: Create Claude Code adapter doc**

Create `docs/adapters/claude-code.md`:

```markdown
# Claude Code Adapter

Status: planned

The Claude Code adapter is intended for explicit execution harness integration. It is not invoked by `kanban doctor`, `kanban validate`, or `kanban render-board`.

Current MVP docs must not present Claude execution as available until execution harness tests verify it.
```

- [ ] **Step 3: Create OpenClaw adapter doc**

Create `docs/adapters/openclaw.md`:

```markdown
# OpenClaw Adapter

Status: experimental

The OpenClaw adapter package exists for gateway-oriented execution integration. Its production-facing execution contract is covered by adapter hardening and execution harness work, not by the board-rendering MVP.

Do not use this adapter as evidence that the CLI supports `kanban run`.
```

- [ ] **Step 4: Create Jira adapter doc**

Create `docs/adapters/jira.md`:

```markdown
# Jira Adapter

Status: experimental

The Jira adapter is for controlled export-oriented integration. Bidirectional Jira sync is out of scope.

The Markdown vault remains the control plane. Jira behavior must preserve core identity and status contracts before it is described as available.
```

- [ ] **Step 5: Create GitHub adapter doc**

Create `docs/adapters/github.md`:

```markdown
# GitHub Adapter

Status: experimental

The GitHub adapter package exists for task synchronization experiments. User-facing docs should treat it as experimental until adapter hardening verifies provider identity, status mapping, and conflict behavior.
```

- [ ] **Step 6: Create Firebase adapter doc**

Create `docs/adapters/firebase.md`:

```markdown
# Firebase Adapter

Status: experimental

The Firebase adapter package exists for synchronization experiments. User-facing docs should treat it as experimental until adapter hardening verifies provider identity, status mapping, and conflict behavior.
```

- [ ] **Step 7: Verify every adapter doc has an allowed status label**

Run:

```bash
for file in docs/adapters/*.md; do rg -n "^Status: (available|experimental|planned)$" "$file" >/dev/null || { echo "missing status: $file"; exit 1; }; done
```

Expected: PASS.

- [ ] **Step 8: Commit adapter docs**

Run:

```bash
git add docs/adapters
git commit -m "docs: label adapter implementation status"
```

Expected: commit includes only `docs/adapters/*.md`.

## Task 7: Label Historical and Superseded Plans

**Files:**

- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-automation-runtime-plan.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-boards-work-cleanup-plan.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-foundation-vault-plan.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-schema-core-plan.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-schema-migration.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-spec-reconciliation.md`
- Inspect and update stale header labels in: `docs/superpowers/plans/2026-04-23-kanban-worktree-cli-plan.md`

- [ ] **Step 1: Identify plans with stale commands or schema**

Run:

```bash
rg -n "kanban run|kanban next|kanban approve|kanban abort|kanban retry|kanban sync|kanban board|spaces\\.workspace|workspace_path|spaces/" docs/superpowers/plans/2026-04-23-*.md
```

Expected: prints candidate historical plans. Do not delete them.

- [ ] **Step 2: Add historical labels to stale 2026-04-23 plans**

For every `docs/superpowers/plans/2026-04-23-*.md` file whose steps no longer match the current MVP decomposition, insert this block immediately after the top-level `# ... Implementation Plan` heading:

```markdown
> **Historical / superseded:** This plan is retained for context. Current implementation should follow the 2026-04-24 MVP hardening decomposition, especially `2026-04-24-kanban-contract-hardening-plan.md`, `2026-04-24-kanban-vault-store-plan.md`, the CLI MVP plan, and `2026-04-24-kanban-board-docs-plan.md`.
```

Do not add this label to current authoritative spec files under `docs/superpowers/specs/`.

- [ ] **Step 3: Verify the current design file remains unmarked**

Run:

```bash
rg -n "Historical / superseded" docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md docs/superpowers/specs/2026-04-24-kanban-*.md
```

Expected: no matches.

- [ ] **Step 4: Verify stale plan labels exist where needed**

Run:

```bash
rg -n "Historical / superseded" docs/superpowers/plans/2026-04-23-*.md
```

Expected: every plan found in Step 1 that conflicts with current schema or CLI scope has one label near the top.

- [ ] **Step 5: Commit historical labels**

Run:

```bash
git add docs/superpowers/plans/2026-04-23-*.md
git commit -m "docs: label superseded kanban plans"
```

Expected: commit includes only labeled historical plan docs.

## Task 8: Full Verification and Stale Reference Scan

**Files:**

- Read: all files changed by Tasks 1-7.
- Modify only if a verification failure points to a file from Tasks 1-7.

- [ ] **Step 1: Run package and workspace verification**

Run:

```bash
pnpm --filter @kanban-task-engine/core test
pnpm --filter @kanban-task-engine/core build
pnpm --filter @kanban-task-engine/cli test
pnpm --filter @kanban-task-engine/cli build
pnpm test
pnpm build
```

Expected: all commands PASS. If `@kanban-task-engine/cli` is not yet present because the CLI MVP plan has not landed, stop and record the dependency instead of changing this plan's scope.

- [ ] **Step 2: Verify example vault behavior**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec kanban validate --vault examples/minimal-vault
pnpm --filter @kanban-task-engine/cli exec kanban render-board --vault examples/minimal-vault --check
```

Expected: both commands PASS. The stale check prints no stale board paths.

- [ ] **Step 3: Verify unsupported-scope claims are absent**

Run:

```bash
rg -n "kanban run|kanban approve|kanban abort|kanban retry|drag/drop|realtime|mobile sync|bidirectional Jira|Trello clone|general web kanban UI" README.md docs
```

Expected: any matches are explicit non-goals, planned-status notes, or historical/superseded content. No quick start should show execution commands.

- [ ] **Step 4: Verify board output shape**

Run:

```bash
rg -n "type: kanban-board|type: epic-index|Sample OpenClaw task|Sample kanban task" examples/minimal-vault/boards
```

Expected: generated main boards contain sample tasks and generated Epic indexes contain `type: epic-index`.

- [ ] **Step 5: Commit verification fixes if any**

If Steps 1-4 required fixes in files already touched by this plan, run:

```bash
git add README.md docs examples/minimal-vault packages/core/src/boards/board-generator.ts packages/core/src/index.ts packages/core/tests/board-generator.test.ts packages/cli/src/commands/render-board.ts packages/cli/tests/commands/render-board.test.ts packages/cli/tests/fixtures/minimal-vault
git commit -m "fix: align board docs verification"
```

Expected: commit is created only if verification fixes were necessary. If no fixes were necessary, do not create an empty commit.

## Self-Review Checklist

- [ ] Main boards exclude Epics: Task 1 adds tests and renderer filtering with `issueType` checks.
- [ ] Main board card lines include title link, priority, and project or `space:<space>` label: Task 1 tests and implementation specify exact line format.
- [ ] Board links are relative to the generated board file: Task 1 introduces `relativeIssueLink()`.
- [ ] Epic index is a generated table, not a Kanban board: Task 2 adds `type: epic-index` and table-only rendering.
- [ ] Epic index includes child counts for `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`, and total: Task 2 tests the count columns.
- [ ] Broken Epic references are reported as warnings: Task 2 adds warning diagnostics; Task 3 prints warnings from the CLI.
- [ ] Duplicate Epic ids are errors: Task 2 adds duplicate-id diagnostics; Task 3 exits nonzero before writing on errors.
- [ ] `render-board --check` generates in memory, compares existing files, exits nonzero for stale output, reports stale paths, and does not write: Task 3 tests and implementation steps cover all five behaviors.
- [ ] `examples/minimal-vault` contains registry, two issues, two Epics, and four generated board files: Task 4 creates every required path.
- [ ] `examples/minimal-vault` validates with `kanban validate`: Task 4 and Task 8 run validation.
- [ ] README sections match `What this is`, `What this is not`, `Quick start`, `Core concepts`, `Current implementation status`, and `Roadmap`: Task 5 replaces the README with those sections.
- [ ] README quick start only uses implemented commands and `examples/minimal-vault`: Task 5 lists only `doctor`, `validate`, and `render-board --check`.
- [ ] Docs do not claim unsupported execution behavior: Task 5 documents execution harness as planned; Task 8 scans for unsupported command claims.
- [ ] Adapter docs use allowed labels `available`, `experimental`, or `planned`: Task 6 creates docs and verifies labels.
- [ ] Historical or superseded implementation plans are labeled rather than deleted: Task 7 adds labels to stale 2026-04-23 plans and verifies specs remain unmarked.
- [ ] Web UI, realtime sync, drag/drop, and Jira bidirectional sync are not implemented: Task 5 documents them as non-goals; no task creates implementation files for those scopes.
- [ ] Full workspace verification passes with `pnpm test` and `pnpm build`: Task 8 runs both commands after package-specific checks.
