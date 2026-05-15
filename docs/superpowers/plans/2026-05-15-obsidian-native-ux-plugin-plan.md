# Phase 3 Obsidian-native UX Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop Obsidian companion plugin so users can create, normalize, sync, preview/apply board moves, and explicitly promote raw Kanban cards without leaving Obsidian.

**Architecture:** Extract plugin-safe core use-cases behind a `VaultPort`, keep CLI commands as thin facades, and add `packages/obsidian-plugin` as a repo-local desktop Obsidian plugin. The plugin uses Obsidian `Vault` APIs for vault I/O, registers all commands in Command Palette, and exposes one safe ribbon menu/status entrypoint.

**Tech Stack:** TypeScript, pnpm workspace, Vitest, esbuild, Obsidian Plugin API, Obsidian Vault API, Obsidian CLI for desktop smoke/E2E.

---

## 0. Locked Spec Inputs

Use this accepted spec as the source of truth:

- `docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec.md`
- Review page: `docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec-review.html`
- Visual decision page: `docs/design/phase-3-obsidian-native-ux.html`

Implementation must preserve these accepted decisions:

1. Desktop Obsidian only. Mobile Obsidian is out of scope.
2. Obsidian companion plugin is repo-local, not a SaaS or external app.
3. Plugin must not shell out to `kanban` CLI for MVP commands.
4. Core business behavior must live behind plugin-safe use-cases and a `VaultPort`.
5. Issue frontmatter remains source of truth; board files remain generated projections and proposal input.
6. Raw card promotion is in Phase 3, but only through explicit command and confirmation modal.
7. `New Task` keeps the user on the board by default; opening the issue is optional.
8. Dev symlink install is allowed, but official smoke/E2E evidence must use copy-installed artifacts.
9. One default ribbon icon opens a safe menu/status panel only; it must not directly write/apply/sync.

Official docs that constrain the implementation:

- Obsidian plugin dev tutorial: <https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin>
- Obsidian Vault API: <https://docs.obsidian.md/Plugins/Vault>
- Obsidian API README: <https://github.com/obsidianmd/obsidian-api/blob/master/README.md>
- Obsidian sample plugin: <https://github.com/obsidianmd/obsidian-sample-plugin>
- Obsidian CLI: <https://obsidian.md/help/cli>

## 1. Preflight

- [ ] **Step 1: Start from a clean implementation worktree**

Run:

```bash
rtk git fetch origin
rtk git worktree add .worktrees/phase-3-obsidian-plugin -b codex/phase-3-obsidian-plugin origin/main
cd .worktrees/phase-3-obsidian-plugin
```

Expected:

```text
Preparing worktree (new branch 'codex/phase-3-obsidian-plugin')
HEAD is now at <origin/main>
```

- [ ] **Step 2: Copy accepted spec docs into the implementation worktree if they are not already committed**

If the docs were not committed before implementation, copy these files from the parent checkout into the worktree:

```bash
rtk cp ../docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec.md docs/superpowers/specs/
rtk cp ../docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec-review.html docs/superpowers/specs/
rtk cp ../docs/design/phase-3-obsidian-native-ux.html docs/design/
rtk cp ../docs/design/README.md docs/design/README.md
```

Expected:

```text
No output from cp; files exist in the worktree.
```

- [ ] **Step 3: Install and verify baseline**

Run:

```bash
rtk pnpm install --frozen-lockfile
rtk pnpm -r build
rtk pnpm test:docs
```

Expected:

```text
All workspace build steps exit 0.
docs:verify reports ALL CHECKS PASSED.
```

## 2. File Ownership Map

Use these write scopes to split subagents without conflicts.

| Slice | Primary files |
| --- | --- |
| Core ports | `packages/core/src/ports/*`, `packages/core/tests/ports/*`, `packages/core/src/index.ts` |
| Core use-cases | `packages/core/src/use-cases/*`, `packages/core/tests/use-cases/*`, focused edits to existing `authoring`, `boards`, `movement` modules |
| CLI facade regression | `packages/cli/src/commands/*`, `packages/cli/tests/*` |
| Obsidian plugin package | `packages/obsidian-plugin/**` |
| Plugin dev/smoke scripts | `scripts/obsidian-plugin-*`, root `package.json`, `docs/kanban-runtime.md`, `docs/deploy-checklist.md` |
| Docs and visual status | `docs/design/*`, `docs/superpowers/specs/*`, `docs/superpowers/plans/*` |

## 3. Task 1: Add VaultPort and Test Adapters

**Files:**

- Create: `packages/core/src/ports/vault-port.ts`
- Create: `packages/core/src/ports/node-fs-vault-port.ts`
- Create: `packages/core/tests/ports/vault-port.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for port semantics**

Create `packages/core/tests/ports/vault-port.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NodeFsVaultPort } from '../../src/ports/node-fs-vault-port';

