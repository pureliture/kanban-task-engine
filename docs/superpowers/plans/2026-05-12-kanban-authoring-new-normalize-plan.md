# Kanban Authoring New Normalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 authoring commands so `kanban new` creates schema-valid issue files and `kanban normalize` deterministically converts rough vault notes into formal issue drafts without requiring an LLM.

**Architecture:** Core owns authoring, path resolution, ID scanning, placeholder detection, and no-overwrite writes under `packages/core/src/authoring/`. CLI commands are thin facades that parse args, reject implicit vault fallback for authoring flows, call core services, and format stdout/stderr/JSON. Documentation and deploy gates are updated in the same phase so runtime readiness claims remain tied to executable smoke commands.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest one-shot `vitest run`, YAML/gray-matter-compatible frontmatter handling, Node `fs/promises`, `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `context7`, `testing-strategy`, `documentation`, `deploy-checklist`, `tech-debt`, `code-simplifier`.

---

## 0. Source Contract And Review Inputs

**Spec:** `docs/superpowers/specs/2026-05-12-kanban-authoring-new-normalize-spec.md`

**Parent spec:** `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`

**Review findings already incorporated into the spec:**

- Authoring commands that resolve vault state must reject implicit Home vault fallback.
- New issue creation must use exclusive create semantics.
- Normalize in-place writes require exact registry root ownership.
- Placeholder-bearing rough notes cannot preserve `READY`, `RUNNING`, `REVIEW`, or `DONE`.
- Runtime smoke must use real built CLI invocation, not a missing package script.
- Generated Markdown must be parser-validated by executable tests.

## 1. Harness Routing By Task

| Task | Harness/plugins | Required use |
| --- | --- | --- |
| Task 0 | `superpowers:using-git-worktrees`, `architecture` | Create isolated implementation workspace from `main`; carry only accepted spec/plan docs. |
| Task 0.5 | `superpowers:test-driven-development`, `context7`, `deploy-checklist` | Fix built CLI Node runtime before authoring runtime smoke depends on it. |
| Task 1 | `testing-strategy`, `superpowers:test-driven-development`, `tech-debt` | Build core path/id/write safety with duplicate owner tracking and no CLI-local duplication. |
| Task 2 | `superpowers:test-driven-development`, `documentation` | Build issue factory and placeholder/readiness behavior from spec examples. |
| Task 3A | `superpowers:test-driven-development`, `tech-debt` | Build `createIssue` orchestration and exclusive create behavior. |
| Task 3B | `superpowers:test-driven-development`, `tech-debt` | Build rough-note parser and raw YAML preservation. |
| Task 3C | `superpowers:test-driven-development`, `tech-debt` | Build normalize ownership classifier and in-place/canonical write behavior. |
| Task 4 | `superpowers:test-driven-development`, `context7` | Wire CLI `new`/`normalize` with strict parsers and one-shot Vitest command tests. |
| Task 5 | `superpowers:test-driven-development`, `testing-strategy` | Add disposable built-CLI runtime smoke after build is externalized from Vitest. |
| Task 6 | `documentation`, `deploy-checklist` | Update runtime guide and deploy checklist with disposable smoke first and rollback. |
| Task 7 | `superpowers:verification-before-completion` | Run full verification and disposable vault smoke before any completion claim. |
| Review | `superpowers:requesting-code-review`, `code-simplifier` | Review for correctness and simplify after behavior is green. |

## 1.1 Subagent Review Loop

When implementing this plan with `superpowers:subagent-driven-development`, every implementation task after Task 0 must use this loop before moving to the next task:

1. Dispatch one implementer subagent with only that task's text, file scope, source spec references, and expected commands.
2. After implementation, dispatch a spec-compliance reviewer for that task.
3. Fix every P0/P1 spec finding in the same task scope.
4. Dispatch a code-quality reviewer for that task.
5. Fix every P0/P1 code-quality finding in the same task scope.
6. Run the task's GREEN command again.
7. Mark the task complete only after the task-specific tests and both reviews are clean.

Task 3 is intentionally split into 3A/3B/3C because normalize orchestration, rough parsing, and ownership/writeback are too large for one clean subagent handoff.

## 2. File Structure

### Create

- `packages/core/src/authoring/index.ts`
- `packages/core/src/authoring/issue-factory.ts`
- `packages/core/src/authoring/issue-writer.ts`
- `packages/core/src/authoring/normalize-issue.ts`
- `packages/core/tests/authoring-path.test.ts`
- `packages/core/tests/issue-factory.test.ts`
- `packages/core/tests/create-issue.test.ts`
- `packages/core/tests/normalize-issue.test.ts`
- `packages/core/tests/authoring-runtime-smoke.test.ts`
- `packages/cli/src/commands/new.ts`
- `packages/cli/src/commands/normalize.ts`
- `packages/cli/tests/authoring.test.ts`

### Modify

- `packages/core/src/index.ts`
- `packages/cli/package.json`
- `packages/cli/src/context.ts`
- `packages/cli/src/index.ts`
- `docs/kanban-runtime.md`
- `docs/deploy-checklist.md`

### Do Not Modify

- Live issue vaults under `~/.openclaw/workspace-kanban/kanban`
- Generated board files
- Agent execution behavior
- Jira/Firebase/OpenClaw adapters

## 3. Task 0: Isolated Workspace And Baseline

**Purpose:** Prevent Phase 1 implementation from mixing with unrelated untracked files or live issue state.

**Files:** no source edits.

- [ ] **Step 1: Inspect current branch and dirty state**

Run:

```bash
git status --short
git branch --show-current
git rev-parse --show-toplevel
```

Expected:

- repo root is `/Users/ddalkak/Projects/kanban-task-engine`,
- dirty state may include untracked docs from spec/plan work and unrelated local junk,
- no implementation starts until an isolated worktree exists.

- [ ] **Step 2: Create implementation worktree**

Run:

```bash
git worktree add .worktrees/phase-1-authoring -b codex/kanban-authoring-new-normalize main
```

Expected:

- `.worktrees/phase-1-authoring` exists,
- branch is `codex/kanban-authoring-new-normalize`.

- [ ] **Step 3: Bring accepted spec and plan into the worktree**

Copy only these docs from the original workspace to the worktree:

```text
docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md
docs/superpowers/specs/2026-05-12-kanban-authoring-new-normalize-spec.md
docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md
docs/superpowers/plans/2026-05-12-kanban-authoring-new-normalize-plan.md
```

Expected:

- implementation worktree has the accepted docs,
- unrelated untracked files are not copied.

- [ ] **Step 4: Baseline verification in worktree**

Run from `.worktrees/phase-1-authoring`:

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
```

Expected:

- all commands pass before implementation begins.

## 3.5 Task 0.5: Built CLI Node Runtime Gate

**Purpose:** The disposable runtime smoke must execute the built CLI with Node. Current built output can fail on ESM extensionless workspace imports, so fix runtime packaging before authoring commands depend on it.

**Files:**

