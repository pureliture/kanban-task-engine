# Kanban Vault Store and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown vault lookup, recursive scanning, writes, and provider sync deterministic by separating provider namespace identity from issue identity.

**Architecture:** `TaskStore` exposes explicit lookup and path APIs, while `MarkdownStore` resolves all local paths through `WorkspaceResolver` before reading or writing. Local Markdown identity uses `task_ref.external_id`; `task_ref.external_key` remains provider namespace metadata and is never used alone as the issue id.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, Node `fs/promises`, Node `path`, existing schema mapper and atomic write utilities.

---

## File Structure

**Modify:**

- `packages/core/src/types.ts` - replace ambiguous `TaskStore.findByExternalKey()` with explicit `findByTaskRef()`, `findByIssueId()`, and `resolveIssuePath()`; keep `WorkStateProvider` unchanged in this plan.
- `packages/core/src/store/workspace-resolver.ts` - add vault-root-aware path validation, issue root metadata, `_epics` support, recursive root listing helpers, and safe filename generation support.
- `packages/core/src/store/markdown-store.ts` - support resolver-backed construction, explicit lookup methods, recursive scanning, path traversal rejection, resolver-approved writes, and `external_id`-based `writeBack()`.
- `packages/core/src/sync-coordinator.ts` - replace namespace-only local lookup with `findByTaskRef()` or `findByIssueId()` and avoid pushing by `external_key` alone when `external_id` is available.
- `packages/core/src/store/index.ts` - export any new resolver helper types.
- `packages/core/tests/workspace-resolver.test.ts` - add resolver contract tests for registry paths, `_epics`, unknown spaces/projects, and vault escape rejection.
- `packages/core/tests/markdown-store.test.ts` - add store API, recursive scan, write path, and path safety tests.
- `packages/core/tests/sync-coordinator.test.ts` - create focused sync tests for namespace/id lookup behavior.
- Adapter packages are not in this plan's write scope. If `pnpm build` later exposes external adapter fallout, stop and handle it in `2026-04-24-kanban-adapter-hardening-spec.md`.

**Do not modify:**

- CLI command implementation files.
- Board rendering behavior, except test fixtures if a fixture path is shared with store tests.
- External adapter API semantics.

## Assumptions and Identity Rules

- `TaskRef.provider` remains one of `local | github | jira | firebase`.
- `TaskRef.external_key` is namespace metadata:
  - local single-space issue: `openclaw`
  - local container project issue: `vibe-coding/kanban-task-engine`
  - GitHub issue: `owner/repo`
  - Jira issue: `PROJ`
- `TaskRef.external_id` is the issue id:
  - local: `OC-001` or `VC-001`
  - GitHub: `#123`
  - Jira: `PROJ-42`
- For local container paths, split `external_key` on `/` into `{ space, project }`. Single-space local refs use only the space segment.
- New Markdown writes use `<external_id>-<slug>.md`; reads also accept legacy `<external_id>.md`.
- `MarkdownStore` may keep a deprecated `findByExternalKey()` method on the concrete class during migration, but `TaskStore` must not expose it.

## Task 1: Baseline and Shared Store API

**Files:**

- Modify: `packages/core/src/types.ts`
- Test: `pnpm --filter @kanban-task-engine/core build`

- [ ] **Step 1: Run baseline verification before edits**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands pass before this spec implementation starts. If either fails, capture the failing package/test name in the implementation notes before editing.

- [ ] **Step 2: Modify `TaskStore` interface**

Replace the current `TaskStore` interface in `packages/core/src/types.ts` with:

```ts
export interface TaskStore {
  findByTaskRef(ref: TaskRef): Promise<CanonicalTaskModel | null>;
  findByIssueId(issueId: string): Promise<CanonicalTaskModel | null>;
  resolveIssuePath(ref: TaskRef): Promise<string>;
  saveTask(task: CanonicalTaskModel): Promise<void>;
  updateTask(task: CanonicalTaskModel): Promise<void>;
  writeBack(task: CanonicalTaskModel, patch: Partial<CanonicalTaskModel>): Promise<void>;
  listTasks(filter?: TaskFilter): Promise<CanonicalTaskModel[]>;
  deleteTask(taskRef: TaskRef): Promise<void>;
}
```

Do not leave `findByExternalKey()` in `TaskStore`.

- [ ] **Step 3: Run typecheck to verify expected failures**

Run:

```bash
pnpm --filter @kanban-task-engine/core build
```

Expected: FAIL with TypeScript errors showing `MarkdownStore` does not implement `TaskStore` and `SyncCoordinator` still calls `findByExternalKey`.

- [ ] **Step 4: Commit API contract change**

Run:

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): clarify task store lookup API"
```

Expected: commit succeeds with only `packages/core/src/types.ts` staged.

## Task 2: WorkspaceResolver Path Contract

**Files:**

- Modify: `packages/core/src/store/workspace-resolver.ts`
- Modify: `packages/core/src/store/index.ts`
- Test: `packages/core/tests/workspace-resolver.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Append these test cases to `packages/core/tests/workspace-resolver.test.ts` under `describe('fromRegistry', ...)` or a new `describe('vault path contract', ...)` block:

