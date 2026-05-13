# Kanban Move and Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `superpowers:test-driven-development`: write the failing test first, run it and confirm the intended failure, then implement the smallest production change.

**Goal:** Implement Phase 3 so CLI status movement and Obsidian board-originated movement update issue frontmatter only through explicit validation.

**Architecture:** `issues/**/*.md` remain source of truth. Core owns registry-aware issue lookup, shared move validation/writeback, board parsing, conflict detection, and apply orchestration. CLI owns argument parsing, dry-run/apply selection, result formatting, and exit-code mapping.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest one-shot `vitest run`, Node `fs/promises`, existing `StateMachine`, `@kanban-task-engine/schema` issue status contract, Phase 2 Obsidian board metadata comments, `architecture`, `system-design`, `testing-strategy`, `documentation`, `deploy-checklist`, `tech-debt`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`.

---

## 0. Spec and Harness Gate

Source spec:

- `docs/superpowers/specs/2026-05-13-kanban-move-reconcile-spec.md`
- `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`
- `docs/superpowers/specs/2026-05-13-obsidian-board-write-spec.md`
- `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`

Harness routing:

| Work | Harness/plugin |
| --- | --- |
| Current external syntax | `context7` first. In this planning session quota was exceeded, so Phase 3 relies on the Phase 2 generated metadata comment and the disposable Obsidian GUI smoke evidence rather than new external parser assumptions. |
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
rtk pnpm install --frozen-lockfile
rtk pnpm -r build
rtk pnpm -r test
rtk git status --short
test -f docs/superpowers/specs/2026-05-13-kanban-move-reconcile-spec.md
test -f docs/superpowers/plans/2026-05-13-kanban-move-reconcile-plan.md
```

Expected: build and test baselines pass; working tree contains only intentional Phase 3 edits.

## 1. File Responsibility Map

Create:

- `packages/core/src/store/registry-issue-source.ts`
- `packages/core/src/movement/issue-mover.ts`
- `packages/core/src/boards/reconcile-board.ts`
- `packages/core/tests/registry-issue-source.test.ts`
- `packages/core/tests/issue-mover.test.ts`
- `packages/core/tests/reconcile-board.test.ts`
- `packages/cli/src/commands/move.ts`
- `packages/cli/src/commands/reconcile-board.ts`
- `packages/cli/tests/move-reconcile.test.ts`

Modify:

- `packages/core/src/boards/board-projection.ts`
- `packages/core/src/index.ts`
- `packages/cli/src/index.ts`
- `docs/kanban-runtime.md`
- `docs/deploy-checklist.md`

Do not modify:

- Live vault files under `~/.openclaw/workspace-kanban/kanban`.
- Generated board files in a real operator vault without explicit approval.
- Execution modules under `packages/core/src/executor/**`; board movement must not trigger agent execution in this phase.

## 2. Task Decomposition and Worker Ownership

If using subagents, assign disjoint write scopes:

| Worker | Scope |
| --- | --- |
| Worker A | `packages/core/src/store/registry-issue-source.ts`, `packages/core/tests/registry-issue-source.test.ts`, narrow extraction from `packages/core/src/boards/board-projection.ts` |
| Worker B | `packages/core/src/movement/issue-mover.ts`, `packages/core/tests/issue-mover.test.ts` |
| Worker C | `packages/core/src/boards/reconcile-board.ts`, `packages/core/tests/reconcile-board.test.ts` |
| Worker D | `packages/cli/src/commands/move.ts`, `packages/cli/src/commands/reconcile-board.ts`, `packages/cli/src/index.ts`, `packages/cli/tests/move-reconcile.test.ts` |
| Worker E | `docs/kanban-runtime.md`, `docs/deploy-checklist.md`, runtime smoke evidence |

Workers are not alone in the codebase. They must not revert Phase 1/2 edits, review fixes, or unrelated dirty files.

## Task 1: Shared Registry Issue Source

**Files:**