- Modify: `packages/cli/package.json`
- Modify as needed: root `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Run runtime RED**

Run from the isolated worktree:

```bash
pnpm -r build
node packages/cli/dist/bin.js --help
```

Expected before the fix:

- `pnpm -r build` may pass,
- `node packages/cli/dist/bin.js --help` fails with a Node ESM module resolution error, or fails to print help.

- [ ] **Step 2: Make built CLI executable under Node**

Use the smallest repo-appropriate runtime packaging fix. Recommended path:

- add `esbuild` as a direct dev dependency for the CLI package or workspace,
- keep `tsc` for declarations/type-checking,
- bundle `packages/cli/src/bin.ts` to `packages/cli/dist/bin.js` after `tsc`,
- bundle workspace package code into the CLI executable so Node does not load stale or extensionless `packages/core/dist` files at runtime.

`packages/cli/package.json` build script should become equivalent to:

```json
{
  "scripts": {
    "build": "tsc && esbuild src/bin.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/bin.js --banner:js='#!/usr/bin/env node'"
  }
}
```

Implementation notes:

- If shell quoting for `--banner:js` is not portable in package scripts, create a tiny build script instead of hand-escaping complex shell.
- Do not change core/source module semantics broadly unless bundling cannot satisfy the runtime gate.
- Do not replace this gate with `tsx src/bin.ts`; the gate is specifically for built CLI runtime behavior.

- [ ] **Step 3: Run runtime GREEN**

Run:

```bash
pnpm -r build
node packages/cli/dist/bin.js --help
```

Expected after the fix:

- build passes,
- help prints successfully and includes existing commands.

- [ ] **Step 4: Add final verification gate**

Keep this command in the final phase verification:

```bash
pnpm -r build
node packages/cli/dist/bin.js --help
```

Expected:

- built CLI is runnable from a clean dist after all authoring changes.

## 4. Task 1: Core Authoring Path, ID Scan, And Exclusive Create

**Purpose:** Establish safe filesystem primitives before any command can write issue files.

**Files:**

- Create: `packages/core/src/authoring/issue-writer.ts`
- Create: `packages/core/src/authoring/index.ts`
- Test: `packages/core/tests/authoring-path.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for safe registry paths and exclusive create**

Create `packages/core/tests/authoring-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  scanIssueIds,
  splitSafeRelativePath,
  resolveRegistryPath,
  writeNewIssueFile,
} from '../src/authoring';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-'));
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
  return vault;
}

describe('authoring path safety', () => {
  it('splits safe registry relative paths and rejects traversal', () => {
    expect(splitSafeRelativePath('issues/vibe-coding')).toEqual(['issues', 'vibe-coding']);
    expect(() => splitSafeRelativePath('../issues')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('/issues')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('issues//bad')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('issues\\bad')).toThrow('Unsafe registry path');
  });

  it('resolves registry paths inside the vault only', async () => {
    const vault = await makeVault();
    await expect(resolveRegistryPath(vault, 'issues/vibe-coding')).resolves.toBe(path.join(vault, 'issues/vibe-coding'));
    await expect(resolveRegistryPath(vault, '../outside')).rejects.toThrow('Unsafe registry path');
  });

  it('rejects registry paths whose existing parent escapes through a symlink', async () => {
    const vault = await makeVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-outside-'));
    await fs.rm(path.join(vault, 'issues/vibe-coding'), { recursive: true, force: true });
    await fs.symlink(outside, path.join(vault, 'issues/vibe-coding'));
    await expect(resolveRegistryPath(vault, 'issues/vibe-coding')).rejects.toThrow('Vault path escapes root');
  });

  it('writes a new issue with exclusive create semantics', async () => {
    const vault = await makeVault();
    const target = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-test.md');
    await writeNewIssueFile(target, 'first');
    await expect(writeNewIssueFile(target, 'second')).rejects.toThrow('Issue file already exists');
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('first');
  });
});

describe('authoring id scan', () => {
  it('reserves ids from frontmatter, filename fallback, epics, and project roots', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-one.md'), `---
id: VC-001
title: One
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---

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
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-010-epic.md'), 'not: [valid');
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.ids).toContain('VC-001');
    expect(result.ids).toContain('VC-010');
    expect(result.warnings.some(w => w.includes('VC-010-epic.md'))).toBe(true);
  });

  it('fails writes when malformed files have no reliable id', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/broken.md'), 'not: [valid');
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.length).toBeGreaterThan(0);
  });

  it('fails writes when duplicate ids have multiple owners', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-a.md'), `---
id: VC-001
title: A
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-001-b.md'), `---
id: VC-001
title: B
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
`);
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.duplicateErrors).toHaveLength(1);
    expect(result.owners.get('VC-001')?.length).toBe(2);
  });

  it('treats valid YAML without id and no filename id as fatal', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/no-id.md'), `---
title: Missing id
---
`);
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.some(error => error.includes('no-id.md'))).toBe(true);
  });

  it('does not silently skip symlink entries in issue scan scope', async () => {
    const vault = await makeVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outsideFile = path.join(outside, 'VC-020-outside.md');
    await fs.writeFile(outsideFile, '# Outside\n');
    await fs.symlink(outsideFile, path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-020-link.md'));
    await fs.symlink(outside, path.join(vault, 'issues/vibe-coding/kanban-task-engine/symlink-dir'));
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.some(error => error.includes('VC-020-link.md'))).toBe(true);
    expect(result.fatalErrors.some(error => error.includes('symlink-dir'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
```

Expected:

- fail because `../src/authoring` does not exist.

- [ ] **Step 3: Implement minimal path/id/write service**

Create `packages/core/src/authoring/issue-writer.ts` with:

```ts
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { loadRegistry, getRegistrySpace } from '../store/registry';
import { resolveVaultPath } from '../store/vault-path';

export interface ScanIssueIdsResult {
  ids: string[];
  reservedIds: Set<string>;
  owners: Map<string, IssueIdOwner[]>;
  warnings: string[];
  duplicateErrors: string[];
  fatalErrors: string[];
}

export interface IssueIdOwner {
  id: string;
  filePath: string;
  relativePath: string;
  source: 'frontmatter' | 'filename';
}

export function splitSafeRelativePath(relativePath: string): string[] {
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.includes('\0')) {
    throw new Error(`Unsafe registry path: ${relativePath}`);
  }
  const parts = relativePath.split('/');
  if (parts.length === 0 || parts.some(part => part.trim() === '' || part === '.' || part === '..')) {
    throw new Error(`Unsafe registry path: ${relativePath}`);
  }
  return parts;
}

export async function resolveRegistryPath(vaultRoot: string, relativePath: string): Promise<string> {
  return resolveVaultPath(vaultRoot, ...splitSafeRelativePath(relativePath));
}

export async function writeNewIssueFile(filePath: string, content: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'wx');
    await handle.writeFile(content, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      throw new Error(`Issue file already exists: ${filePath}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function scanIssueIds(vaultRoot: string, spaceName: string): Promise<ScanIssueIdsResult> {
  const registry = await loadRegistry(path.join(vaultRoot, 'registry.yaml'));
  const space = getRegistrySpace(registry, spaceName);
  const roots = [space.epics];
  if (space.type === 'container') {
    roots.push(...Object.values(space.projects ?? {}).map(project => project.path));
  } else {
    roots.push(space.issues);
  }

  const owners = new Map<string, IssueIdOwner[]>();
  const warnings: string[] = [];
  const duplicateErrors: string[] = [];
  const fatalErrors: string[] = [];

  for (const root of roots) {
    const rootPath = await resolveRegistryPath(vaultRoot, root);
    const files = await listMarkdownFiles(rootPath, vaultRoot, fatalErrors);
    for (const file of files) {
      const basename = path.basename(file);
      try {
        const raw = await fs.readFile(file, 'utf8');
        const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match) {
          const fallback = filenameIssueId(basename, space.idPrefix);
          if (fallback) {
            warnings.push(`${path.relative(vaultRoot, file)}: missing frontmatter; reserved filename id`);
            addOwner(owners, fallback, file, vaultRoot, 'filename');
          } else {
            fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
          }
          continue;
        }
        const parsed = YAML.parse(match[1]);
        if (parsed && typeof parsed.id === 'string') {
          addOwner(owners, parsed.id, file, vaultRoot, 'frontmatter');
          continue;
        }
        const fallback = filenameIssueId(basename, space.idPrefix);
        if (fallback) {
          warnings.push(`${path.relative(vaultRoot, file)}: missing frontmatter id; reserved filename id`);
          addOwner(owners, fallback, file, vaultRoot, 'filename');
        } else {
          fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
        }
      } catch (error) {
        warnings.push(`${path.relative(vaultRoot, file)}: ${error instanceof Error ? error.message : String(error)}`);
        const fallback = filenameIssueId(basename, space.idPrefix);
        if (fallback) {
          addOwner(owners, fallback, file, vaultRoot, 'filename');
        } else {
          fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
        }
      }
    }
  }

  for (const [id, idOwners] of owners) {
    if (idOwners.length > 1) {
      duplicateErrors.push(`${id}: ${idOwners.map(owner => owner.relativePath).join(', ')}`);
    }
  }

  const ids = [...owners.keys()].sort();
  return { ids, reservedIds: new Set(ids), owners, warnings, duplicateErrors, fatalErrors };
}