```ts
it('resolves single-space issue and epic paths from registry', () => {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      openclaw: {
        type: 'single',
        issues: 'issues/openclaw',
        board: 'boards/openclaw.md',
      },
    },
  }, '/vault');

  expect(resolver.getIssuePath({ provider: 'local', external_key: 'openclaw', external_id: 'OC-001' }, 'Fix Heartbeat')).toBe(
    '/vault/issues/openclaw/OC-001-fix-heartbeat.md'
  );
  expect(resolver.getIssuePath({ provider: 'local', external_key: 'openclaw', external_id: 'OC-010' }, 'Agent Runtime', { epic: true })).toBe(
    '/vault/issues/openclaw/_epics/OC-010-agent-runtime.md'
  );
});

it('resolves container project issue paths from explicit project paths', () => {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      'vibe-coding': {
        type: 'container',
        issues: 'issues/vibe-coding',
        board: 'boards/vibe-coding.md',
        projects: {
          'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' },
        },
      },
    },
  }, '/vault');

  expect(resolver.getIssuePath({ provider: 'local', external_key: 'vibe-coding/kanban-task-engine', external_id: 'VC-001' }, 'Contract Hardening')).toBe(
    '/vault/issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md'
  );
});

it('rejects unknown spaces, unknown container projects, and vault escapes', () => {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      'vibe-coding': {
        type: 'container',
        issues: 'issues/vibe-coding',
        board: 'boards/vibe-coding.md',
        projects: {
          known: { path: 'issues/vibe-coding/known' },
        },
      },
      unsafe: {
        type: 'single',
        issues: '../outside',
        board: 'boards/unsafe.md',
      },
    },
  }, '/vault');

  expect(() => resolver.getIssuePath({ provider: 'local', external_key: 'missing', external_id: 'X-001' }, 'Missing')).toThrow('Unknown workspace');
  expect(() => resolver.getIssuePath({ provider: 'local', external_key: 'vibe-coding/missing', external_id: 'VC-001' }, 'Missing')).toThrow('Unknown project');
  expect(() => resolver.getIssuePath({ provider: 'local', external_key: 'unsafe', external_id: 'US-001' }, 'Unsafe')).toThrow('outside vault root');
});
```

- [ ] **Step 2: Run resolver tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- workspace-resolver.test.ts
```

Expected: FAIL with `getIssuePath is not a function`.

- [ ] **Step 3: Implement resolver helpers**

In `packages/core/src/store/workspace-resolver.ts`, add:

```ts
import { TaskRef } from '../types';

export interface IssuePathOptions {
  epic?: boolean;
}

export interface IssueRoot {
  workspace: string;
  project?: string;
  rootPath: string;
  epic: boolean;
}
```

Extend the class to remember the vault root:

```ts
export class WorkspaceResolver {
  private config: Record<string, WorkspaceConfig>;
  private vaultRoot?: string;

  constructor(config: Record<string, WorkspaceConfig>, vaultRoot?: string) {
    this.config = config;
    this.vaultRoot = vaultRoot ? path.resolve(vaultRoot) : undefined;
  }
}
```

Update `fromRegistry()` so all registry paths are normalized through `resolveInsideVault()`:

```ts
static fromRegistry(registry: VaultRegistry, vaultRoot: string): WorkspaceResolver {
  const config: Record<string, WorkspaceConfig> = {};
  const resolvedVaultRoot = path.resolve(vaultRoot);

  for (const [space, entry] of Object.entries(registry.spaces)) {
    config[space] = {
      type: entry.type,
      path: resolveInsideVault(resolvedVaultRoot, entry.issues, 'issues path'),
      projects: entry.projects ? Object.keys(entry.projects) : undefined,
      projectPaths: entry.projects
        ? Object.fromEntries(
            Object.entries(entry.projects).map(([project, projectEntry]) => [
              project,
              resolveInsideVault(resolvedVaultRoot, projectEntry.path, `project path: ${project}`),
            ])
          )
        : undefined,
    };
  }

  return new WorkspaceResolver(config, resolvedVaultRoot);
}
```

Then implement these public methods on `WorkspaceResolver`:

```ts
getIssuePath(ref: TaskRef, summary: string, options: IssuePathOptions = {}): string {
  const { workspace, project } = parseLocalExternalKey(ref.external_key);
  const root = this.getIssueRoot(workspace, project, options.epic ?? false);
  const safeIssueId = assertSafeIssueId(ref.external_id);
  const slug = slugifySummary(summary);
  const fileName = `${safeIssueId}-${slug}.md`;
  return assertInsideRoot(path.join(root.rootPath, fileName), root.rootPath, 'issue path');
}