describe('NodeFsVaultPort', () => {
  it('creates, reads, processes, and lists vault-relative markdown files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-'));
    const vault = new NodeFsVaultPort(root);

    await vault.create('issues/vibe-coding/VC-001.md', '# One\n');
    expect(await vault.exists('issues/vibe-coding/VC-001.md')).toBe(true);
    expect(await vault.read('issues/vibe-coding/VC-001.md')).toBe('# One\n');

    await vault.process('issues/vibe-coding/VC-001.md', content => content.replace('One', 'Two'));

    expect(await readFile(path.join(root, 'issues/vibe-coding/VC-001.md'), 'utf8')).toBe('# Two\n');
    expect(await vault.listMarkdownFiles('issues')).toEqual(['issues/vibe-coding/VC-001.md']);
  });

  it('rejects absolute and escaping paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-'));
    const vault = new NodeFsVaultPort(root);

    await expect(vault.read('/tmp/outside.md')).rejects.toThrow('Unsafe vault-relative path');
    await expect(vault.create('../outside.md', '# nope')).rejects.toThrow('Unsafe vault-relative path');
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- ports/vault-port.test.ts
```

Expected:

```text
FAIL ... Cannot find module '../../src/ports/node-fs-vault-port'
```

- [ ] **Step 3: Implement `VaultPort` and `NodeFsVaultPort`**

Create `packages/core/src/ports/vault-port.ts`:

```ts
export interface VaultPort {
  read(relativePath: string): Promise<string>;
  cachedRead?(relativePath: string): Promise<string>;
  exists(relativePath: string): Promise<boolean>;
  create(relativePath: string, content: string): Promise<void>;
  process(relativePath: string, updater: (content: string) => string): Promise<string | void>;
  listMarkdownFiles(root?: string): Promise<string[]>;
}

export function assertVaultRelativePath(relativePath: string): void {
  const segments = relativePath.split('/');
  if (
    relativePath.trim() === '' ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    relativePath.includes('//') ||
    relativePath.startsWith('/') ||
    segments.includes('..')
  ) {
    throw new Error(`Unsafe vault-relative path: ${relativePath}`);
  }
}
```

Create `packages/core/src/ports/node-fs-vault-port.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertVaultRelativePath, type VaultPort } from './vault-port';

export class NodeFsVaultPort implements VaultPort {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async read(relativePath: string): Promise<string> {
    return fs.readFile(this.resolve(relativePath), 'utf8');
  }