async function listMarkdownFiles(dir: string, vaultRoot: string, fatalErrors: string[]): Promise<string[]> {
  let entries: Array<import('fs').Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) {
      fatalErrors.push(`${path.relative(vaultRoot, entryPath)}: symlink entries are not allowed in issue scan scope`);
      continue;
    }
    if (entry.isDirectory()) files.push(...await listMarkdownFiles(entryPath, vaultRoot, fatalErrors));
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files;
}

function filenameIssueId(filename: string, idPrefix: string): string | null {
  const match = filename.match(new RegExp(`^${idPrefix}-(\\d+)(?:-|\\.md$)`));
  return match ? `${idPrefix}-${match[1]}` : null;
}

function addOwner(
  owners: Map<string, IssueIdOwner[]>,
  id: string,
  filePath: string,
  vaultRoot: string,
  source: IssueIdOwner['source'],
): void {
  const relativePath = path.relative(vaultRoot, filePath);
  const list = owners.get(id) ?? [];
  list.push({ id, filePath, relativePath, source });
  owners.set(id, list);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
```

Create `packages/core/src/authoring/index.ts`:

```ts
export * from './issue-writer';
```

Modify `packages/core/src/index.ts`:

```ts
export * from './authoring';
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
```

Expected:

- tests in Task 1 pass.

## 5. Task 2: Core Issue Factory And Placeholder Readiness

**Purpose:** Generate schema-valid issue Markdown and make placeholder-bearing drafts explicitly not execution-ready.

**Files:**

- Create: `packages/core/src/authoring/issue-factory.ts`
- Modify: `packages/core/src/authoring/index.ts`
- Test: `packages/core/tests/issue-factory.test.ts`

- [ ] **Step 1: Add failing tests for `createIssueDraft` and placeholders**

Create `packages/core/tests/issue-factory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createIssueDraft,
  hasKanbanPlaceholders,
  normalizeExecutionReadiness,
} from '../src/authoring';
import { parseIssueMarkdown } from '@kanban-task-engine/schema';