getLegacyIssuePath(ref: TaskRef, options: IssuePathOptions = {}): string {
  const { workspace, project } = parseLocalExternalKey(ref.external_key);
  const root = this.getIssueRoot(workspace, project, options.epic ?? false);
  const safeIssueId = assertSafeIssueId(ref.external_id);
  return assertInsideRoot(path.join(root.rootPath, `${safeIssueId}.md`), root.rootPath, 'legacy issue path');
}

getIssueRoots(): IssueRoot[] {
  const roots: IssueRoot[] = [];
  for (const [workspace, wsConfig] of Object.entries(this.config)) {
    roots.push({ workspace, rootPath: assertInsideVault(this.vaultRoot, wsConfig.path), epic: false });
    roots.push({ workspace, rootPath: assertInsideVault(this.vaultRoot, path.join(wsConfig.path, '_epics')), epic: true });

    if (wsConfig.type === 'container') {
      for (const project of wsConfig.projects ?? []) {
        const projectPath = wsConfig.projectPaths?.[project] ?? path.join(wsConfig.path, project);
        roots.push({ workspace, project, rootPath: assertInsideVault(this.vaultRoot, projectPath), epic: false });
      }
    }
  }
  return roots;
}

isAllowedIssuePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return this.getIssueRoots().some(root => isWithinBase(resolved, path.resolve(root.rootPath)));
}
```

Add the private method used by `getIssuePath()`:

```ts
private getIssueRoot(workspace: string, project: string | undefined, epic: boolean): IssueRoot {
  const wsConfig = this.config[workspace];
  if (!wsConfig) {
    throw new Error(`Unknown workspace: ${workspace}`);
  }

  if (wsConfig.type === 'single') {
    if (project) {
      throw new Error(`Workspace '${workspace}' is single-ticket and does not support projects`);
    }
    return {
      workspace,
      rootPath: epic ? assertInsideVault(this.vaultRoot, path.join(wsConfig.path, '_epics')) : assertInsideVault(this.vaultRoot, wsConfig.path),
      epic,
    };
  }

  if (!project) {
    throw new Error(`Workspace '${workspace}' is a container and requires a project name`);
  }
  if (!wsConfig.projects?.includes(project)) {
    throw new Error(`Unknown project '${project}' in workspace '${workspace}'`);
  }

  const projectPath = wsConfig.projectPaths?.[project] ?? path.join(wsConfig.path, project);
  return {
    workspace,
    project,
    rootPath: epic ? assertInsideVault(this.vaultRoot, path.join(wsConfig.path, '_epics')) : assertInsideVault(this.vaultRoot, projectPath),
    epic,
  };
}
```

Add these module-level helpers below `isWithinBase()`:

```ts
function parseLocalExternalKey(externalKey: string): { workspace: string; project?: string } {
  const parts = externalKey.split('/').filter(Boolean);
  if (parts.length === 1) return { workspace: parts[0] };
  if (parts.length === 2) return { workspace: parts[0], project: parts[1] };
  throw new Error(`Invalid local namespace: ${externalKey}`);
}

function assertSafeIssueId(issueId: string): string {
  if (!issueId || /[\/\\\0]/.test(issueId) || issueId.includes('..')) {
    throw new Error(`Invalid issue id: ${issueId}`);
  }
  return issueId;
}

function slugifySummary(summary: string): string {
  const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug || 'issue';
}

function resolveInsideVault(vaultRoot: string, relativeOrAbsolutePath: string, label: string): string {
  const resolvedPath = path.resolve(vaultRoot, relativeOrAbsolutePath);
  return assertInsideVault(vaultRoot, resolvedPath, label);
}