- Create: `packages/core/src/store/registry-issue-source.ts`
- Create: `packages/core/tests/registry-issue-source.test.ts`
- Modify: `packages/core/src/boards/board-projection.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing tests for registry-aware issue listing and lookup**

Create `packages/core/tests/registry-issue-source.test.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { describe, expect, it } from 'vitest';
import {
  listRegistryIssueRecords,
  findRegistryIssueById,
} from '../src/store/registry-issue-source';

async function makeVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-phase3-source-'));
  await fs.mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(root, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.writeFile(path.join(root, 'registry.yaml'), `
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
`);
  await fs.writeFile(path.join(root, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), `---
id: VC-001
status: READY
priority: P1
type: task
title: Ready item
project: kanban-task-engine
executor: codex
created: 2026-05-13T09:00:00.000Z
updated: 2026-05-13T09:00:00.000Z
---

# VC-001 Ready item

## 목적
Move source test.

## 컨텍스트
Context.

## Acceptance Criteria
- Pass.

## 실행 힌트
Use tests.

## 로그
- Created.
`);
  return root;
}

describe('registry issue source', () => {
  it('lists valid issue records with vault-relative paths', async () => {
    const vaultRoot = await makeVault();

    const records = await listRegistryIssueRecords({ vaultRoot, space: 'vibe-coding' });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'VC-001',
      status: 'READY',
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
    });
  });

  it('finds exactly one issue by frontmatter id', async () => {
    const vaultRoot = await makeVault();

    const record = await findRegistryIssueById({ vaultRoot, issueId: 'VC-001' });

    expect(record.space).toBe('vibe-coding');
    expect(record.frontmatter.title).toBe('Ready item');
  });

  it('rejects duplicate frontmatter ids before mutation', async () => {
    const vaultRoot = await makeVault();
    await fs.copyFile(
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'),
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-duplicate.md'),
    );

    await expect(findRegistryIssueById({ vaultRoot, issueId: 'VC-001' }))
      .rejects.toThrow('Duplicate issue id: VC-001');
  });
});
```

- [x] **Step 2: Run the focused RED test**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/registry-issue-source.test.ts
```

Expected: FAIL because `../src/store/registry-issue-source` does not exist.

- [x] **Step 3: Implement the shared source helper**

Create `packages/core/src/store/registry-issue-source.ts` with these public shapes:

```ts
import type { IssueFrontmatter, IssueStatus } from '@kanban-task-engine/schema';

export interface RegistryIssueRecord {
  id: string;
  space: string;
  absolutePath: string;
  relativePath: string;
  markdown: string;
  body: string;
  frontmatter: IssueFrontmatter;
  projection: {
    id: string;
    title: string;
    type: string;
    status: IssueStatus;
    priority?: string;
    project: string;
    epic?: string;
    updated: string;
    relativePath: string;
  };
}

export interface ListRegistryIssueRecordsOptions {
  vaultRoot: string;
  space?: string;
}

export interface FindRegistryIssueByIdOptions {
  vaultRoot: string;
  issueId: string;
}
```

Implementation rules:

- Load `registry.yaml` through `resolveVaultPath(vaultRoot, 'registry.yaml')`.
- Reuse `loadRegistry`, `getRegistrySpace`, and `listRegistrySpaces`.
- Resolve all registry paths through vault-contained resolvers.
- Reject symlinks and path escapes.
- Parse issue markdown with `validateIssueFrontmatterForRegistry`.
- Validate required task/epic sections with the same section names currently used in `board-projection.ts`.
- Return duplicate id errors before any caller can mutate.

- [x] **Step 4: Refactor board projection to use the helper**

In `packages/core/src/boards/board-projection.ts`, replace private issue scanning and parsing with `listRegistryIssueRecords({ vaultRoot, space })`, then map `record.projection` into `renderObsidianBoardMarkdown`.

Keep these public functions unchanged:

```ts
collectBoardProjection(options)
writeBoardProjection(options)
writeBoardProjections(options)
```