describe('issue factory', () => {
  it('creates schema-valid task markdown with deterministic defaults', () => {
    const draft = createIssueDraft({
      id: 'VC-001',
      title: 'Authoring smoke',
      type: 'task',
      project: 'kanban-task-engine',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(draft.frontmatter.status).toBe('TODO');
    expect(draft.frontmatter.priority).toBe('P2');
    expect(draft.frontmatter.executor).toBe('human');
    expect(draft.markdown).toContain('## Acceptance Criteria');
    expect(hasKanbanPlaceholders(draft.markdown)).toBe(false);
    expect(parseIssueMarkdown(draft.markdown).ok).toBe(true);
  });

  it('forces epic executor and empty project', () => {
    const draft = createIssueDraft({
      id: 'VC-002',
      title: 'Epic smoke',
      type: 'epic',
      project: 'kanban-task-engine',
      executor: 'codex',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(draft.frontmatter.executor).toBe('human');
    expect(draft.frontmatter.project).toBe('');
    expect(parseIssueMarkdown(draft.markdown).ok).toBe(true);
  });

  it('detects placeholders and downgrades execution readiness', () => {
    const markdown = `## 목적\n<!-- kanban:placeholder reason=\"missing-section-content\" -->\n- 작성 필요\n`;
    expect(hasKanbanPlaceholders(markdown)).toBe(true);
    expect(normalizeExecutionReadiness({ status: 'READY', type: 'task', executor: 'codex', hasPlaceholders: true })).toEqual({
      status: 'TODO',
      executionReady: false,
      warnings: ['Placeholder content prevents READY status; normalized status to TODO'],
    });
  });

  it('marks only machine READY tasks as execution-ready', () => {
    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'task',
      executor: 'human',
      hasPlaceholders: false,
    }).executionReady).toBe(false);
    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'task',
      executor: 'codex',
      hasPlaceholders: false,
    }).executionReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/issue-factory.test.ts
```

Expected:

- fail because issue factory exports do not exist.

- [ ] **Step 3: Implement issue factory**

Create `packages/core/src/authoring/issue-factory.ts` with:

```ts
import YAML from 'yaml';
import { IssueStatus, IssueType, Priority } from '@kanban-task-engine/schema';

export interface IssueDraftInput {
  id: string;
  title: string;
  type?: IssueType;
  project: string;
  priority?: Priority;
  executor?: 'human' | 'codex' | 'claude-code';
  labels?: string[];
  assignee?: string;
  epic?: string;
  workingDir?: string;
  mergeInto?: string;
  now?: Date;
}

export interface IssueDraft {
  frontmatter: Record<string, unknown>;
  markdown: string;
}

export function createIssueDraft(input: IssueDraftInput): IssueDraft {
  const type = input.type ?? 'task';
  const now = (input.now ?? new Date()).toISOString();
  const frontmatter: Record<string, unknown> = {
    id: input.id,
    title: input.title,
    type,
    status: 'TODO',
    priority: input.priority ?? 'P2',
    executor: type === 'epic' ? 'human' : input.executor ?? 'human',
    project: type === 'epic' ? '' : input.project,
    created: now,
    updated: now,
    assignee: input.assignee ?? '',
    labels: input.labels ?? [],
    depends_on: [],
  };
  if (input.epic && type !== 'epic') frontmatter.epic = input.epic;
  if (input.workingDir) frontmatter.working_dir = input.workingDir;
  if (input.mergeInto) frontmatter.merge_into = input.mergeInto;

  const body = type === 'epic' ? epicBody(input.title) : taskBody(input.title);
  return { frontmatter, markdown: serialize(frontmatter, body) };
}

export function hasKanbanPlaceholders(markdown: string): boolean {
  return markdown.includes('kanban:placeholder reason=\"missing-section-content\"');
}

export function normalizeExecutionReadiness(input: {
  status: IssueStatus;
  type: IssueType;
  executor: 'human' | 'codex' | 'claude-code';
  hasPlaceholders: boolean;
}): { status: IssueStatus; executionReady: boolean; warnings: string[] } {
  if (input.hasPlaceholders && ['READY', 'RUNNING', 'REVIEW', 'DONE'].includes(input.status)) {
    return {
      status: 'TODO',
      executionReady: false,
      warnings: [`Placeholder content prevents ${input.status} status; normalized status to TODO`],
    };
  }
  const machineExecutor = input.executor === 'codex' || input.executor === 'claude-code';
  return {
    status: input.status,
    executionReady: input.type !== 'epic' && !input.hasPlaceholders && input.status === 'READY' && machineExecutor,
    warnings: [],
  };
}

function serialize(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${body.trimEnd()}\n`;
}

function taskBody(title: string): string {
  return `# ${title}

## 목적

- 작성 필요

## 컨텍스트

- 작성 필요

## Acceptance Criteria

- 작성 필요

## 실행 힌트

- 작성 필요

## 로그

- Created by kanban new
`;
}

function epicBody(title: string): string {
  return `# ${title}

## 목표

- 작성 필요

## 범위

- 작성 필요

## 성공 지표

- 작성 필요

## 하위 티켓

<!-- kanban:auto-render start -->
<!-- kanban:auto-render end -->

## 로그

- Created by kanban new
`;
}
```

Modify `packages/core/src/authoring/index.ts`:

```ts
export * from './issue-writer';
export * from './issue-factory';
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/issue-factory.test.ts
```

Expected:

- Task 2 tests pass, and Task 1 remains green when re-run.

## 6. Task 3A: Core `createIssue` Orchestration

**Purpose:** Compose registry/id/path services with issue factory for safe issue creation before normalize is added.

**Files:**

- Modify: `packages/core/src/authoring/issue-writer.ts`
- Modify: `packages/core/src/authoring/index.ts`
- Test: `packages/core/tests/create-issue.test.ts`

- [ ] **Step 1: Add failing tests for createIssue workflows**

Create `packages/core/tests/create-issue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  createIssue,
} from '../src/authoring';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-create-'));
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
  return vault;
}

describe('createIssue', () => {
  it('creates the next id under a container project and rejects duplicate overwrite', async () => {
    const vault = await makeVault();
    const first = await createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Authoring Smoke',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(first.id).toBe('VC-001');
    expect(first.relativePath).toBe('issues/vibe-coding/kanban-task-engine/VC-001-authoring-smoke.md');
    expect(first.created).toBe(true);
    await expect(fs.readFile(first.absolutePath, 'utf8')).resolves.toContain('id: VC-001');
  });

  it('dry-runs without writing', async () => {
    const vault = await makeVault();
    const result = await createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Dry Run',
      dryRun: true,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.created).toBe(false);
    await expect(fs.stat(result.absolutePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects project for epics and writes epics under the epic root', async () => {
    const vault = await makeVault();
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Bad Epic',
      type: 'epic',
    })).rejects.toThrow('Project is not allowed for epic issues');
    const result = await createIssue({ vaultRoot: vault, space: 'vibe-coding', title: 'Good Epic', type: 'epic' });
    expect(result.relativePath).toContain('issues/vibe-coding/_epics/VC-001-good-epic.md');
  });

  it('fails closed when scan reports duplicate ids', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-a.md'), `---
id: VC-001
title: A
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-001-b.md'), `---
id: VC-001
title: B
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
`);
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Should fail',
    })).rejects.toThrow('Duplicate issue ids');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
```

Expected:

- fail because `createIssue` does not exist.

- [ ] **Step 3: Implement createIssue**

Implementation requirements:

- load `registry.yaml`,
- choose target root,
- call `scanIssueIds`,
- fail if `fatalErrors` or `duplicateErrors` are non-empty,
- validate raw authoring options before scanning/writing:
  - `type`, `priority`, and `executor` must match the schema enums,
  - `labels` must be trimmed and empty labels removed,
  - `epic` must be a segment-safe issue id,
  - `workingDir` must reject NUL and newline characters,
  - `mergeInto` must reject empty values, whitespace-only values, NUL, newline, and leading `-`,
  - title slug must be path-safe and fall back to `issue` when no slug-safe characters remain,
- allocate with `allocateNextIssueId([...scan.reservedIds], idPrefix)`,
- slugify title,
- build draft with `createIssueDraft`,
- write with `writeNewIssueFile` unless `dryRun`,
- retry once after `EEXIST` by rescanning, then fail if the second target also exists.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
```

Expected:

- createIssue tests pass,
- path/id safety tests remain green.

## 6B. Task 3B: Rough Note Parser And Normalized Draft

**Purpose:** Convert rough Markdown into normalized Markdown while preserving raw YAML keys and downgrading placeholder-bearing execution statuses.

**Files:**

- Create: `packages/core/src/authoring/normalize-issue.ts`
- Modify: `packages/core/src/authoring/index.ts`
- Test: `packages/core/tests/normalize-issue.test.ts`

- [ ] **Step 1: Add failing tests for rough parsing and placeholder readiness**

Create `packages/core/tests/normalize-issue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { normalizeIssue } from '../src/authoring';
import { parseIssueMarkdown, validateIssueFrontmatterForRegistry } from '@kanban-task-engine/schema';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-normalize-'));
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
  return vault;
}

describe('normalizeIssue', () => {
  it('creates a canonical target for vault-internal rough notes and preserves source', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough title\n\nSome context only.\n');
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.inPlace).toBe(false);
    expect(result.wrote).toBe(true);
    expect(result.hasPlaceholders).toBe(true);
    expect(result.executionReady).toBe(false);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('Some context only.');
    const normalized = await fs.readFile(result.targetPath, 'utf8');
    expect(normalized).toContain('kanban:placeholder');
    assertFormalDraft(normalized, 'container');
  });

  it('preserves unknown non-deprecated frontmatter keys', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, `---
title: Rough with metadata
custom_field: keep-me
---
# Rough with metadata
`);
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.markdown).toContain('custom_field: keep-me');
    assertFormalDraft(result.markdown, 'container');
  });

  it('downgrades placeholder-bearing execution statuses to TODO', async () => {
    for (const status of ['READY', 'RUNNING', 'REVIEW', 'DONE']) {
      const vault = await makeVault();
      await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
      const source = path.join(vault, `inbox/${status.toLowerCase()}.md`);
      await fs.writeFile(source, `---
status: ${status}
---
# ${status} but empty
`);
      const result = await normalizeIssue({
        vaultRoot: vault,
        sourcePath: source,
        space: 'vibe-coding',
        project: 'kanban-task-engine',
        write: false,
        now: new Date('2026-05-12T00:00:00.000Z'),
      });
      expect(result.markdown).toContain('status: TODO');
      expect(result.warnings.join('\n')).toContain(`Placeholder content prevents ${status} status`);
      assertFormalDraft(result.markdown, 'container');
    }
  });

  it('rejects source paths outside the vault', async () => {
    const vault = await makeVault();
    const outside = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'outside-')), 'rough.md');
    await fs.writeFile(outside, '# Outside\n');
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: outside, write: false })).rejects.toThrow('Source path is outside vault');
  });

  it('rejects symlink source paths that resolve outside the vault', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outside = path.join(outsideDir, 'rough.md');
    await fs.writeFile(outside, '# Outside through symlink\n');
    const link = path.join(vault, 'inbox/link.md');
    await fs.symlink(outside, link);
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: link,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Source path is outside vault');
  });
});