function assertInsideVault(vaultRoot: string | undefined, filePath: string, label = 'path'): string {
  const resolvedPath = path.resolve(filePath);
  if (!vaultRoot) return resolvedPath;

  const relative = path.relative(vaultRoot, resolvedPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} is outside vault root: ${filePath}`);
  }
  return resolvedPath;
}

function assertInsideRoot(filePath: string, rootPath: string, label = 'path'): string {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} is outside allowed issue root: ${filePath}`);
  }
  return resolvedPath;
}
```

Keep existing `getTicketPath()` and `parseTicketPath()` methods working for current tests. Update them only as needed to use the new helpers without changing their current assertions.

- [ ] **Step 4: Export new resolver types**

Update `packages/core/src/store/index.ts` to export `IssuePathOptions` and `IssueRoot`:

```ts
export { WorkspaceResolver, WorkspaceConfig, WorkspaceType, ParsedTicketPath, IssuePathOptions, IssueRoot } from './workspace-resolver';
```

- [ ] **Step 5: Run resolver tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- workspace-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit resolver path contract**

Run:

```bash
git add packages/core/src/store/workspace-resolver.ts packages/core/src/store/index.ts packages/core/tests/workspace-resolver.test.ts
git commit -m "feat(core): resolve vault issue paths through registry"
```

Expected: commit succeeds with only resolver source/export/tests staged.

## Task 3: MarkdownStore Construction and Explicit Lookup

**Files:**

- Modify: `packages/core/src/store/markdown-store.ts`
- Test: `packages/core/tests/markdown-store.test.ts`

- [ ] **Step 1: Write failing lookup tests**

Append these tests to `packages/core/tests/markdown-store.test.ts`:

```ts
describe('explicit lookup API', () => {
  it('finds local Markdown by task_ref.external_id, not external_key', async () => {
    const store = new MarkdownStore('/vault');

    vi.mocked(fs.readdir).mockResolvedValueOnce(['VC-001-contract-hardening.md'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN.replace('id: issue-auth-refresh-001', 'id: VC-001'));

    const task = await store.findByTaskRef({
      provider: 'local',
      external_key: 'vibe-coding/kanban-task-engine',
      external_id: 'VC-001',
    });

    expect(task?.task_ref.external_id).toBe('VC-001');
    expect(fs.readFile).toHaveBeenCalledWith('/vault/issues/VC-001-contract-hardening.md', 'utf-8');
  });

  it('writeBack locates an existing file by external_id when external_key is only namespace', async () => {
    const store = new MarkdownStore('/vault');
    const issue = VALID_ISSUE_MARKDOWN.replace('id: issue-auth-refresh-001', 'id: VC-001');

    vi.mocked(fs.readdir).mockResolvedValueOnce(['VC-001-contract-hardening.md'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce(issue);
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.rename).mockResolvedValue(undefined as any);

    await store.writeBack({
      task_ref: { provider: 'local', external_key: 'vibe-coding/kanban-task-engine', external_id: 'VC-001' },
      summary: 'Contract Hardening',
      workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'TODO' },
      classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
      ownership: { assignee: 'agent', reporter: 'agent' },
      planning: {},
      automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' },
    }, { summary: 'Updated Contract Hardening' });

    expect(fs.readFile).toHaveBeenCalledWith('/vault/issues/VC-001-contract-hardening.md', 'utf-8');
  });
});
```

- [ ] **Step 2: Run lookup tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: FAIL because `findByTaskRef()` and `findByIssueId()` are not implemented and `writeBack()` still calls `findByExternalKey()`.

- [ ] **Step 3: Implement constructor compatibility and explicit lookup**

Update `MarkdownStoreOptions` and constructor in `packages/core/src/store/markdown-store.ts` so both forms work:

```ts
import { TaskRef } from '../types';
import { WorkspaceResolver } from './workspace-resolver';

export interface MarkdownStoreOptions {
  vaultRoot?: string;
  resolver?: WorkspaceResolver;
  basePath?: string | string[];
  policyEngine?: {
    onTransition(task: CanonicalTaskModel, transition: StateTransition): Promise<void>;
    onParseError?(error: Error, filePath: string): void;
  };
}

constructor(basePathOrOptions: string | string[] | MarkdownStoreOptions, options?: MarkdownStoreOptions) {
  const resolvedOptions = typeof basePathOrOptions === 'string' || Array.isArray(basePathOrOptions)
    ? { ...options, basePath: basePathOrOptions }
    : basePathOrOptions;

  this.workspacePaths = resolvedOptions.basePath
    ? Array.isArray(resolvedOptions.basePath) ? resolvedOptions.basePath : [resolvedOptions.basePath]
    : [resolvedOptions.vaultRoot ?? process.cwd()];
  this.vaultRoot = resolvedOptions.vaultRoot ?? this.workspacePaths[0];
  this.resolver = resolvedOptions.resolver;
  this.policyEngine = resolvedOptions.policyEngine;
}
```

Add these methods:

```ts
async findByTaskRef(ref: TaskRef): Promise<CanonicalTaskModel | null> {
  return this.findByIssueId(ref.external_id);
}

async findByIssueId(issueId: string): Promise<CanonicalTaskModel | null> {
  const filePath = await this.findIssueFile(issueId);
  if (!filePath) return null;

  try {
    return await this.readIssueFile(filePath);
  } catch (err) {
    this.policyEngine?.onParseError?.(err as Error, filePath);
    return null;
  }
}

async resolveIssuePath(ref: TaskRef): Promise<string> {
  if (this.resolver) {
    return this.resolver.getLegacyIssuePath(ref);
  }
  const filePath = await this.findIssueFile(ref.external_id);
  if (!filePath) throw new Error(`Task not found: ${ref.external_id}`);
  return filePath;
}

async findByExternalKey(provider: string, externalKey: string): Promise<CanonicalTaskModel | null> {
  return this.findByIssueId(externalKey);
}
```

Keep `findByExternalKey()` only on `MarkdownStore` as deprecated compatibility, not on `TaskStore`.

- [ ] **Step 4: Change `writeBack()` to external_id lookup**

Replace the lookup in `writeBack()` with:

```ts
const existing = await this.findByIssueId(task.task_ref.external_id);
if (!existing) throw new Error(`Task not found: ${task.task_ref.external_id}`);
```

- [ ] **Step 5: Run lookup tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: PASS for the new explicit lookup tests and existing cache tests.

- [ ] **Step 6: Commit MarkdownStore explicit lookup**

Run:

```bash
git add packages/core/src/store/markdown-store.ts packages/core/tests/markdown-store.test.ts
git commit -m "feat(core): look up markdown tasks by issue id"
```

Expected: commit succeeds with only MarkdownStore source/tests staged.

## Task 4: Recursive Issue Scanning Including `_epics`

**Files:**

- Modify: `packages/core/src/store/markdown-store.ts`
- Test: `packages/core/tests/markdown-store.test.ts`

- [ ] **Step 1: Write failing recursive scan tests**

Append:

```ts
describe('recursive issue scanning', () => {
  it('lists single-space, container project, and epic issue files recursively', async () => {
    const store = new MarkdownStore('/vault');

    vi.mocked(fs.readdir).mockImplementation(async (dir: any, options?: any) => {
      expect(options).toEqual({ withFileTypes: true });
      const entries: Record<string, any[]> = {
        '/vault/issues': [
          { name: 'openclaw', isDirectory: () => true, isFile: () => false },
          { name: 'board.md', isDirectory: () => false, isFile: () => true },
        ],
        '/vault/issues/openclaw': [
          { name: 'OC-001-fix-heartbeat.md', isDirectory: () => false, isFile: () => true },
          { name: '_epics', isDirectory: () => true, isFile: () => false },
          { name: '.hidden.md', isDirectory: () => false, isFile: () => true },
        ],
        '/vault/issues/openclaw/_epics': [
          { name: 'OC-010-agent-runtime.md', isDirectory: () => false, isFile: () => true },
        ],
      };
      return entries[dir] ?? [];
    });

    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN.replace('id: issue-auth-refresh-001', 'id: OC-001'))
      .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN.replace('id: issue-auth-refresh-001', 'id: OC-010'));

    const tasks = await store.listTasks();

    expect(tasks.map(task => task.task_ref.external_id)).toEqual(['OC-001', 'OC-010']);
    expect(fs.readFile).not.toHaveBeenCalledWith('/vault/issues/board.md', 'utf-8');
    expect(fs.readFile).not.toHaveBeenCalledWith('/vault/issues/openclaw/.hidden.md', 'utf-8');
  });

  it('surfaces parse errors and continues scanning remaining files', async () => {
    const onParseError = vi.fn();
    const store = new MarkdownStore('/vault', { policyEngine: { onTransition: vi.fn(), onParseError } });

    vi.mocked(fs.readdir).mockImplementation(async (dir: any) => {
      if (dir === '/vault/issues') {
        return [
          { name: 'bad.md', isDirectory: () => false, isFile: () => true },
          { name: 'good.md', isDirectory: () => false, isFile: () => true },
        ] as any;
      }
      return [] as any;
    });
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(INVALID_ISSUE_MISSING_목적)
      .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN);

    const tasks = await store.listTasks();

    expect(tasks).toHaveLength(1);
    expect(onParseError).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run scan tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: FAIL because `getAllIssueFiles()` only reads direct children and includes only files directly under `issues/`.

- [ ] **Step 3: Implement recursive scanning**

Replace `getAllIssueFiles()` with a recursive directory walk:

```ts
private async getAllIssueFiles(): Promise<string[]> {
  const roots = this.resolver
    ? this.resolver.getIssueRoots().map(root => root.rootPath)
    : this.workspacePaths.map(wsPath => path.join(wsPath, 'issues'));

  const files: string[] = [];
  for (const root of roots) {
    files.push(...await this.walkIssueFiles(root));
  }
  return Array.from(new Set(files)).sort();
}

private async walkIssueFiles(dir: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as any;
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await this.walkIssueFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (this.isGeneratedBoardFile(entry.name, fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}
```

Add `isGeneratedBoardFile()` to exclude known generated board files:

```ts
private isGeneratedBoardFile(fileName: string, filePath: string): boolean {
  return fileName === 'KANBAN.md' || filePath.includes(`${path.sep}boards${path.sep}`);
}
```

- [ ] **Step 4: Run scan tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit recursive scan**

Run:

```bash
git add packages/core/src/store/markdown-store.ts packages/core/tests/markdown-store.test.ts
git commit -m "feat(core): scan vault issues recursively"
```

Expected: commit succeeds with only MarkdownStore source/tests staged.

## Task 5: Resolver-Backed MarkdownStore Writes and Path Safety

**Files:**

- Modify: `packages/core/src/store/markdown-store.ts`
- Test: `packages/core/tests/markdown-store.test.ts`

- [ ] **Step 1: Write failing resolver-backed write tests**

Append:

```ts
describe('resolver-backed writes', () => {
  it('saves local container project tasks into resolver-approved project paths', async () => {
    const resolver = WorkspaceResolver.fromRegistry({
      spaces: {
        'vibe-coding': {
          type: 'container',
          issues: 'issues/vibe-coding',
          board: 'boards/vibe-coding.md',
          projects: {
            'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' },
          },
        },
      },
    }, '/vault');
    const store = new MarkdownStore({ vaultRoot: '/vault', resolver });

    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('missing'));
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.rename).mockResolvedValue(undefined as any);
    vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_ISSUE_MARKDOWN);

    await store.saveTask({
      task_ref: { provider: 'local', external_key: 'vibe-coding/kanban-task-engine', external_id: 'VC-001' },
      summary: 'Contract Hardening',
      workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'TODO' },
      classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
      ownership: { assignee: 'agent', reporter: 'agent' },
      planning: {},
      automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' },
    });

    expect(fs.mkdir).toHaveBeenCalledWith('/vault/issues/vibe-coding/kanban-task-engine', { recursive: true });
  });

  it('rejects external_id path traversal before writing', async () => {
    const resolver = WorkspaceResolver.fromRegistry({
      spaces: {
        openclaw: { type: 'single', issues: 'issues/openclaw', board: 'boards/openclaw.md' },
      },
    }, '/vault');
    const store = new MarkdownStore({ vaultRoot: '/vault', resolver });

    await expect(store.saveTask({
      task_ref: { provider: 'local', external_key: 'openclaw', external_id: '../OC-001' },
      summary: 'Bad Path',
      workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'TODO' },
      classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
      ownership: { assignee: 'agent', reporter: 'agent' },
      planning: {},
      automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' },
    })).rejects.toThrow('Invalid issue id');

    expect(fs.mkdir).not.toHaveBeenCalled();
  });
});
```

Add `WorkspaceResolver` import at the top of the test file:

```ts
import { WorkspaceResolver } from '../src/store/workspace-resolver';
```

- [ ] **Step 2: Run write safety tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: FAIL because `saveTask()` still uses `automation.workspace ?? 'workspace'` and does not reject unsafe `external_id`.

- [ ] **Step 3: Implement resolver-approved write paths**

Replace `getIssueFilePath()` in `MarkdownStore` with:

```ts
private getIssueFilePath(task: CanonicalTaskModel): string {
  if (this.resolver && task.task_ref.provider === 'local') {
    const isEpic = task.classification.issue_type === 'Epic';
    return this.resolver.getIssuePath(task.task_ref, task.summary, { epic: isEpic });
  }

  const safeIssueId = this.assertSafeIssueId(task.task_ref.external_id);
  const workspaceDir = task.automation.workspace ?? this.vaultRoot;
  const issuesDir = path.join(workspaceDir, 'issues');
  const slug = this.slugify(task.summary);
  if (!slug) throw new Error(`Unsafe issue summary slug for ${safeIssueId}`);
  const filePath = path.join(issuesDir, `${safeIssueId}-${slug}.md`);
  return this.assertAllowedWritePath(filePath);
}
```

Add local safety helpers:

```ts
private assertSafeIssueId(issueId: string): string {
  if (!issueId || /[\/\\\0]/.test(issueId) || issueId.includes('..')) {
    throw new Error(`Invalid issue id: ${issueId}`);
  }
  return issueId;
}

private assertAllowedWritePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const vaultRoot = path.resolve(this.vaultRoot);
  const relative = path.relative(vaultRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Resolved issue path is outside vault root: ${filePath}`);
  }
  if (this.resolver && !this.resolver.isAllowedIssuePath(resolved)) {
    throw new Error(`Resolved issue path is outside allowed issue roots: ${filePath}`);
  }
  return resolved;
}
```

Ensure `slugify()` throws or returns a safe fallback instead of an empty path component:

```ts
private slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug || 'issue';
}
```

- [ ] **Step 4: Run write safety tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit write safety**

Run:

```bash
git add packages/core/src/store/markdown-store.ts packages/core/tests/markdown-store.test.ts
git commit -m "feat(core): validate markdown store write paths"
```

Expected: commit succeeds with only MarkdownStore source/tests staged.

## Task 6: Remove Ambiguous Interface Usage

**Files:**

- Modify: `packages/core/src/sync-coordinator.ts`
- Modify: `packages/core/src/store/markdown-store.ts`
- Test: `packages/core/tests/markdown-store.test.ts`

- [ ] **Step 1: Search for ambiguous lookup usage**

Run:

```bash
rg -n "findByExternalKey" packages
```

Expected before implementation: hits in `packages/core/src/store/markdown-store.ts` only if deprecated compatibility remains, and `packages/core/src/sync-coordinator.ts` if not yet fixed.

- [ ] **Step 2: Add a regression test that `TaskStore` consumers do not need `findByExternalKey`**

Create or update `packages/core/tests/sync-coordinator.test.ts` in Task 7 for sync behavior. For this task, no separate runtime test is needed; the TypeScript build is the contract test.

- [ ] **Step 3: Remove all `TaskStore` caller usage**

Do not call `findByExternalKey()` from any code typed as `TaskStore`. Keep this optional method only as a concrete `MarkdownStore` compatibility method:

```ts
/**
 * @deprecated Use findByTaskRef() or findByIssueId(). This method treats the second argument as an issue id.
 */