  async cachedRead(relativePath: string): Promise<string> {
    return this.read(relativePath);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async create(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const handle = await fs.open(absolutePath, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
  }

  async process(relativePath: string, updater: (content: string) => string): Promise<string> {
    const absolutePath = this.resolve(relativePath);
    const current = await fs.readFile(absolutePath, 'utf8');
    const next = updater(current);
    await fs.writeFile(absolutePath, next, 'utf8');
    return next;
  }

  async listMarkdownFiles(root = ''): Promise<string[]> {
    if (root !== '') assertVaultRelativePath(root);
    const start = root === '' ? this.root : this.resolve(root);
    const results: string[] = [];
    await this.walk(start, results);
    return results.sort();
  }

  private async walk(directory: string, results: string[]): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.walk(absolutePath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(this.root, absolutePath).split(path.sep).join('/'));
      }
    }
  }

  private resolve(relativePath: string): string {
    assertVaultRelativePath(relativePath);
    const absolutePath = path.resolve(this.root, relativePath);
    if (absolutePath !== this.root && !absolutePath.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Vault path escapes root: ${relativePath}`);
    }
    return absolutePath;
  }
}
```

Modify `packages/core/src/index.ts`:

```ts
export type { VaultPort } from './ports/vault-port';
export { assertVaultRelativePath } from './ports/vault-port';
export { NodeFsVaultPort } from './ports/node-fs-vault-port';
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- ports/vault-port.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  2 passed
```

- [ ] **Step 5: Commit**

```bash
rtk git add packages/core/src/ports packages/core/tests/ports packages/core/src/index.ts
rtk git commit -m "feat(core): add vault port abstraction"
```

## 4. Task 2: Extract Plugin-safe Authoring and Board Use-cases

**Files:**

- Create: `packages/core/src/use-cases/obsidian-authoring.ts`
- Create: `packages/core/src/use-cases/obsidian-board-sync.ts`
- Create: `packages/core/tests/use-cases/obsidian-authoring.test.ts`
- Create: `packages/core/tests/use-cases/obsidian-board-sync.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify only if needed: `packages/core/src/authoring/*`, `packages/core/src/boards/*`

- [ ] **Step 1: Write failing authoring use-case test**

Create `packages/core/tests/use-cases/obsidian-authoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, createObsidianTask } from '../../src';

async function seedRegistry(root: string): Promise<void> {
  await mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(root, 'issues/vibe-coding/epics'), { recursive: true });
  await mkdir(path.join(root, 'boards'), { recursive: true });
  await writeFile(path.join(root, 'registry.yaml'), [
    'spaces:',
    '  vibe-coding:',
    '    type: project',
    '    idPrefix: VC',
    '    issues: issues/vibe-coding',
    '    epics: issues/vibe-coding/epics',
    '    board: boards/vibe-coding.md',
    '    epicBoard: boards/vibe-coding-epics.md',
    '    projects:',
    '      kanban-task-engine:',
    '        issueRoot: issues/vibe-coding/kanban-task-engine',
    '',
  ].join('\n'));
}

describe('createObsidianTask', () => {
  it('creates a canonical issue and keeps board sync as a separate structured result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-'));
    await seedRegistry(root);
    const vault = new NodeFsVaultPort(root);

    const result = await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    });

    expect(result.issueId).toBe('VC-001');
    expect(result.issuePath).toBe('issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md');
    expect(result.boardPath).toBeUndefined();
    expect(await readFile(path.join(root, result.issuePath), 'utf8')).toContain('status: TODO');
  });
});
```

- [ ] **Step 2: Run authoring test and verify RED**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- use-cases/obsidian-authoring.test.ts
```

Expected:

```text
FAIL ... createObsidianTask is not exported
```

- [ ] **Step 3: Implement the minimal authoring wrapper**

Create `packages/core/src/use-cases/obsidian-authoring.ts`:

```ts
import type { CreateIssueInput } from '../authoring';
import { createIssue } from '../authoring';
import type { VaultPort } from '../ports/vault-port';
import { writeObsidianBoardForSpace } from './obsidian-board-sync';

export interface CreateObsidianTaskInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  priority?: CreateIssueInput['priority'];
  executor?: CreateIssueInput['executor'];
  now?: Date;
  syncBoard?: boolean;
}

export interface CreateObsidianTaskResult {
  issueId: string;
  issuePath: string;
  boardPath?: string;
  warnings: string[];
}

export async function createObsidianTask(input: CreateObsidianTaskInput): Promise<CreateObsidianTaskResult> {
  const created = await createIssue({
    vaultRoot: input.vaultRoot,
    space: input.space,
    project: input.project,
    title: input.title,
    priority: input.priority,
    executor: input.executor,
    now: input.now,
  });

  let boardPath: string | undefined;
  if (input.syncBoard ?? true) {
    const synced = await writeObsidianBoardForSpace({
      vault: input.vault,
      vaultRoot: input.vaultRoot,
      space: input.space,
      generatedAt: input.now?.toISOString(),
    });
    boardPath = synced.boardPath;
  }

  return {
    issueId: created.id,
    issuePath: created.relativePath,
    boardPath,
    warnings: created.warnings,
  };
}
```

Create `packages/core/src/use-cases/obsidian-board-sync.ts`:

```ts
import { collectBoardProjection } from '../boards/board-projection';
import type { VaultPort } from '../ports/vault-port';

export interface WriteObsidianBoardForSpaceInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  generatedAt?: string;
}

export interface WriteObsidianBoardForSpaceResult {
  boardPath: string;
  indexPath: string;
  issueCount: number;
}

export async function writeObsidianBoardForSpace(input: WriteObsidianBoardForSpaceInput): Promise<WriteObsidianBoardForSpaceResult> {
  const projection = await collectBoardProjection({
    vaultRoot: input.vaultRoot,
    space: input.space,
    generatedAt: input.generatedAt,
  });

  await input.vault.process(projection.boardRelativePath, () => projection.boardMarkdown).catch(async error => {
    if (isMissingFile(error)) await input.vault.create(projection.boardRelativePath, projection.boardMarkdown);
    else throw error;
  });
  await input.vault.process(projection.indexRelativePath, () => projection.indexMarkdown).catch(async error => {
    if (isMissingFile(error)) await input.vault.create(projection.indexRelativePath, projection.indexMarkdown);
    else throw error;
  });

  return {
    boardPath: projection.boardRelativePath,
    indexPath: projection.indexRelativePath,
    issueCount: projection.issueCount,
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && /ENOENT|not exist|Not found/i.test(error.message);
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from './use-cases/obsidian-authoring';
export * from './use-cases/obsidian-board-sync';
```

- [ ] **Step 4: Run authoring tests and existing authoring tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- use-cases/obsidian-authoring.test.ts create-issue.test.ts authoring-runtime-smoke.test.ts
```

Expected:

```text
All selected tests pass.
```

- [ ] **Step 5: Add and run board sync test**

Create `packages/core/tests/use-cases/obsidian-board-sync.test.ts` with a seeded registry and one issue; assert `writeObsidianBoardForSpace()` writes `kanban-plugin: board`, `## TODO`, and `kanban-task-engine:id=VC-001`.

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- use-cases/obsidian-board-sync.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 6: Commit**

```bash
rtk git add packages/core/src/use-cases packages/core/tests/use-cases packages/core/src/index.ts
rtk git commit -m "feat(core): add obsidian-safe authoring use cases"
```

## 5. Task 3: Add Port-safe Reconcile, Move, and Raw Promotion Use-cases

**Files:**

- Create: `packages/core/src/use-cases/obsidian-board-reconcile.ts`
- Create: `packages/core/src/use-cases/obsidian-raw-card-promotion.ts`
- Create: `packages/core/tests/use-cases/obsidian-board-reconcile.test.ts`
- Create: `packages/core/tests/use-cases/obsidian-raw-card-promotion.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing reconcile preview/apply test**

Create `packages/core/tests/use-cases/obsidian-board-reconcile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, createObsidianTask, previewObsidianBoardMoves, applyObsidianBoardMoves } from '../../src';
import { seedVibeCodingRegistry } from '../support/seed-vault';

describe('obsidian board reconcile use-cases', () => {
  it('previews and applies a board lane move through structured results', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-reconcile-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);
    await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Preview move in Obsidian',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: true,
    });
    await vault.process('boards/vibe-coding.md', content => content.replace('## TODO', '## TODO').replace('## READY\n', '## READY\n'));
    await vault.process('boards/vibe-coding.md', content => content.replace('## TODO\n\n- [ ]', '## TODO\n\n## READY\n\n- [ ]'));

    const preview = await previewObsidianBoardMoves({ vaultRoot: root, space: 'vibe-coding' });

    expect(preview.conflicts).toEqual([]);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]).toMatchObject({ issueId: 'VC-001', currentStatus: 'TODO', proposedStatus: 'READY' });

    const applied = await applyObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      expectedChanges: preview.changes,
      now: '2026-05-15T00:01:00.000Z',
    });

    expect(applied.applied).toHaveLength(1);
    expect(applied.boardPath).toBe('boards/vibe-coding.md');
  });
});
```

If the seed helper does not exist yet, create `packages/core/tests/support/seed-vault.ts` in this task and reuse it in later tests.

- [ ] **Step 2: Run reconcile test and verify RED**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- use-cases/obsidian-board-reconcile.test.ts
```

Expected:

```text
FAIL ... previewObsidianBoardMoves is not exported
```

- [ ] **Step 3: Implement reconcile use-case wrappers**

Create `packages/core/src/use-cases/obsidian-board-reconcile.ts`:

```ts
import type { BoardStatusProposal } from '../boards/reconcile-board';
import { reconcileBoard } from '../boards/reconcile-board';
import type { VaultPort } from '../ports/vault-port';
import { writeObsidianBoardForSpace } from './obsidian-board-sync';

export interface PreviewObsidianBoardMovesInput {
  vaultRoot: string;
  space: string;
}

export interface ApplyObsidianBoardMovesInput extends PreviewObsidianBoardMovesInput {
  vault: VaultPort;
  expectedChanges: BoardStatusProposal[];
  now?: string;
}

export async function previewObsidianBoardMoves(input: PreviewObsidianBoardMovesInput) {
  const result = await reconcileBoard({
    vaultRoot: input.vaultRoot,
    space: input.space,
    apply: false,
  });
  return { changes: result.proposals, conflicts: result.conflicts, boardPath: result.boardRelativePath };
}

export async function applyObsidianBoardMoves(input: ApplyObsidianBoardMovesInput) {
  const preview = await previewObsidianBoardMoves(input);
  assertExpectedChanges(preview.changes, input.expectedChanges);
  if (preview.conflicts.length > 0) {
    return { applied: [], conflicts: preview.conflicts, boardPath: preview.boardPath };
  }
  const applied = await reconcileBoard({
    vaultRoot: input.vaultRoot,
    space: input.space,
    apply: true,
    now: input.now,
  });
  const board = await writeObsidianBoardForSpace({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
    space: input.space,
    generatedAt: input.now,
  });
  return { applied: applied.applied, conflicts: applied.conflicts, boardPath: board.boardPath };
}

function assertExpectedChanges(actual: BoardStatusProposal[], expected: BoardStatusProposal[]): void {
  const key = (change: BoardStatusProposal) => `${change.issueId}:${change.currentStatus}->${change.proposedStatus}`;
  const actualKeys = actual.map(key).sort();
  const expectedKeys = expected.map(key).sort();
  if (actualKeys.join('|') !== expectedKeys.join('|')) {
    throw new Error('Board move preview changed before apply; preview again before applying');
  }
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from './use-cases/obsidian-board-reconcile';
```

- [ ] **Step 4: Add explicit raw card promotion tests**

Create `packages/core/tests/use-cases/obsidian-raw-card-promotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, promoteRawBoardCard } from '../../src';
import { seedVibeCodingRegistry } from '../support/seed-vault';

describe('promoteRawBoardCard', () => {
  it('requires explicit confirmation before creating a canonical issue', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-raw-card-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);
    await vault.create('boards/vibe-coding.md', [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## TODO',
      '',
      '- [ ] Draft card from board',
      '',
      '%% kanban:settings',
      '{}',
      '%%',
      '',
    ].join('\n'));

    await expect(promoteRawBoardCard({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Draft card from board',
      lane: 'TODO',
      confirmed: false,
    })).rejects.toThrow('Raw card promotion requires explicit confirmation');
  });
});
```

- [ ] **Step 5: Implement raw card promotion use-case**

Create `packages/core/src/use-cases/obsidian-raw-card-promotion.ts`:

```ts
import type { IssueStatus } from '@kanban-task-engine/schema';
import type { VaultPort } from '../ports/vault-port';
import { createObsidianTask } from './obsidian-authoring';

export interface PromoteRawBoardCardInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  lane: IssueStatus;
  confirmed: boolean;
}

export async function promoteRawBoardCard(input: PromoteRawBoardCardInput) {
  if (!input.confirmed) throw new Error('Raw card promotion requires explicit confirmation');
  return createObsidianTask({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
    space: input.space,
    project: input.project,
    title: input.title,
    syncBoard: true,
  });
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from './use-cases/obsidian-raw-card-promotion';
```

- [ ] **Step 6: Run use-case tests**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/core test -- use-cases/obsidian-board-reconcile.test.ts use-cases/obsidian-raw-card-promotion.test.ts
```

Expected:

```text
Selected use-case tests pass.
```

- [ ] **Step 7: Commit**

```bash
rtk git add packages/core/src/use-cases packages/core/tests/use-cases packages/core/tests/support packages/core/src/index.ts
rtk git commit -m "feat(core): add obsidian reconcile and raw promotion use cases"
```

## 6. Task 4: Keep CLI Facades Green After Extraction

**Files:**

- Modify: `packages/cli/src/commands/new.ts`
- Modify: `packages/cli/src/commands/normalize.ts`
- Modify: `packages/cli/src/commands/board.ts`
- Modify: `packages/cli/src/commands/reconcile-board.ts`
- Modify: `packages/cli/src/commands/move.ts`
- Modify or add: `packages/cli/tests/obsidian-plugin-compat.test.ts`

- [ ] **Step 1: Write CLI regression tests for unchanged commands**

Create `packages/cli/tests/obsidian-plugin-compat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src';

async function seedVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kte-cli-compat-'));
  await mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(root, 'issues/vibe-coding/epics'), { recursive: true });
  await mkdir(path.join(root, 'boards'), { recursive: true });
  await writeFile(path.join(root, 'registry.yaml'), [
    'spaces:',
    '  vibe-coding:',
    '    type: project',
    '    idPrefix: VC',
    '    issues: issues/vibe-coding',
    '    epics: issues/vibe-coding/epics',
    '    board: boards/vibe-coding.md',
    '    epicBoard: boards/vibe-coding-epics.md',
    '    projects:',
    '      kanban-task-engine:',
    '        issueRoot: issues/vibe-coding/kanban-task-engine',
    '',
  ].join('\n'));
  return root;
}

describe('CLI compatibility after Obsidian use-case extraction', () => {
  it('keeps new and board --write behavior stable', async () => {
    const vaultRoot = await seedVault();
    const context = { vaultRoot, vaultRootExplicit: true };

    const created = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', 'CLI compatibility'], context);
    expect(created.exitCode).toBe(0);
    expect(created.stdout).toContain('created VC-001');

    const board = await runCli(['board', '--write', '--space', 'vibe-coding'], context);
    expect(board.exitCode).toBe(0);
    expect(board.stdout).toContain('wrote vibe-coding board');
  });
});
```

- [ ] **Step 2: Run CLI tests before refactor**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/cli test -- obsidian-plugin-compat.test.ts move-reconcile.test.ts obsidian-board.test.ts
```

Expected:

```text
Tests pass before facade cleanup.
```

- [ ] **Step 3: Refactor only when needed**

If core extraction changed CLI imports, update commands to call the new use-cases. Keep output strings exactly compatible with existing tests:

```ts
// Example shape only when commandNew needs to move to the new wrapper:
const result = await createObsidianTask({
  vault: new NodeFsVaultPort(context.vaultRoot),
  vaultRoot: context.vaultRoot,
  space: parsed.value.space,
  project: parsed.value.project,
  title: parsed.value.title,
  priority: parsed.value.priority,
  executor: parsed.value.executor,
  syncBoard: false,
});
```

Do not remove existing CLI options or change help text except to mention plugin docs later.

- [ ] **Step 4: Run full CLI test suite**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/cli test
```

Expected:

```text
All @kanban-task-engine/cli tests pass.
```

- [ ] **Step 5: Commit**

```bash
rtk git add packages/cli/src packages/cli/tests
rtk git commit -m "refactor(cli): preserve facades over obsidian use cases"
```

## 7. Task 5: Scaffold Desktop Obsidian Plugin Package

**Files:**

- Create: `packages/obsidian-plugin/package.json`
- Create: `packages/obsidian-plugin/manifest.json`
- Create: `packages/obsidian-plugin/tsconfig.json`
- Create: `packages/obsidian-plugin/esbuild.config.mjs`
- Create: `packages/obsidian-plugin/src/main.ts`
- Create: `packages/obsidian-plugin/src/settings.ts`
- Create: `packages/obsidian-plugin/src/commands.ts`
- Create: `packages/obsidian-plugin/src/vault-adapter.ts`
- Create: `packages/obsidian-plugin/tests/settings.test.ts`
- Create: `packages/obsidian-plugin/tests/command-registration.test.ts`

- [ ] **Step 1: Add failing plugin settings tests**

Create `packages/obsidian-plugin/tests/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('plugin settings', () => {
  it('defaults to board-first, desktop-safe UX', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      defaultSpace: 'vibe-coding',
      defaultPriority: 'P2',
      defaultExecutor: 'human',
      syncBoardAfterCreate: true,
      openIssueAfterCreate: false,
      showRibbonActions: true,
      requireApplyPreview: true,
    });
  });
});
```

- [ ] **Step 2: Add package scaffold and verify RED**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/obsidian-plugin test
```

Expected:

```text
No projects matched the filters
```

- [ ] **Step 3: Create plugin package metadata**

Create `packages/obsidian-plugin/package.json`:

```json
{
  "name": "@kanban-task-engine/obsidian-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "main.js",
  "scripts": {
    "build": "node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@kanban-task-engine/core": "workspace:*"
  },
  "devDependencies": {
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.23.0",
    "obsidian": "^1.7.2",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

Create `packages/obsidian-plugin/manifest.json`:

```json
{
  "id": "kanban-task-engine",
  "name": "Kanban Task Engine",
  "version": "0.1.0",
  "minAppVersion": "1.12.0",
  "description": "Obsidian-native control surface for kanban-task-engine Markdown issue vaults.",
  "author": "pureliture",
  "isDesktopOnly": true
}
```

Create `packages/obsidian-plugin/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["DOM", "ES2022"],
    "types": ["obsidian"],
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `packages/obsidian-plugin/esbuild.config.mjs` based on the official sample plugin style:

```js
import esbuild from 'esbuild';
import builtins from 'builtin-modules';

const production = process.argv[2] === 'production';

await esbuild.build({
  banner: { js: '/* kanban-task-engine Obsidian plugin */' },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands', '@codemirror/language', '@codemirror/lint', '@codemirror/search', '@codemirror/state', '@codemirror/view', '@lezer/common', '@lezer/highlight', '@lezer/lr', ...builtins],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  minify: production,
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});
```

- [ ] **Step 4: Create settings and minimal plugin entrypoint**

Create `packages/obsidian-plugin/src/settings.ts`:

```ts
export interface KanbanTaskEnginePluginSettings {
  defaultSpace: string;
  defaultProject?: string;
  defaultPriority: 'P0' | 'P1' | 'P2' | 'P3';
  defaultExecutor: string;
  syncBoardAfterCreate: boolean;
  openIssueAfterCreate: boolean;
  showRibbonActions: boolean;
  requireApplyPreview: true;
}