- [x] **Step 5: Run regression tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/registry-issue-source.test.ts tests/board-projection.test.ts tests/obsidian-board-renderer.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
rtk git add packages/core/src/store/registry-issue-source.ts packages/core/src/boards/board-projection.ts packages/core/src/index.ts packages/core/tests/registry-issue-source.test.ts
rtk git commit -m "refactor: share registry issue source"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## Task 2: Shared Issue Move Service

**Files:**

- Create: `packages/core/src/movement/issue-mover.ts`
- Create: `packages/core/tests/issue-mover.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing move service tests**

Create `packages/core/tests/issue-mover.test.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { moveIssueStatus } from '../src/movement/issue-mover';
import { makePhase3Vault } from './helpers/phase3-vault';

describe('issue mover', () => {
  it('dry-runs a legal transition without writing the file', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md');
    const before = await fs.readFile(issuePath, 'utf8');

    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'READY',
      dryRun: true,
      now: '2026-05-13T10:00:00.000Z',
      reason: 'operator selected item',
    });

    expect(result).toMatchObject({
      issueId: 'VC-001',
      oldStatus: 'TODO',
      newStatus: 'READY',
      changed: true,
      dryRun: true,
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
    });
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toBe(before);
  });

  it('applies a legal transition and appends a log entry', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'READY',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
      reason: 'operator selected item',
    });

    expect(result.changed).toBe(true);
    const content = await fs.readFile(path.join(vaultRoot, result.relativePath), 'utf8');
    expect(content).toContain('status: READY');
    expect(content).toContain('updated: 2026-05-13T10:00:00.000Z');
    expect(content).toContain('- 2026-05-13T10:00:00.000Z move: TODO -> READY (operator selected item)');
  });

  it('rejects illegal transitions before writing', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'READY' });

    await expect(moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'DONE',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
    })).rejects.toThrow('Invalid transition: READY -> DONE for issue VC-001');
  });

  it('sets completed only when moving to DONE', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'REVIEW' });

    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'DONE',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
    });

    const content = await fs.readFile(path.join(vaultRoot, result.relativePath), 'utf8');
    expect(content).toContain('completed: 2026-05-13T10:00:00.000Z');
  });
});
```

If no shared test helper exists, create `packages/core/tests/helpers/phase3-vault.ts` with a disposable registry and one valid issue. Keep helper output identical to the issue shape accepted by Phase 2 board tests.

- [x] **Step 2: Run the focused RED test**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/issue-mover.test.ts
```

Expected: FAIL because `../src/movement/issue-mover` does not exist.

- [x] **Step 3: Implement the move service**

Create `packages/core/src/movement/issue-mover.ts` with this public API:

```ts
import type { IssueStatus } from '@kanban-task-engine/schema';

export interface MoveIssueStatusOptions {
  vaultRoot: string;
  issueId: string;
  targetStatus: IssueStatus;
  dryRun?: boolean;
  now?: string;
  reason?: string;
}

export interface MoveIssueStatusResult {
  issueId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  changed: boolean;
  dryRun: boolean;
  absolutePath: string;
  relativePath: string;
}

export async function moveIssueStatus(options: MoveIssueStatusOptions): Promise<MoveIssueStatusResult>;
```

Implementation rules:

- Validate `targetStatus` with `isIssueStatus`.
- Find the issue with `findRegistryIssueById`.
- Reject epic moves to `READY`, `RUNNING`, `REVIEW`, or `FAILED`.
- Treat same-status moves as `changed: false` and write nothing.
- For changed task moves, validate with `new StateMachine().canTransition(oldStatus, targetStatus)`.
- Update only frontmatter fields needed for status movement: `status`, `updated`, and `completed`.
- Preserve body and existing frontmatter fields.
- Append one log line under `## 로그`; create that section only if the existing body is valid but missing it because older fixtures require migration.
- Write via `atomicWriteFile`.

- [x] **Step 4: Export the service**

Modify `packages/core/src/index.ts`:

```ts
export * from './movement/issue-mover';
```