async findByExternalKey(_provider: string, externalKey: string): Promise<CanonicalTaskModel | null> {
  return this.findByIssueId(externalKey);
}
```

- [ ] **Step 4: Run search and build**

Run:

```bash
rg -n "findByExternalKey" packages
pnpm --filter @kanban-task-engine/core build
```

Expected:

- `rg` returns only the deprecated method and comment in `packages/core/src/store/markdown-store.ts`, or no results if the implementation removes compatibility entirely.
- `pnpm --filter @kanban-task-engine/core build` passes.

- [ ] **Step 5: Commit ambiguous API removal**

Run:

```bash
git add packages/core/src/store/markdown-store.ts packages/core/src/sync-coordinator.ts packages/core/tests/sync-coordinator.test.ts
git commit -m "refactor(core): remove namespace-only store lookup"
```

Expected: commit succeeds. If `packages/core/tests/sync-coordinator.test.ts` is not created until Task 7, exclude it from this commit.

## Task 7: SyncCoordinator Namespace and Issue Id Fix

**Files:**

- Modify: `packages/core/src/sync-coordinator.ts`
- Test: `packages/core/tests/sync-coordinator.test.ts`

- [ ] **Step 1: Write focused sync coordinator tests**

Create `packages/core/tests/sync-coordinator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { SyncCoordinator } from '../src/sync-coordinator';
import { TaskStore, WorkStateProvider, CanonicalTaskModel } from '../src/types';
import { EventBus } from '../src/event-bus';
import { StateMachine } from '../src/state-machine';
import { PolicyEngine } from '../src/policy-engine';