export const DEFAULT_SETTINGS: KanbanTaskEnginePluginSettings = {
  defaultSpace: 'vibe-coding',
  defaultProject: undefined,
  defaultPriority: 'P2',
  defaultExecutor: 'human',
  syncBoardAfterCreate: true,
  openIssueAfterCreate: false,
  showRibbonActions: true,
  requireApplyPreview: true,
};
```

Create `packages/obsidian-plugin/src/main.ts`:

```ts
import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type KanbanTaskEnginePluginSettings } from './settings';
import { registerKanbanTaskEngineCommands } from './commands';

export default class KanbanTaskEnginePlugin extends Plugin {
  settings: KanbanTaskEnginePluginSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    registerKanbanTaskEngineCommands(this);
    if (this.settings.showRibbonActions) {
      this.addRibbonIcon('list-checks', 'Kanban Task Engine', () => {
        new Notice('Kanban Task Engine menu/status panel');
      });
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

Create `packages/obsidian-plugin/src/commands.ts`:

```ts
import { Notice } from 'obsidian';
import type KanbanTaskEnginePlugin from './main';

export function registerKanbanTaskEngineCommands(plugin: KanbanTaskEnginePlugin): void {
  plugin.addCommand({
    id: 'new-task',
    name: 'New Task',
    callback: () => new Notice('Kanban Task Engine: New Task'),
  });
  plugin.addCommand({
    id: 'sync-current-board',
    name: 'Sync Current Board',
    callback: () => new Notice('Kanban Task Engine: Sync Current Board'),
  });
  plugin.addCommand({
    id: 'preview-board-moves',
    name: 'Preview Board Moves',
    callback: () => new Notice('Kanban Task Engine: Preview Board Moves'),
  });
  plugin.addCommand({
    id: 'apply-board-moves',
    name: 'Apply Board Moves',
    callback: () => new Notice('Kanban Task Engine: Apply Board Moves'),
  });
  plugin.addCommand({
    id: 'promote-raw-card',
    name: 'Promote Raw Card',
    callback: () => new Notice('Kanban Task Engine: Promote Raw Card'),
  });
  plugin.addCommand({
    id: 'normalize-current-note',
    name: 'Normalize Current Note',
    callback: () => new Notice('Kanban Task Engine: Normalize Current Note'),
  });
}
```

- [ ] **Step 5: Run plugin tests and build**

Run:

```bash
rtk pnpm install --frozen-lockfile
rtk pnpm --filter @kanban-task-engine/obsidian-plugin test
rtk pnpm --filter @kanban-task-engine/obsidian-plugin build
```

Expected:

```text
settings.test.ts passes.
main.js is emitted under packages/obsidian-plugin/main.js.
```

- [ ] **Step 6: Commit**

```bash
rtk git add packages/obsidian-plugin pnpm-lock.yaml
rtk git commit -m "feat(obsidian): scaffold desktop companion plugin"
```

## 8. Task 6: Implement Obsidian Vault Adapter and Command Modals

**Files:**

- Modify: `packages/obsidian-plugin/src/vault-adapter.ts`
- Create: `packages/obsidian-plugin/src/modals/new-task-modal.ts`
- Create: `packages/obsidian-plugin/src/modals/reconcile-preview-modal.ts`
- Create: `packages/obsidian-plugin/src/modals/promote-raw-card-modal.ts`
- Modify: `packages/obsidian-plugin/src/commands.ts`
- Test: `packages/obsidian-plugin/tests/vault-adapter.test.ts`
- Test: `packages/obsidian-plugin/tests/modal-validation.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create tests that mock the Obsidian `Vault` interface enough to verify:

- `read` delegates to `vault.read`.
- `cachedRead` delegates to `vault.cachedRead`.
- `process` delegates to `vault.process`.
- paths resolve through `getAbstractFileByPath` and require markdown files for read/process.

Run:

```bash
rtk pnpm --filter @kanban-task-engine/obsidian-plugin test -- vault-adapter.test.ts
```

Expected:

```text
FAIL ... ObsidianVaultPort is not exported
```

- [ ] **Step 2: Implement `ObsidianVaultPort`**

Create `packages/obsidian-plugin/src/vault-adapter.ts`:

```ts
import { TFile, type Vault } from 'obsidian';
import type { VaultPort } from '@kanban-task-engine/core';

export class ObsidianVaultPort implements VaultPort {
  constructor(private readonly vault: Vault) {}

  async read(relativePath: string): Promise<string> {
    return this.vault.read(this.file(relativePath));
  }

  async cachedRead(relativePath: string): Promise<string> {
    return this.vault.cachedRead(this.file(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(relativePath) instanceof TFile;
  }

  async create(relativePath: string, content: string): Promise<void> {
    await this.vault.create(relativePath, content);
  }

  async process(relativePath: string, updater: (content: string) => string): Promise<string> {
    return this.vault.process(this.file(relativePath), updater);
  }

  async listMarkdownFiles(root = ''): Promise<string[]> {
    return this.vault
      .getMarkdownFiles()
      .map(file => file.path)
      .filter(filePath => root === '' || filePath === root || filePath.startsWith(`${root}/`))
      .sort();
  }

  private file(relativePath: string): TFile {
    const file = this.vault.getAbstractFileByPath(relativePath);
    if (!(file instanceof TFile)) throw new Error(`Vault file not found: ${relativePath}`);
    return file;
  }
}
```

- [ ] **Step 3: Implement New Task modal**

The modal must require `title`, default to settings, call `createObsidianTask`, show `Notice('Created VC-001')`, and keep the user on the board unless `openIssueAfterCreate` is true.

- [ ] **Step 4: Implement Preview/Apply modal**

The preview modal must display changes and conflicts. The Apply button is disabled when conflicts exist. Apply must call `applyObsidianBoardMoves()` with the previewed changes, not re-infer blindly.

- [ ] **Step 5: Implement Promote Raw Card modal**

The modal must require explicit confirmation and call `promoteRawBoardCard({ confirmed: true })`. It must warn that acceptance criteria and execution intent are not inferred.

- [ ] **Step 6: Run plugin tests and build**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/obsidian-plugin test
rtk pnpm --filter @kanban-task-engine/obsidian-plugin build
```

Expected:

```text
Plugin tests pass.
Plugin build emits main.js.
```

- [ ] **Step 7: Commit**

```bash
rtk git add packages/obsidian-plugin/src packages/obsidian-plugin/tests
rtk git commit -m "feat(obsidian): wire commands to core use cases"
```

## 9. Task 7: Add Copy-based Smoke Installer and Dev Symlink Helper

**Files:**

- Create: `scripts/obsidian-plugin-dev-link.mjs`
- Create: `scripts/obsidian-plugin-smoke-install.mjs`
- Modify: `package.json`
- Modify: `docs/kanban-runtime.md`
- Modify: `docs/deploy-checklist.md`

- [ ] **Step 1: Add failing script existence test**

Add a docs or script test that asserts:

- `scripts/obsidian-plugin-dev-link.mjs` exists.
- `scripts/obsidian-plugin-smoke-install.mjs` exists.
- root `package.json` has `obsidian-plugin:dev-link` and `obsidian-plugin:smoke-install`.

Run:

```bash
rtk pnpm test:docs
```

Expected:

```text
FAIL ... missing obsidian plugin scripts
```

- [ ] **Step 2: Implement dev symlink helper**

`obsidian-plugin-dev-link.mjs` must:

- accept `--vault <path>`.
- create `<vault>/.obsidian/plugins/kanban-task-engine`.
- symlink the local plugin package directory or build output.
- print `dev-linked kanban-task-engine plugin`.
- clearly state it is not acceptance evidence.

- [ ] **Step 3: Implement copy smoke installer**

`obsidian-plugin-smoke-install.mjs` must:

- accept `--vault <path>`.
- run only after `packages/obsidian-plugin/main.js` exists.
- copy `manifest.json`, `main.js`, and `styles.css` if present.
- remove stale files from prior copy install.
- print `copy-installed kanban-task-engine plugin`.

- [ ] **Step 4: Add root scripts**

Modify root `package.json`:

```json
{
  "scripts": {
    "obsidian-plugin:dev-link": "node scripts/obsidian-plugin-dev-link.mjs",
    "obsidian-plugin:smoke-install": "node scripts/obsidian-plugin-smoke-install.mjs"
  }
}
```

Keep existing scripts unchanged.

- [ ] **Step 5: Update runtime and deploy docs**

`docs/kanban-runtime.md` must explain:

- dev symlink is only for local speed.
- copy install is required for official smoke/E2E.
- smoke vault must not be the main vault.

`docs/deploy-checklist.md` must add:

- plugin build gate.
- copy-installed smoke gate.
- Obsidian desktop GUI E2E gate when runtime is available.

- [ ] **Step 6: Verify docs and scripts**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/obsidian-plugin build
SMOKE_VAULT="$(mktemp -d)"
rtk pnpm obsidian-plugin:smoke-install -- --vault "$SMOKE_VAULT"
rtk test -f "$SMOKE_VAULT/.obsidian/plugins/kanban-task-engine/manifest.json"
rtk test -f "$SMOKE_VAULT/.obsidian/plugins/kanban-task-engine/main.js"
rtk pnpm test:docs
```

Expected:

```text
copy-installed kanban-task-engine plugin
docs:verify reports ALL CHECKS PASSED.
```

- [ ] **Step 7: Commit**

```bash
rtk git add scripts package.json docs/kanban-runtime.md docs/deploy-checklist.md
rtk git commit -m "chore(obsidian): add plugin install smoke scripts"
```

## 10. Task 8: Desktop Obsidian Smoke and GUI E2E

**Files:**

- Create: `scripts/obsidian-plugin-smoke-e2e.mjs`
- Modify: `docs/kanban-runtime.md`
- Modify: `docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec-review.html`
- Modify: `docs/design/phase-3-obsidian-native-ux.html`

- [ ] **Step 1: Implement smoke E2E script**

The script must:

- create a disposable vault.
- write `.obsidian/community-plugins.json` enabling `kanban-task-engine` and leave room for Kanban plugin when copied from a fixture.
- seed `registry.yaml`.
- copy-install the plugin artifacts.
- print exact next commands for Obsidian CLI when Obsidian runtime is unavailable.

- [ ] **Step 2: Run local non-GUI smoke**

Run:

```bash
rtk pnpm --filter @kanban-task-engine/obsidian-plugin build
rtk node scripts/obsidian-plugin-smoke-e2e.mjs --no-gui
```

Expected:

```text
created disposable vault: ...
copy-installed kanban-task-engine plugin
seeded registry.yaml
```

- [ ] **Step 3: Run desktop GUI smoke when Obsidian runtime is available**

Run:

```bash
obsidian plugin:reload id=kanban-task-engine
obsidian commands filter=kanban-task-engine
obsidian command id=kanban-task-engine:new-task
obsidian dev:screenshot path=/tmp/kte-obsidian-plugin-smoke.png
obsidian dev:errors
```

Expected:

```text
commands list includes new-task, sync-current-board, preview-board-moves, apply-board-moves, promote-raw-card, normalize-current-note.
dev:errors has no kanban-task-engine stack trace.
Screenshot shows the board with a newly created card.
```

- [ ] **Step 4: Run raw promotion GUI smoke**

In Obsidian Kanban board:

1. Create a raw card via `+ Add a card`.
2. Run `Kanban Task Engine: Promote Raw Card`.
3. Confirm the modal.
4. Verify generated issue and board refresh.

Then run:

```bash
rtk rg -n "status: TODO|# <raw-card-title>" "$SMOKE_VAULT/issues"
```

Expected:

```text
The promoted raw card exists as a canonical issue.
```

- [ ] **Step 5: Run final verification bundle**

Run:

```bash
rtk pnpm -r build
rtk pnpm -r test
rtk pnpm test:docs
rtk pnpm eval:hardening
rtk git diff --check
```

Expected:

```text
All commands exit 0.
```

- [ ] **Step 6: Commit**

```bash
rtk git add scripts docs
rtk git commit -m "test(obsidian): add desktop plugin smoke evidence"
```

## 11. Task 9: Final Review Package

**Files:**

- Modify: `docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec.md`
- Modify: `docs/superpowers/specs/2026-05-14-obsidian-native-ux-plugin-spec-review.html`
- Modify: `docs/design/phase-3-obsidian-native-ux.html`
- Create: `PR_SUMMARY.md` only if requested by the PR workflow.

- [ ] **Step 1: Update evidence sections**

Update docs to include:

- plugin package build command and result.
- copy-installed smoke result.
- desktop GUI E2E result or explicit reason it was skipped.
- raw promotion result.
- final verification bundle.

- [ ] **Step 2: Request multi-agent review**

Use `superpowers:requesting-code-review` and at least three review perspectives:

1. Spec compliance review.
2. Runtime/data-safety review.
3. Code simplification/maintainability review.

Review focus:

- No CLI shell-out from plugin.
- No direct plugin `fs` writes to vault state.
- Board remains projection.
- Copy install is required for official smoke.
- Ribbon icon is safe entrypoint only.

- [ ] **Step 3: Apply review fixes with TDD**

For each accepted finding:

1. Write a failing test or docs check.
2. Run it and verify RED.
3. Implement minimal fix.
4. Run focused tests and verify GREEN.
5. Run final verification bundle.

- [ ] **Step 4: Commit final docs/review updates**

```bash
rtk git add docs packages scripts package.json pnpm-lock.yaml
rtk git commit -m "docs(obsidian): record phase 3 plugin verification"
```

## 12. Done Criteria

Phase 3 implementation is complete only when:

- `packages/obsidian-plugin` builds and tests.
- Core use-cases are test-covered and CLI regressions pass.
- Copy-installed disposable vault smoke passes.
- Desktop Obsidian GUI E2E passes when runtime is available.
- Raw card promotion is explicit and tested.
- `New Task` remains on board by default.
- Ribbon icon opens safe menu/status panel only.
- `rtk pnpm -r build` passes.
- `rtk pnpm -r test` passes.
- `rtk pnpm test:docs` passes.
- `rtk pnpm eval:hardening` passes.
- No unrelated `.DS_Store`, `.pnpm-store`, live vault artifacts, or generated board state are staged.

## 13. Plan Self-review

Spec coverage:

- Desktop-only support: Task 5 manifest and Task 8 GUI smoke.
- Explicit raw card promotion: Task 3 core use-case and Task 8 GUI smoke.
- Board-stays-default New Task: Task 2 authoring result and Task 6 modal behavior.
- Copy install acceptance: Task 7 installer and Task 8 smoke.
- Safe ribbon entrypoint: Task 5 scaffold and Task 6 command/menu wiring.
- CLI compatibility: Task 4 regression.
- Docs/deploy readiness: Tasks 7 through 9.

No plan task may add GitHub/Jira remote sync, agent execution, mobile support, or automatic raw card promotion.