- [x] **Step 5: Run move tests and state-machine regression**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/issue-mover.test.ts tests/state-machine.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
rtk git add packages/core/src/movement/issue-mover.ts packages/core/src/index.ts packages/core/tests/issue-mover.test.ts packages/core/tests/helpers/phase3-vault.ts
rtk git commit -m "feat: add issue status move service"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## Task 3: Board Reconcile Parser and Dry-run Proposals

**Files:**

- Create: `packages/core/src/boards/reconcile-board.ts`
- Create: `packages/core/tests/reconcile-board.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing parser and proposal tests**

Create `packages/core/tests/reconcile-board.test.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { collectBoardProjection, reconcileBoard } from '../src';
import { makePhase3Vault, moveCardToLane } from './helpers/phase3-vault';

describe('board reconciliation', () => {
  it('reports a board lane movement as a dry-run proposal', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({
      vaultRoot,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T10:00:00.000Z',
    });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await reconcileBoard({
      vaultRoot,
      space: 'vibe-coding',
      apply: false,
      now: '2026-05-13T10:05:00.000Z',
    });

    expect(result.conflicts).toEqual([]);
    expect(result.proposals).toEqual([
      expect.objectContaining({
        issueId: 'VC-001',
        currentStatus: 'TODO',
        proposedStatus: 'READY',
        recordedStatus: 'TODO',
        boardLane: 'READY',
      }),
    ]);
  });

  it('fails duplicate metadata ids', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    const duplicate = projection.boardMarkdown.replace('## READY\n\n', `## READY\n\n${projection.boardMarkdown.match(/- \\[ \\].*VC-001.*\\n/)?.[0] ?? ''}`);
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, duplicate);

    const result = await reconcileBoard({ vaultRoot, space: 'vibe-coding', apply: false });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ issueId: 'VC-001', kind: 'duplicate-card' }),
    ]);
  });

  it('fails stale checksum conflicts', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({
      vaultRoot,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T10:00:00.000Z',
    });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md');
    await fs.writeFile(issuePath, (await fs.readFile(issuePath, 'utf8')).replace('title: Ready item', 'title: Changed elsewhere'));

    const result = await reconcileBoard({ vaultRoot, space: 'vibe-coding', apply: false });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ issueId: 'VC-001', kind: 'stale-checksum' }),
    ]);
  });
});
```

- [ ] **Step 2: Run the focused RED test**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/reconcile-board.test.ts
```

Expected: FAIL because `reconcileBoard` is not exported.

- [ ] **Step 3: Implement parser and dry-run**

Create `packages/core/src/boards/reconcile-board.ts` with these public shapes:

```ts
import type { IssueStatus } from '@kanban-task-engine/schema';

export type ReconcileConflictKind =
  | 'missing-board'
  | 'invalid-lane'
  | 'missing-metadata'
  | 'unknown-issue'
  | 'duplicate-card'
  | 'stale-status'
  | 'stale-checksum'
  | 'illegal-transition'
  | 'epic-transition';

export interface BoardStatusProposal {
  issueId: string;
  source: string;
  boardPath: string;
  boardLane: IssueStatus;
  recordedStatus: IssueStatus;
  currentStatus: IssueStatus;
  proposedStatus: IssueStatus;
  relativeIssuePath: string;
}

export interface BoardReconcileConflict {
  kind: ReconcileConflictKind;
  issueId?: string;
  message: string;
  boardLane?: string;
  source?: string;
}

export interface ReconcileBoardOptions {
  vaultRoot: string;
  space: string;
  apply?: boolean;
  now?: string;
}

export interface ReconcileBoardResult {
  space: string;
  boardRelativePath: string;
  proposals: BoardStatusProposal[];
  conflicts: BoardReconcileConflict[];
  applied: Array<{
    issueId: string;
    oldStatus: IssueStatus;
    newStatus: IssueStatus;
    relativePath: string;
  }>;
}
```

Implementation rules:

- Resolve registry board path with the same vault containment rules as board projection.
- Parse only headings of the form `## <status>` where `<status>` is in `ISSUE_STATUSES`.
- Parse task-list cards under the current lane.
- Extract metadata with a strict regex that requires `id`, `status`, `checksum`, and `source`.
- Recompute current checksum with `computeBoardProjectionChecksum(record.projection)`.
- Add proposals only when `boardLane !== currentStatus`.
- Add conflicts for invalid/missing metadata, unknown issue, duplicate id, stale status/checksum, illegal transition, and epic movement.
- Do not write in this task.

- [ ] **Step 4: Export reconciliation API**

Modify `packages/core/src/index.ts`:

```ts
export * from './boards/reconcile-board';
```

- [ ] **Step 5: Run parser/proposal tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/reconcile-board.test.ts tests/obsidian-board-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/core/src/boards/reconcile-board.ts packages/core/src/index.ts packages/core/tests/reconcile-board.test.ts packages/core/tests/helpers/phase3-vault.ts
rtk git commit -m "feat: detect board reconciliation proposals"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## Task 4: Apply Reconciliation Through Move Service

**Files:**

- Modify: `packages/core/src/boards/reconcile-board.ts`
- Modify: `packages/core/tests/reconcile-board.test.ts`

- [ ] **Step 1: Add failing apply and all-or-nothing tests**

Append to `packages/core/tests/reconcile-board.test.ts`:

```ts
it('applies legal proposals through the shared move service', async () => {
  const vaultRoot = await makePhase3Vault({ status: 'TODO' });
  const projection = await collectBoardProjection({
    vaultRoot,
    space: 'vibe-coding',
    generatedAt: '2026-05-13T10:00:00.000Z',
  });
  await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
  await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

  const result = await reconcileBoard({
    vaultRoot,
    space: 'vibe-coding',
    apply: true,
    now: '2026-05-13T10:05:00.000Z',
  });

  expect(result.conflicts).toEqual([]);
  expect(result.applied).toEqual([
    expect.objectContaining({ issueId: 'VC-001', oldStatus: 'TODO', newStatus: 'READY' }),
  ]);
  await expect(fs.readFile(path.join(vaultRoot, result.applied[0].relativePath), 'utf8'))
    .resolves.toContain('status: READY');
});

it('does not apply any proposal when one card conflicts', async () => {
  const vaultRoot = await makePhase3Vault({ status: 'TODO', secondIssue: { id: 'VC-002', status: 'READY' } });
  const projection = await collectBoardProjection({
    vaultRoot,
    space: 'vibe-coding',
    generatedAt: '2026-05-13T10:00:00.000Z',
  });
  let board = moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY');
  board = moveCardToLane(board, 'VC-002', 'DONE');
  await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
  await fs.writeFile(projection.boardPath, board);

  const result = await reconcileBoard({ vaultRoot, space: 'vibe-coding', apply: true });

  expect(result.applied).toEqual([]);
  expect(result.conflicts).toEqual([
    expect.objectContaining({ issueId: 'VC-002', kind: 'illegal-transition' }),
  ]);
  await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
    .resolves.toContain('status: TODO');
});
```

- [ ] **Step 2: Run the focused RED test**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/reconcile-board.test.ts
```

Expected: FAIL because apply returns no applied moves.

- [ ] **Step 3: Implement apply orchestration**

In `packages/core/src/boards/reconcile-board.ts`:

- Build proposals and conflicts first.
- If `apply !== true`, return proposals/conflicts without writing.
- If conflicts exist, return with `applied: []`.
- If no conflicts, apply proposals sequentially with `moveIssueStatus`.
- Pass reason `reconcile-board:<space>`.
- Preserve all-or-nothing by doing every validation before the first write.

- [ ] **Step 4: Run reconciliation tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- tests/reconcile-board.test.ts tests/issue-mover.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/core/src/boards/reconcile-board.ts packages/core/tests/reconcile-board.test.ts
rtk git commit -m "feat: apply board reconciliation safely"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## Task 5: CLI Commands

**Files:**

- Create: `packages/cli/src/commands/move.ts`
- Create: `packages/cli/src/commands/reconcile-board.ts`
- Create: `packages/cli/tests/move-reconcile.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write failing CLI integration tests**