function makeTask(overrides: Partial<CanonicalTaskModel> = {}): CanonicalTaskModel {
  return {
    task_ref: { provider: 'github', external_key: 'owner/repo', external_id: '#123' },
    summary: 'Remote issue',
    workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'TODO' },
    classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
    ownership: { assignee: 'agent', reporter: 'agent' },
    planning: {},
    automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
    sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'github' },
    ...overrides,
  };
}

describe('SyncCoordinator', () => {
  it('syncFromProvider looks up local equivalents by task ref issue id, not namespace only', async () => {
    const remote = makeTask();
    const store: TaskStore = {
      findByTaskRef: vi.fn().mockResolvedValue(null),
      findByIssueId: vi.fn().mockResolvedValue(null),
      resolveIssuePath: vi.fn(),
      saveTask: vi.fn().mockResolvedValue(undefined),
      updateTask: vi.fn().mockResolvedValue(undefined),
      writeBack: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
      deleteTask: vi.fn().mockResolvedValue(undefined),
    };
    const provider: WorkStateProvider = {
      fetchTasks: vi.fn().mockResolvedValue([remote]),
      fetchTask: vi.fn(),
      pushStatus: vi.fn(),
      resolveRef: vi.fn(),
    };
    const coordinator = new SyncCoordinator(store, new EventBus(), new StateMachine(), new PolicyEngine());
    coordinator.registerProvider('github', provider);

    await coordinator.syncFromProvider('github');

    expect(store.findByTaskRef).toHaveBeenCalledWith(remote.task_ref);
    expect(store.findByIssueId).not.toHaveBeenCalledWith('owner/repo');
    expect(store.saveTask).toHaveBeenCalledWith(expect.objectContaining({
      task_ref: remote.task_ref,
      sync: expect.objectContaining({ last_source: 'github' }),
    }));
  });

  it('pushToProvider uses external_id when provider task identity is available', async () => {
    const task = makeTask();
    const store: TaskStore = {
      findByTaskRef: vi.fn(),
      findByIssueId: vi.fn(),
      resolveIssuePath: vi.fn(),
      saveTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      writeBack: vi.fn(),
      listTasks: vi.fn(),
      deleteTask: vi.fn(),
    };
    const provider: WorkStateProvider = {
      fetchTasks: vi.fn(),
      fetchTask: vi.fn(),
      pushStatus: vi.fn().mockResolvedValue(undefined),
      resolveRef: vi.fn(),
    };
    const coordinator = new SyncCoordinator(store, new EventBus(), new StateMachine(), new PolicyEngine());
    coordinator.registerProvider('github', provider);

    await coordinator.pushToProvider('github', task);

    expect(provider.pushStatus).toHaveBeenCalledWith('#123', 'READY');
    expect(provider.pushStatus).not.toHaveBeenCalledWith('owner/repo', 'READY');
  });
});
```

- [ ] **Step 2: Run sync tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- sync-coordinator.test.ts
```