function assertFormalDraft(markdown: string, spaceType: 'single' | 'container'): void {
  const parsed = parseIssueMarkdown(markdown);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  expect(validateIssueFrontmatterForRegistry(parsed.value.frontmatter, { idPrefix: 'VC', spaceType }).ok).toBe(true);
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
```

Expected:

- fail because `normalizeIssue` does not exist.

- [ ] **Step 3: Implement rough parser and normalized draft**

Implementation requirements:

- `normalizeIssue` must reject source outside vault,
- resolve relative source paths as vault-relative paths, then enforce vault containment using `realpath` before reading,
- reject symlink source paths whose real target escapes the vault, including symlinks under registry issue roots,
- parse optional frontmatter with raw YAML preservation,
- derive title from frontmatter/heading/filename,
- map known fields,
- preserve unknown non-deprecated fields,
- insert placeholders for missing sections,
- downgrade placeholder-bearing execution statuses to `TODO`,
- validate the normalized Markdown with `parseIssueMarkdown` and registry-aware frontmatter validation before returning or writing,
- return `executionReady`.
- `normalizeIssue` must return `executionReady`.

Create `packages/core/src/authoring/normalize-issue.ts`. Keep parsing helpers pure and small enough that `code-simplifier` can later review them without broad refactor.

Modify `packages/core/src/authoring/index.ts`:

```ts
export * from './issue-writer';
export * from './issue-factory';
export * from './normalize-issue';
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
```

Expected:

- normalize rough parser tests pass.

## 6C. Task 3C: Normalize Ownership And Writeback

**Purpose:** Lock the dangerous part of normalize: deciding whether an existing file may be rewritten in place, or whether a canonical target must be created without touching the source.

**Files:**

- Modify: `packages/core/src/authoring/normalize-issue.ts`
- Test: `packages/core/tests/normalize-issue.test.ts`

- [ ] **Step 1: Add failing ownership tests**

Append to `packages/core/tests/normalize-issue.test.ts`:

```ts
describe('normalizeIssue ownership and writeback', () => {
  it('rewrites in place only for the sole owner in the correct project root', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Owned
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
custom_field: keep-me
---
# Owned
`);
    const result = await normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true });
    expect(result.inPlace).toBe(true);
    expect(result.targetPath).toBe(source);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('custom_field: keep-me');
  });

  it('rejects in-place rewrite when project frontmatter does not match the project root', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Wrong project
type: task
status: TODO
executor: human
project: other-project
created: 2026-05-12
updated: 2026-05-12
---
# Wrong project
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Project does not match registry root');
  });

  it('rejects in-place rewrite when id prefix does not match the owning space', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/OC-001-owned.md');
    await fs.writeFile(source, `---
id: OC-001
title: Wrong prefix
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Wrong prefix
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Issue id prefix does not match registry space');
  });

  it('rejects in-place rewrite when another file owns the same id', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    const duplicate = path.join(vault, 'issues/vibe-coding/_epics/VC-001-duplicate.md');
    await fs.writeFile(source, `---
id: VC-001
title: Owned
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Owned
`);
    await fs.writeFile(duplicate, `---
id: VC-001
title: Duplicate
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# Duplicate
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Duplicate issue ids');
  });

  it('fails normalize write when target scan scope has malformed files without reliable ids', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/broken.md'), 'not: [valid');
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough\n');
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Cannot allocate issue id while scan has fatal errors');
  });

  it('fails normalize write when target scan scope has duplicate ids anywhere', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-a.md'), `---
id: VC-001
title: A
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# A
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-001-b.md'), `---
id: VC-001
title: B
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# B
`);
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough\n');
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Duplicate issue ids');
  });

  it('creates a canonical target when an issue-root source has only a filename id', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-rough.md');
    await fs.writeFile(source, `---
title: Filename id only
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Filename id only
`);
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    });
    expect(result.inPlace).toBe(false);
    expect(result.targetPath).not.toBe(source);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('Filename id only');
  });

  it('rejects symlinks under canonical issue roots that resolve outside the vault', async () => {
    const vault = await makeVault();
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outside = path.join(outsideDir, 'VC-001-outside.md');
    await fs.writeFile(outside, `---
id: VC-001
title: Outside
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Outside
`);
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-link.md');
    await fs.symlink(outside, source);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Source path is outside vault');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
```

Expected:

- new ownership tests fail until the classifier exists.

- [ ] **Step 3: Implement ownership classifier**

Add a pure classifier in `normalize-issue.ts` or a focused helper module:

```ts
export interface NormalizeTargetClassification {
  mode: 'in-place' | 'canonical-target';
  rootKind: 'issue' | 'epic' | 'outside-issue-roots';
  space: string;
  project?: string;
  targetPath?: string;
}
```

Implementation requirements:

- classify source path relative to `vaultRoot`,
- reject paths outside the vault after resolving `realpath`,
- reject symlink source paths whose real target is outside the vault before read or rewrite,
- reject paths that match more than one registry root,
- for in-place issue roots, require a raw frontmatter `id`; filename fallback is ID reservation only and must not prove ownership,
- for in-place issue roots, require id prefix match and `project` frontmatter equal to the registry project name,
- for in-place epic roots, require a raw frontmatter `id`, `type: epic`, `executor: human`, and `project: ""`,
- fail every `normalize --write` before mutation if `scanIssueIds` returns any `fatalErrors` or `duplicateErrors`; duplicate checks are vault-scope, not only same-id/source-owner checks,
- call `scanIssueIds` and reject any duplicate owner for the same id unless the sole owner is the source file,
- validate the final normalized Markdown with `parseIssueMarkdown` and `validateIssueFrontmatterForRegistry` before writeback,
- use existing atomic rewrite only after ownership is proven,
- use `writeNewIssueFile` for canonical target creation.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
```

Expected:

- normalize ownership tests pass,
- create/path tests remain green.

## 7. Task 4: CLI `new` And `normalize`

**Purpose:** Expose authoring behavior through the operator CLI without duplicating core logic.

**Files:**

- Create: `packages/cli/src/commands/new.ts`
- Create: `packages/cli/src/commands/normalize.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/context.ts`
- Test: `packages/cli/tests/authoring.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Create `packages/cli/tests/authoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-authoring-'));
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
  return vault;
}

describe('authoring cli', () => {
  it('rejects mutating new without explicit KANBAN_HOME', async () => {
    const result = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', 'No vault'], createCliContext({ HOME: '/home/user' }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects normalize --write without explicit KANBAN_HOME', async () => {
    const result = await runCli(['normalize', '/tmp/rough.md', '--write', '--space', 'vibe-coding', '--project', 'kanban-task-engine'], createCliContext({ HOME: '/home/user' }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects normalize --check without explicit KANBAN_HOME when registry resolution is requested', async () => {
    const result = await runCli(['normalize', '/tmp/rough.md', '--check', '--space', 'vibe-coding', '--project', 'kanban-task-engine'], createCliContext({ HOME: '/home/user' }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects missing option values, invalid option values, and unknown flags for new', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    expect((await runCli(['new', '--space'], context)).stderr).toContain('Missing value for --space');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--label'], context)).stderr).toContain('Missing value for --label');
    expect((await runCli(['new', '--wat', 'Title'], context)).stderr).toContain('Unknown option: --wat');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--type', 'feature', 'Title'], context)).stderr).toContain('Invalid value for --type');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--priority', 'P9', 'Title'], context)).stderr).toContain('Invalid value for --priority');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--executor', 'bot', 'Title'], context)).stderr).toContain('Invalid value for --executor');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--epic', '../VC-001', 'Title'], context)).stderr).toContain('Invalid value for --epic');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--working-dir', 'bad\npath', 'Title'], context)).stderr).toContain('Invalid value for --working-dir');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--merge-into', '-bad', 'Title'], context)).stderr).toContain('Invalid value for --merge-into');
  });

  it('rejects normalize with no mode or both modes', async () => {
    const vault = await createVault();
    const source = path.join(vault, 'rough.md');
    await fs.writeFile(source, '# Rough\n');
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    expect((await runCli(['normalize', source], context)).stderr).toContain('Exactly one of --check or --write is required');
    expect((await runCli(['normalize', source, '--check', '--write'], context)).stderr).toContain('Exactly one of --check or --write is required');
  });

  it('creates a new issue and supports JSON dry-run', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    const dry = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--dry-run', '--json', 'Dry Smoke'], context);
    expect(dry.exitCode).toBe(0);
    expect(JSON.parse(dry.stdout).created).toBe(false);

    const plainDry = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--dry-run', 'Plain Dry Smoke'], context);
    expect(plainDry.exitCode).toBe(0);
    expect(plainDry.stdout).toContain('dry-run VC-001');
    expect(plainDry.stdout).toContain('---');
    expect(plainDry.stdout).toContain('Plain Dry Smoke');

    const created = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json', 'Real Smoke'], context);
    expect(created.exitCode).toBe(0);
    const payload = JSON.parse(created.stdout);
    expect(payload.id).toBe('VC-001');
    await expect(fs.readFile(path.join(vault, payload.path), 'utf8')).resolves.toContain('Real Smoke');
  });

  it('normalizes a rough note with JSON output', async () => {
    const vault = await createVault();
    const source = path.join(vault, 'rough.md');
    await fs.writeFile(source, '# Rough\n\nBody\n');
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    const result = await runCli(['normalize', source, '--check', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json'], context);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.wrote).toBe(false);
    expect(payload.hasPlaceholders).toBe(true);
    expect(payload.executionReady).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec vitest run tests/authoring.test.ts
```

Expected:

- fail because CLI commands do not exist.

- [ ] **Step 3: Implement CLI commands**

Modify `packages/cli/src/context.ts` first:

```ts
export interface CliContext {
  vaultRoot: string;
  vaultRootExplicit: boolean;
  recipePath?: string;
}

export function createCliContext(env: Record<string, string | undefined> = process.env): CliContext {
  const explicit = env.KANBAN_HOME !== undefined && env.KANBAN_HOME.trim() !== '';
  return {
    vaultRoot: explicit ? env.KANBAN_HOME as string : `${env.HOME ?? '~'}/.openclaw/workspace-kanban/kanban`,
    vaultRootExplicit: explicit,
    recipePath: env.KANBAN_RECIPE,
  };
}
```

Create `packages/cli/src/commands/new.ts`:

```ts
import { createIssue } from '@kanban-task-engine/core';
import { CliHandler, fail, ok } from '../index.js';

export const commandNew: CliHandler = async (args, context) => {
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for kanban new');
  const parsed = parseNewArgs(args);
  if ('error' in parsed) return fail(parsed.error);
  try {
    const result = await createIssue({ vaultRoot: context.vaultRoot, ...parsed.value });
    if (parsed.value.json) {
      return ok(JSON.stringify({
        id: result.id,
        path: result.relativePath,
        created: result.created,
        markdown: parsed.value.dryRun ? result.markdown : undefined,
        warnings: result.warnings,
      }));
    }
    const summary = `${result.created ? 'created' : 'dry-run'} ${result.id} ${result.relativePath}`;
    return ok(result.created ? summary : `${summary}\n\n${result.markdown}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

type IssueType = 'task' | 'bug' | 'chore' | 'docs' | 'epic';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';
type Executor = 'human' | 'codex' | 'claude-code';

interface ParsedNewArgs {
  space?: string;
  project?: string;
  type?: IssueType;
  priority?: Priority;
  executor?: Executor;
  epic?: string;
  labels: string[];
  assignee?: string;
  workingDir?: string;
  mergeInto?: string;
  dryRun?: boolean;
  json?: boolean;
  title?: string;
}

type ParseResult<T> = { value: T } | { error: string };

const ISSUE_TYPES = new Set<string>(['task', 'bug', 'chore', 'docs', 'epic']);
const PRIORITIES = new Set<string>(['P0', 'P1', 'P2', 'P3']);
const EXECUTORS = new Set<string>(['human', 'codex', 'claude-code']);

function parseNewArgs(args: string[]): ParseResult<ParsedNewArgs> {
  const value: ParsedNewArgs = { labels: [] };
  const titleParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--space') {
      const option = readOptionValue(args, ++i, '--space');
      if ('error' in option) return option;
      value.space = option.value;
    } else if (arg === '--project') {
      const option = readOptionValue(args, ++i, '--project');
      if ('error' in option) return option;
      value.project = option.value;
    } else if (arg === '--type') {
      const option = readOptionValue(args, ++i, '--type');
      if ('error' in option) return option;
      if (!ISSUE_TYPES.has(option.value)) return { error: `Invalid value for --type: ${option.value}` };
      value.type = option.value as IssueType;
    } else if (arg === '--priority') {
      const option = readOptionValue(args, ++i, '--priority');
      if ('error' in option) return option;
      if (!PRIORITIES.has(option.value)) return { error: `Invalid value for --priority: ${option.value}` };
      value.priority = option.value as Priority;
    } else if (arg === '--executor') {
      const option = readOptionValue(args, ++i, '--executor');
      if ('error' in option) return option;
      if (!EXECUTORS.has(option.value)) return { error: `Invalid value for --executor: ${option.value}` };
      value.executor = option.value as Executor;
    } else if (arg === '--epic') {
      const option = readOptionValue(args, ++i, '--epic');
      if ('error' in option) return option;
      value.epic = option.value;
    } else if (arg === '--label') {
      const option = readOptionValue(args, ++i, '--label');
      if ('error' in option) return option;
      value.labels.push(option.value);
    } else if (arg === '--assignee') {
      const option = readOptionValue(args, ++i, '--assignee');
      if ('error' in option) return option;
      value.assignee = option.value;
    } else if (arg === '--working-dir') {
      const option = readOptionValue(args, ++i, '--working-dir');
      if ('error' in option) return option;
      value.workingDir = option.value;
    } else if (arg === '--merge-into') {
      const option = readOptionValue(args, ++i, '--merge-into');
      if ('error' in option) return option;
      value.mergeInto = option.value;
    }
    else if (arg === '--dry-run') value.dryRun = true;
    else if (arg === '--json') value.json = true;
    else if (arg.startsWith('--')) return { error: `Unknown option: ${arg}` };
    else titleParts.push(arg);
  }
  value.title = titleParts.join(' ').trim();
  if (!value.space) return { error: 'Usage: kanban new --space <space> [--project <project>] "<title>"' };
  if (!value.title) return { error: 'Title is required' };
  const validationError = validateNewArgs(value);
  if (validationError) return { error: validationError };
  return { value };
}

function validateNewArgs(value: ParsedNewArgs): string | undefined {
  if (value.epic && !/^[A-Z][A-Z0-9]*-\d+$/.test(value.epic)) return `Invalid value for --epic: ${value.epic}`;
  if (value.workingDir && /[\0\r\n]/.test(value.workingDir)) return 'Invalid value for --working-dir';
  if (value.mergeInto && (value.mergeInto.trim() === '' || value.mergeInto.startsWith('-') || /[\0\r\n]/.test(value.mergeInto))) {
    return 'Invalid value for --merge-into';
  }
  value.labels = value.labels.map(label => label.trim()).filter(Boolean);
  return undefined;
}

function readOptionValue(args: string[], index: number, option: string): ParseResult<string> {
  const value = args[index];
  if (!value || value.startsWith('--')) return { error: `Missing value for ${option}` };
  return { value };
}
```

Create `packages/cli/src/commands/normalize.ts` similarly:

```ts
import { normalizeIssue } from '@kanban-task-engine/core';
import { CliHandler, fail, ok } from '../index.js';

export const commandNormalize: CliHandler = async (args, context) => {
  const parsed = parseNormalizeArgs(args);
  if ('error' in parsed) return fail(parsed.error);
  if (!context.vaultRootExplicit) {
    return fail('KANBAN_HOME must be explicitly set for kanban normalize');
  }
  try {
    const result = await normalizeIssue({ vaultRoot: context.vaultRoot, ...parsed.value });
    if (parsed.value.json) {
      return ok(JSON.stringify({
        id: result.id,
        sourcePath: result.sourcePath,
        targetPath: result.targetPath,
        wrote: result.wrote,
        inPlace: result.inPlace,
        warnings: result.warnings,
        hasPlaceholders: result.hasPlaceholders,
        executionReady: result.executionReady,
      }));
    }
    return ok(`${result.wrote ? 'normalized' : 'check'} ${result.id} ${result.targetPath}\n${result.warnings.join('\n')}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

interface ParsedNormalizeArgs {
  sourcePath?: string;
  space?: string;
  project?: string;
  write?: boolean;
  json?: boolean;
}

type ParseResult<T> = { value: T } | { error: string };

function parseNormalizeArgs(args: string[]): ParseResult<ParsedNormalizeArgs> {
  const value: ParsedNormalizeArgs = {};
  const paths: string[] = [];
  let modeCount = 0;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check') { value.write = false; modeCount += 1; }
    else if (arg === '--write') { value.write = true; modeCount += 1; }
    else if (arg === '--space') {
      const option = readOptionValue(args, ++i, '--space');
      if ('error' in option) return option;
      value.space = option.value;
    } else if (arg === '--project') {
      const option = readOptionValue(args, ++i, '--project');
      if ('error' in option) return option;
      value.project = option.value;
    }
    else if (arg === '--json') value.json = true;
    else if (arg.startsWith('--')) return { error: `Unknown option: ${arg}` };
    else paths.push(arg);
  }
  if (paths.length !== 1) return { error: 'Usage: kanban normalize <path> (--check|--write)' };
  if (modeCount !== 1) return { error: 'Exactly one of --check or --write is required' };
  value.sourcePath = paths[0];
  return { value };
}

function readOptionValue(args: string[], index: number, option: string): ParseResult<string> {
  const value = args[index];
  if (!value || value.startsWith('--')) return { error: `Missing value for ${option}` };
  return { value };
}
```

Modify `packages/cli/src/index.ts`:

```ts
import { commandNew } from './commands/new.js';
import { commandNormalize } from './commands/normalize.js';

// handlers:
new: commandNew,
normalize: commandNormalize,

// help:
'  new --space <space> [--project <project>] "<title>"',
'  normalize <path> (--check|--write)',
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec vitest run tests/authoring.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/index.test.ts
```

Expected:

- CLI authoring tests pass,
- help output includes `new` and `normalize`.

## 8. Task 5: Runtime Smoke Test Harness

**Purpose:** Prove built CLI works against a disposable real-layout vault and parser assertions.

**Files:**

- Create: `packages/core/tests/authoring-runtime-smoke.test.ts`

- [ ] **Step 1: Add failing smoke test**

Create `packages/core/tests/authoring-runtime-smoke.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { markdownIssueToCanonical } from '../src/store/mapper';
import { parseIssueMarkdown, validateIssueFrontmatterForRegistry } from '@kanban-task-engine/schema';

const run = promisify(execFile);
const vaults: string[] = [];

afterEach(async () => {
  await Promise.all(vaults.map(vault => fs.rm(vault, { recursive: true, force: true })));
  vaults.length = 0;
});

describe('authoring runtime smoke', () => {
  it('creates and checks an issue through built CLI', async () => {
    const repoRoot = process.cwd().endsWith('packages/core')
      ? path.resolve(process.cwd(), '../..')
      : process.cwd();
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-runtime-'));
    vaults.push(vault);
    await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
    await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
    await fs.mkdir(path.join(vault, 'boards'), { recursive: true });
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
    await run('node', ['packages/cli/dist/bin.js', '--help'], { cwd: repoRoot });
    const created = await run('node', ['packages/cli/dist/bin.js', 'new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json', 'Runtime Smoke'], {
      cwd: repoRoot,
      env: { ...process.env, KANBAN_HOME: vault },
    });
    const payload = JSON.parse(created.stdout);
    const issuePath = path.join(vault, payload.path);
    const markdown = await fs.readFile(issuePath, 'utf8');
    const parsed = parseIssueMarkdown(markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(validateIssueFrontmatterForRegistry(parsed.value.frontmatter, { idPrefix: 'VC', spaceType: 'container' }).ok).toBe(true);
    expect(markdownIssueToCanonical(markdown, issuePath).task_ref.external_id).toBe('VC-001');

    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const roughPath = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(roughPath, '# Runtime rough\n\nNeeds formalization.\n');
    const normalized = await run('node', ['packages/cli/dist/bin.js', 'normalize', roughPath, '--write', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json'], {
      cwd: repoRoot,
      env: { ...process.env, KANBAN_HOME: vault },
    });
    const normalizedPayload = JSON.parse(normalized.stdout);
    expect(normalizedPayload.wrote).toBe(true);
    expect(normalizedPayload.inPlace).toBe(false);
    await expect(fs.readFile(roughPath, 'utf8')).resolves.toContain('Needs formalization.');
    const normalizedIssuePath = path.isAbsolute(normalizedPayload.targetPath)
      ? normalizedPayload.targetPath
      : path.join(vault, normalizedPayload.targetPath);
    const normalizedMarkdown = await fs.readFile(normalizedIssuePath, 'utf8');
    const normalizedParsed = parseIssueMarkdown(normalizedMarkdown);
    expect(normalizedParsed.ok).toBe(true);
    if (!normalizedParsed.ok) throw new Error(normalizedParsed.errors.join('\n'));
    expect(validateIssueFrontmatterForRegistry(normalizedParsed.value.frontmatter, { idPrefix: 'VC', spaceType: 'container' }).ok).toBe(true);

    const checked = await run('node', ['packages/cli/dist/bin.js', 'normalize', issuePath, '--check', '--json'], {
      cwd: repoRoot,
      env: { ...process.env, KANBAN_HOME: vault },
    });
    expect(JSON.parse(checked.stdout).wrote).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm -r build
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
```

Expected:

- fail until built CLI runtime packaging and authoring commands are implemented.

- [ ] **Step 3: Run GREEN**

Run after Task 4:

```bash
pnpm -r build
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
```

Expected:

- built CLI creates a real file in a disposable vault,
- built CLI normalizes a rough note with `--write` while preserving the source,
- parser and canonical mapping assertions pass.

## 9. Task 6: Documentation And Deploy Checklist

**Purpose:** Keep operator docs and release safety aligned with the new runtime surface.

**Files:**

- Modify: `docs/kanban-runtime.md`
- Modify: `docs/deploy-checklist.md`

`docs/latest` does not currently exist in this repo, so Phase 1 documentation freshness is satisfied by updating the operator runtime guide, deploy checklist, and this spec/plan stack. Do not create a new `docs/latest` tree just for Phase 1.

- [ ] **Step 1: Update runtime guide**

Add to `docs/kanban-runtime.md` under Operator Commands:

````markdown
### Authoring commands

`kanban new` and `kanban normalize` require an explicit `KANBAN_HOME` in Phase 1. `normalize --check` is read-only, but it still resolves source containment and target behavior against the registry, so it must not rely on implicit Home vault fallback.

```bash
pnpm -r build
VAULT="$(mktemp -d)"
trap 'rm -rf "$VAULT"' EXIT
mkdir -p "$VAULT/issues/vibe-coding/kanban-task-engine" "$VAULT/issues/vibe-coding/_epics" "$VAULT/boards"
cat > "$VAULT/registry.yaml" <<'YAML'
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
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine --dry-run --json "Preview only"
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine --json "Disposable smoke"
mkdir -p "$VAULT/inbox"
printf '# Rough disposable smoke\n\nNeeds formalization.\n' > "$VAULT/inbox/rough.md"
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js normalize "$VAULT/inbox/rough.md" --write --space vibe-coding --project kanban-task-engine --json
grep -q 'Needs formalization.' "$VAULT/inbox/rough.md"
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js normalize "$VAULT/issues/vibe-coding/kanban-task-engine/VC-001-disposable-smoke.md" --check --json
```

Live `~/.openclaw/workspace-kanban/kanban` authoring commands should be run only after disposable smoke passes and the operator explicitly chooses the live vault. Start with `--dry-run --json` before any live write.
````

- [ ] **Step 2: Update deploy checklist**

Add to `docs/deploy-checklist.md`:

```markdown
### Authoring Command Gates

- [ ] `kanban new --dry-run --json` writes nothing in a disposable vault.
- [ ] `kanban new --json` creates exactly one issue file in a disposable vault.
- [ ] `kanban normalize --check --json` reports `wrote:false`.
- [ ] `kanban normalize --write` preserves source notes outside registry issue roots.
- [ ] `kanban new`, `kanban normalize --check`, and `kanban normalize --write` fail when `KANBAN_HOME` is not explicitly set.
- [ ] No live issue state or generated vault artifacts are staged from the engine repo.

### Authoring Rollback Triggers

- `kanban new` writes outside the intended vault.
- ID allocation reuses an existing id.
- `normalize --write` mutates an external source note.
- Placeholder-bearing issues remain execution-ready.

### Authoring Rollback Procedure

- Revert the release branch or PR that exposed the command.
- Remove any local shell alias or wrapper that points operators at the new command.
- Delete disposable smoke vaults created by verification.
- If a live-adjacent vault was polluted, restore affected files from that vault's git history before retrying.
- Re-run `pnpm -r build`, `node packages/cli/dist/bin.js --help`, `pnpm -r test`, `pnpm test:docs`, `pnpm docs:verify`, and disposable smoke before re-enabling.
```

- [ ] **Step 3: Run docs tests**

Run:

```bash
pnpm test:docs
pnpm docs:verify
```

Expected:

- docs tests pass.

## 10. Task 7: Final Verification, Review, And Simplification

**Purpose:** Close the phase with evidence, not assumptions.

- [ ] **Step 1: Run targeted verification**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/issue-factory.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/authoring.test.ts
pnpm -r build
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
```

Expected:

- all targeted tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm -r build
node packages/cli/dist/bin.js --help
pnpm -r test
pnpm test:docs
pnpm docs:verify
pnpm eval:hardening
pnpm eval:superpowers
git diff --check
```

Expected:

- all commands pass,
- `pnpm test:docs` may still discover unrelated untracked `.claude` or `.pnpm-store` duplicate tests if those directories remain in the parent workspace; in the clean worktree it should only run intended tests.

- [ ] **Step 3: Request multi-agent review**

Use at least three reviewers:

- reviewer A: spec compliance and data safety,
- reviewer B: tests/runtime smoke and edge cases,
- reviewer C: code quality, tech debt, docs/deploy checklist.

Every P0/P1 finding must be fixed before completion.

- [ ] **Step 4: Use `code-simplifier` after green behavior**

Ask `code-simplifier` to review only Phase 1 touched files. Accept simplifications that preserve public CLI contract, path safety, and test coverage. Reject broad refactors that touch unrelated command behavior.

After any accepted simplification, rerun the targeted and full verification commands above before reporting completion.

- [ ] **Step 5: Runtime readiness label**

Final report may claim:

```text
Code-level green: yes/no
Disposable vault runtime green: yes/no
Live workspace-kanban green: no, unless explicitly approved and tested
Obsidian GUI green: no, Phase 4
Agent E2E green: no, Phase 5
```

Do not claim runtime 100% beyond the acceptance level actually tested.