Create `packages/cli/tests/move-reconcile.test.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src';
import { makePhase3Vault, moveCardToLane } from '../../core/tests/helpers/phase3-vault';
import { collectBoardProjection } from '@kanban-task-engine/core';

describe('move and reconcile-board CLI', () => {
  it('moves an issue through CLI', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });

    const result = await runCli(['move', 'VC-001', 'READY'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('moved VC-001 TODO -> READY');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: READY');
  });

  it('dry-runs board reconciliation by default', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await runCli(['reconcile-board', '--space', 'vibe-coding'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('board changes for vibe-coding');
    expect(result.stdout).toContain('VC-001 TODO -> READY');
  });

  it('applies board reconciliation only with --apply', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await runCli(['reconcile-board', '--space', 'vibe-coding', '--apply'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('applied board changes for vibe-coding');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: READY');
  });
});
```

- [ ] **Step 2: Run the focused RED test**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/cli test -- tests/move-reconcile.test.ts
```

Expected: FAIL with unknown command `move` or missing command module.

- [ ] **Step 3: Implement `commandMove`**

Create `packages/cli/src/commands/move.ts`:

```ts
import { isIssueStatus } from '@kanban-task-engine/schema';
import { moveIssueStatus } from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

export const commandMove: CliHandler = async (args, context) => {
  const parsed = parseMoveArgs(args);
  if ('exitCode' in parsed) return parsed;
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for move');

  try {
    const result = await moveIssueStatus({
      vaultRoot: context.vaultRoot,
      issueId: parsed.issueId,
      targetStatus: parsed.status,
      dryRun: parsed.dryRun,
      reason: parsed.reason,
    });
    const verb = result.dryRun ? 'would move' : 'moved';
    return ok(`${verb} ${result.issueId} ${result.oldStatus} -> ${result.newStatus}: ${result.relativePath}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};
```

Complete `parseMoveArgs` in the same file:

- Require `<issue-id>` and `<status>`.
- Validate issue id with `/^[A-Z][A-Z0-9]*-\d+$/`.
- Validate status with `isIssueStatus`.
- Support `--reason <text>`.
- Support `--dry-run`.
- Reject unknown options.

- [ ] **Step 4: Implement `commandReconcileBoard`**

Create `packages/cli/src/commands/reconcile-board.ts`:

```ts
import { reconcileBoard } from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

export const commandReconcileBoard: CliHandler = async (args, context) => {
  const parsed = parseReconcileArgs(args);
  if ('exitCode' in parsed) return parsed;
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for reconcile-board');

  try {
    const result = await reconcileBoard({
      vaultRoot: context.vaultRoot,
      space: parsed.space,
      apply: parsed.apply,
    });
    if (result.conflicts.length > 0) {
      return fail(formatConflicts(result.space, result.conflicts));
    }
    if (result.proposals.length === 0) {
      return ok(`no board changes for ${result.space}`);
    }
    return ok(parsed.apply ? formatApplied(result) : formatDryRun(result));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};
```

Complete `parseReconcileArgs`, `formatConflicts`, `formatDryRun`, and `formatApplied` in the same file:

- Require `--space <space>`.
- Default to dry-run if neither flag is present.
- Reject `--dry-run --apply` together.
- Print one line per proposal/conflict with deterministic issue id ordering.

- [ ] **Step 5: Register commands and help text**

Modify `packages/cli/src/index.ts`:

```ts
import { commandMove } from './commands/move.js';
import { commandReconcileBoard } from './commands/reconcile-board.js';
```

Add handlers:

```ts
move: commandMove,
'reconcile-board': commandReconcileBoard,
```

Update help text:

```text
  move <issue-id> <status> [--reason <text>] [--dry-run]
  reconcile-board --space <space> [--dry-run|--apply]
```

- [ ] **Step 6: Run CLI tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/cli test -- tests/move-reconcile.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/cli/src/commands/move.ts packages/cli/src/commands/reconcile-board.ts packages/cli/src/index.ts packages/cli/tests/move-reconcile.test.ts
rtk git commit -m "feat: add move and reconcile-board commands"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## Task 6: Docs, Runtime Smoke, and Review Gate

**Files:**

- Modify: `docs/kanban-runtime.md`
- Modify: `docs/deploy-checklist.md`

- [ ] **Step 1: Update operator docs**

In `docs/kanban-runtime.md`, add a section after board write:

```markdown
### Moving Issues

`kanban move <issue-id> <status>` is the canonical CLI mutation path for issue status. It updates issue frontmatter and preserves generated board files as projections. Use `kanban board --write --space <space>` after a move to refresh Obsidian views.

`kanban reconcile-board --space <space>` reads a generated Obsidian Kanban board and reports proposed card movements. It is dry-run by default. `--apply` writes issue frontmatter only when every proposal passes stale, duplicate, and state-machine checks.
```

- [ ] **Step 2: Update deploy checklist**

In `docs/deploy-checklist.md`, add Phase 3 mutation checks:

```markdown
- [ ] Run disposable-vault `kanban move` smoke and confirm only issue frontmatter changed.
- [ ] Run disposable-vault `reconcile-board --dry-run` after a board lane edit and confirm exact diff.
- [ ] Run disposable-vault `reconcile-board --apply` and regenerate board with `board --write`.
- [ ] Demonstrate stale board conflict by editing an issue after board generation.
```

- [ ] **Step 3: Run full local verification**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/schema test -- tests/status.test.ts
rtk pnpm --filter @kanban-task-engine/core test -- tests/state-machine.test.ts tests/registry-issue-source.test.ts tests/issue-mover.test.ts tests/reconcile-board.test.ts
rtk pnpm --filter @kanban-task-engine/cli test -- tests/move-reconcile.test.ts
rtk pnpm -r build
rtk pnpm -r test
rtk pnpm test:docs
rtk pnpm docs:verify
rtk pnpm eval:hardening
```

Expected: PASS.

- [ ] **Step 4: Run disposable runtime smoke**

Create a disposable vault, then run:

```bash
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine "Move smoke"
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js move VC-001 READY
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --space vibe-coding
```

Edit `boards/vibe-coding.md` in the disposable vault by moving the `VC-001` card under `RUNNING`, then run:

```bash
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js reconcile-board --space vibe-coding --dry-run
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js reconcile-board --space vibe-coding --apply
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --space vibe-coding
```

Expected:

- dry-run prints `VC-001 READY -> RUNNING`,
- apply updates the issue note to `status: RUNNING`,
- regenerated board shows `VC-001` in the `RUNNING` lane.

- [ ] **Step 5: Request review**

Use `superpowers:requesting-code-review` after tests and runtime smoke pass. Ask reviewers to focus on:

- stale conflict correctness,
- all-or-nothing apply behavior,
- path traversal/symlink safety,
- no accidental live vault mutation,
- no agent execution trigger from board movement,
- CLI error messages and exit codes.

- [ ] **Step 6: Commit docs and final fixes**

```bash
rtk git add docs/kanban-runtime.md docs/deploy-checklist.md
rtk git commit -m "docs: document move and reconcile operations"
```

Commit footer:

```text
Co-Authored-By: Codex GPT-5 <noreply@openai.com>
```

## 3. Final Acceptance

Phase 3 can claim completion only after all of the following are true:

- Unit and CLI tests pass.
- `pnpm -r build`, `pnpm -r test`, `pnpm test:docs`, `pnpm docs:verify`, and `pnpm eval:hardening` pass.
- Disposable vault runtime smoke proves `move`, `board --write`, `reconcile-board --dry-run`, and `reconcile-board --apply`.
- Stale board conflict is demonstrated.
- Obsidian GUI claim is stated separately from CLI/runtime claim.
- Live vault mutation is either not performed or separately approved and logged.