Expected: FAIL because `syncFromProvider()` calls `findByExternalKey()` and `pushToProvider()` passes `external_key`.

- [ ] **Step 3: Implement sync lookup fix**

In `packages/core/src/sync-coordinator.ts`, replace:

```ts
const localTask = await this.taskStore.findByExternalKey(
  remoteTask.task_ref.provider,
  remoteTask.task_ref.external_key
);
```

with:

```ts
const localTask = await this.taskStore.findByTaskRef(remoteTask.task_ref)
  ?? await this.taskStore.findByIssueId(remoteTask.task_ref.external_id);
```

This preserves provider namespace in `remoteTask.task_ref.external_key` for conflict metadata while using `external_id` for local issue identity.

- [ ] **Step 4: Implement push id fix**

In `pushToProvider()`, replace:

```ts
await provider.pushStatus(task.task_ref.external_key, task.workflow.normalized_status);
```

with:

```ts
await provider.pushStatus(task.task_ref.external_id, task.workflow.normalized_status);
```

Do not redesign `WorkStateProvider` in this spec; adapter-hardening owns broader provider API changes.

- [ ] **Step 5: Run sync tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- sync-coordinator.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit sync fix**

Run:

```bash
git add packages/core/src/sync-coordinator.ts packages/core/tests/sync-coordinator.test.ts
git commit -m "fix(core): sync tasks by provider issue id"
```

Expected: commit succeeds with only sync source/tests staged.

## Task 8: Full Core Integration and Compile Fixes

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/store/markdown-store.ts`
- Modify: `packages/core/src/store/workspace-resolver.ts`
- Modify: `packages/core/src/sync-coordinator.ts`
- Test: all modified tests.

- [ ] **Step 1: Run focused core tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- markdown-store.test.ts workspace-resolver.test.ts sync-coordinator.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run core build**

Run:

```bash
pnpm --filter @kanban-task-engine/core build
```

Expected: PASS. If TypeScript fails in downstream imports, update only the files named in the errors.

- [ ] **Step 3: Search for stale identity misuse**

Run:

```bash
rg -n "findByExternalKey|external_key\\).*issue|external_key\\)|pushStatus\\(task\\.task_ref\\.external_key|findIssueFile\\(.*external_key" packages/core packages/adapter-*
```

Expected: no live caller uses `external_key` as the issue id. A deprecated `MarkdownStore.findByExternalKey()` comment or method is acceptable only if it delegates to `findByIssueId()`.

- [ ] **Step 4: Commit integration cleanup**

Run:

```bash
git add packages/core packages/adapter-github packages/adapter-jira packages/adapter-firebase packages/adapter-openclaw packages/adapter-cli
git diff --cached --name-only
git commit -m "chore(core): finish vault store integration"
```

Expected: `git diff --cached --name-only` lists only files required by compile fixes and tests. If no changes remain after previous commits, skip this commit.

## Task 9: Full Workspace Verification

**Files:**

- Test only; no source edits unless verification exposes a real failure.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS across all workspace packages.

- [ ] **Step 2: Run full build**

Run:

```bash
pnpm build
```

Expected: PASS across all workspace packages.

- [ ] **Step 3: Run final identity/path scan**

Run:

```bash
rg -n "findByExternalKey|task_ref\\.external_key" packages/core/src packages/core/tests
```

Expected:

- No `TaskStore` interface entry for `findByExternalKey`.
- No `SyncCoordinator` lookup using `external_key` as issue id.
- Expected remaining `task_ref.external_key` usages are namespace metadata, path namespace resolution, or test fixtures.

- [ ] **Step 4: Commit verification-only fixes if any**

If Step 1 or Step 2 required changes, run:

```bash
git add <changed-files>
git commit -m "fix(core): satisfy workspace verification"
```

Expected: commit includes only fixes directly required by `pnpm test` or `pnpm build`.

If no changes were required, do not create an empty commit.

## Self-Review Checklist

- [ ] `TaskRef` semantics are represented in Assumptions and Task 7: namespace remains `external_key`, issue identity is `external_id`.
- [ ] Explicit `TaskStore` API is implemented in Task 1 and satisfied by `MarkdownStore` in Task 3.
- [ ] Ambiguous `findByExternalKey()` interface usage is removed in Task 6 and verified again in Task 9.
- [ ] Resolver-backed `MarkdownStore` construction is implemented in Task 3 and resolver-approved writes in Task 5.
- [ ] Recursive issue scanning, nested project issues, and `_epics` are tested and implemented in Task 4.
- [ ] Path traversal rejection, unsafe `external_id` rejection, empty slug safety, allowed issue root checks, and atomic write preservation are covered in Task 5.
- [ ] `WorkspaceResolver.fromRegistry()` honors `projects.*.path`, rejects unknown spaces/projects, resolves Epic paths, and rejects paths outside vault root in Task 2.
- [ ] `MarkdownStore.writeBack()` locates existing files using `task_ref.external_id` in Task 3.
- [ ] `SyncCoordinator.syncFromProvider()` no longer calls local lookup with `external_key` as the issue id in Task 7.
- [ ] `pushToProvider()` does not push status by `external_key` alone when `external_id` is available in Task 7.
- [ ] Tests cover single-space, container project, and Epic paths across Tasks 2, 4, and 5.
- [ ] Full workspace verification uses both `pnpm test` and `pnpm build` in Task 9.
