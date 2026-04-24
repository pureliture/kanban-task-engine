# Kanban Execution Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local execution harness that runs one non-Epic `READY` Markdown issue, records auditable artifacts, and exposes `kanban run`, `approve`, `abort`, and `retry` commands.

**Architecture:** Build the execution path in `@kanban-task-engine/core` first, using a fake executor and isolated services for locks, worktrees, artifacts, issue logs, and state transitions. Wire `packages/cli` to the fake executor after fake executor coverage is green, then add the `ClaudeCodeExecutor` wrapper and expose Claude selection without changing the harness contract.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, Node `fs/promises`, Node `child_process`, existing `MarkdownStore`, `WorkspaceResolver`, `StateMachine`, and CLI context from the CLI MVP plan.

---

## File Structure

Create in `packages/core/src/executor/`:

- `types.ts` - executor request/result interfaces, dry-run/run result types, and approval action result types.
- `lock.ts` - filesystem lock acquisition, stale lock detection, and `finally`-safe release handle.
- `worktree.ts` - non-interactive git worktree planning, creation, ff-only merge, metadata, and cleanup helpers.
- `prompt-assembler.ts` - deterministic prompt rendering from a canonical issue and source Markdown body.
- `command-runner.ts` - thin async wrapper around non-interactive child process execution with timeout handling.
- `fake-executor.ts` - `success`, `failure`, and `timeout` executor modes for deterministic tests.
- `claude-code-executor.ts` - wrapper around `claude` after fake executor integration is complete.
- `run-artifacts.ts` - run directory planning and writing `prompt.md`, `stdout.txt`, `stderr.txt`, and `metadata.json`.
- `issue-log.ts` - append-only `## 로그` section writer that creates the section when absent.
- `state-transition-service.ts` - issue reload, guarded state transitions, timestamps, store writes, and event JSONL writes.
- `execution-harness.ts` - orchestration for `run`, `approve`, `abort`, and `retry`.
- `index.ts` - exports for executor services.

Create tests in `packages/core/tests/executor/`:

- `fake-executor.test.ts`
- `lock.test.ts`
- `worktree.test.ts`
- `run-artifacts.test.ts`
- `issue-log.test.ts`
- `state-transition-service.test.ts`
- `execution-harness-dry-run.test.ts`
- `execution-harness-fake-run.test.ts`
- `execution-harness-approval.test.ts`
- `claude-code-executor.test.ts`

Modify in `packages/core/`:

- `src/index.ts` - export executor APIs.
- `src/store/markdown-store.ts` - only if the vault-store plan has not already exposed `findByIssueId()`, `resolveIssuePath()`, and issue path read/write helpers needed by the harness. Do not reimplement vault-store tasks here.
- `tests/markdown-store.test.ts` - only if a small harness-facing helper is added after the vault-store plan.

Modify in `packages/cli/` after the CLI MVP plan exists:

- `src/index.ts` - register `run`, `approve`, `abort`, and `retry`.
- `src/context.ts` - expose harness construction dependencies without changing MVP path resolution rules; add Claude selection after `ClaudeCodeExecutor` exists.
- `src/commands/run.ts` - parse `kanban run <issue-id> [--dry-run] [--executor fake|claude] [--fake-mode success|failure|timeout] [--json]`.
- `src/commands/approve.ts` - parse `kanban approve <issue-id> [--json]`.
- `src/commands/abort.ts` - parse `kanban abort <issue-id> [--json]`.
- `src/commands/retry.ts` - parse `kanban retry <issue-id> [--cleanup-worktree] [--json]`.
- `tests/commands/run.test.ts`
- `tests/commands/approval.test.ts`

Do not modify:

- `packages/schema` except for compile fallout caused by already-merged contract hardening.
- External adapters.
- Board rendering behavior.
- OpenClaw, GitHub, Firebase, Jira, or web UI integration.

## Dependencies and Preconditions

- Complete `docs/superpowers/plans/2026-04-24-kanban-contract-hardening-plan.md` before this plan. This plan relies on core-owned canonical validation and Epic transition rejection.
- Complete `docs/superpowers/plans/2026-04-24-kanban-vault-store-plan.md` before this plan. This plan relies on `TaskStore.findByIssueId()`, `TaskStore.resolveIssuePath()`, resolver-approved writes, nested issue lookup, and recursive issue scanning.
- Complete the CLI MVP implementation from `docs/superpowers/specs/2026-04-24-kanban-cli-mvp-spec.md` before CLI tasks in this plan. If a separate CLI MVP plan file exists by implementation time, follow it first; this plan assumes `packages/cli` already has `context.ts`, command registration, human output, JSON output, and command tests.
- Work from `~/.config/superpowers/worktrees/kanban-task-engine/docs-gpt55-review-specs` or a fresh isolated implementation worktree.
- Run `git status --short` before each task. If another agent has modified files outside the task scope, do not revert them.
- Commit after each task. If a task fails verification, fix only files listed for that task or stop and record the blocker.

## Shared Test Fixtures

Use these fixture helpers in tests that need a vault. Put them in `packages/core/tests/executor/fixtures.ts` during Task 1:

```ts
import fs from 'fs/promises';
import path from 'path';

export async function writeRegistry(vaultRoot: string): Promise<void> {
  await fs.mkdir(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, 'boards'), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, 'events'), { recursive: true });
  await fs.writeFile(
    path.join(vaultRoot, 'registry.yaml'),
    `spaces:
  vibe-coding:
    type: container
    issues: issues/vibe-coding
    board: boards/vibe-coding.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
`,
    'utf-8'
  );
}

export function issueMarkdown(id: string, status: string, type = 'task'): string {
  return `---
id: ${id}
title: Execute ${id}
type: ${type}
status: ${status}
executor: claude-code
project: vibe-coding/kanban-task-engine
working_dir: /tmp/kanban-target
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P1
---

## 목적
Execute one issue.

## 컨텍스트
The harness should run this task.

## Acceptance Criteria
- The run is audited.

## 실행 힌트
Use the fake executor in tests.
`;
}
```

If the contract hardening plan keeps `working_dir` out of frontmatter parsing, store it in `automation.workspace` metadata or a harness-specific parsed field in core tests, but keep production lookup based on the final canonical model shape from the prerequisite plans.

### Task 1: Executor Contract and Fake Executor

**Files:**

- Create: `packages/core/src/executor/types.ts`
- Create: `packages/core/src/executor/fake-executor.ts`
- Create: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/fixtures.ts`
- Create: `packages/core/tests/executor/fake-executor.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing fake executor tests**

Create `packages/core/tests/executor/fake-executor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeExecutor } from '../../src/executor/fake-executor';

const request = {
  issue: {
    task_ref: { provider: 'local' as const, external_key: 'vibe-coding/kanban-task-engine', external_id: 'VC-900' },
    summary: 'Execute VC-900',
    workflow: { normalized_status: 'READY' as const, raw_status: 'READY', raw_status_category: 'READY' as const },
    classification: { issue_type: 'Task' as const, priority: 'High' as const, labels: [], component: [] },
    ownership: { assignee: '', reporter: '' },
    planning: {},
    automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' as const },
    sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' as const },
  },
  promptPath: '/tmp/prompt.md',
};

describe('FakeExecutor', () => {
  it('returns a successful run result', async () => {
    const result = await new FakeExecutor('success').run(request);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Fake executor completed VC-900');
    expect(result.stderr).toBe('');
    expect(result.startedAt).toMatch(/T/);
    expect(result.completedAt).toMatch(/T/);
  });

  it('returns a failed run result', async () => {
    const result = await new FakeExecutor('failure').run(request);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Fake executor failed VC-900');
    expect(result.stderr).toContain('simulated failure');
  });

  it('returns a timeout-shaped failed run result', async () => {
    const result = await new FakeExecutor('timeout').run(request);
    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain('simulated timeout');
  });
});
```

- [ ] **Step 2: Run fake executor test to verify it fails**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/fake-executor.test.ts
```

Expected: FAIL with `Cannot find module '../../src/executor/fake-executor'`.

- [ ] **Step 3: Implement executor types and fake executor**

Create `packages/core/src/executor/types.ts`:

```ts
import type { CanonicalTaskModel, NormalizedStatus } from '../types';

export interface ExecutorRunRequest {
  issue: CanonicalTaskModel;
  promptPath: string;
  worktreePath?: string;
  timeoutMs?: number;
}

export interface ExecutorRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
}

export interface IssueExecutor {
  name: string;
  run(request: ExecutorRunRequest): Promise<ExecutorRunResult>;
}

export type FakeExecutorMode = 'success' | 'failure' | 'timeout';

export interface PlannedRun {
  issueId: string;
  statusBefore: NormalizedStatus;
  executor: string;
  worktreePath?: string;
  runDirectory: string;
  promptPreview: string;
}

export interface HarnessRunResult {
  issueId: string;
  executor: string;
  statusBefore: NormalizedStatus;
  statusAfter: 'REVIEW' | 'FAILED';
  artifactsPath: string;
  exitCode: number;
}
```

Create `packages/core/src/executor/fake-executor.ts`:

```ts
import type { ExecutorRunRequest, ExecutorRunResult, FakeExecutorMode, IssueExecutor } from './types';

export class FakeExecutor implements IssueExecutor {
  readonly name = 'fake';

  constructor(private readonly mode: FakeExecutorMode = 'success') {}

  async run(request: ExecutorRunRequest): Promise<ExecutorRunResult> {
    const startedAt = new Date().toISOString();
    const issueId = request.issue.task_ref.external_id;
    const completedAt = new Date().toISOString();

    if (this.mode === 'success') {
      return {
        exitCode: 0,
        stdout: `Fake executor completed ${issueId}\n`,
        stderr: '',
        startedAt,
        completedAt,
      };
    }

    if (this.mode === 'timeout') {
      return {
        exitCode: 124,
        stdout: '',
        stderr: `Fake executor simulated timeout for ${issueId}\n`,
        startedAt,
        completedAt,
      };
    }

    return {
      exitCode: 1,
      stdout: `Fake executor failed ${issueId}\n`,
      stderr: `Fake executor simulated failure for ${issueId}\n`,
      startedAt,
      completedAt,
    };
  }
}
```

Create `packages/core/src/executor/index.ts`:

```ts
export * from './types';
export { FakeExecutor } from './fake-executor';
```

Append to `packages/core/src/index.ts`:

```ts
export * from './executor';
```

Create `packages/core/tests/executor/fixtures.ts` using the shared fixture block above.

- [ ] **Step 4: Run fake executor test to verify it passes**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/fake-executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/executor packages/core/src/index.ts packages/core/tests/executor
git commit -m "feat(core): add executor contract and fake executor"
```

### Task 2: Artifact Writer and Issue Log Appender

**Files:**

- Create: `packages/core/src/executor/run-artifacts.ts`
- Create: `packages/core/src/executor/issue-log.ts`
- Modify: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/run-artifacts.test.ts`
- Create: `packages/core/tests/executor/issue-log.test.ts`

- [ ] **Step 1: Write failing artifact writer tests**

Create `packages/core/tests/executor/run-artifacts.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { RunArtifactWriter } from '../../src/executor/run-artifacts';

describe('RunArtifactWriter', () => {
  it('plans dated run paths without writing in dry-run callers', () => {
    const writer = new RunArtifactWriter('/vault');
    const planned = writer.plan('VC-901', new Date('2026-04-24T10:11:12.000Z'));
    expect(planned.runDirectory).toBe(path.join('/vault', 'runs/2026-04-24/VC-901'));
    expect(planned.promptPath).toBe(path.join(planned.runDirectory, 'prompt.md'));
    expect(planned.stdoutPath).toBe(path.join(planned.runDirectory, 'stdout.txt'));
    expect(planned.stderrPath).toBe(path.join(planned.runDirectory, 'stderr.txt'));
    expect(planned.metadataPath).toBe(path.join(planned.runDirectory, 'metadata.json'));
  });

  it('writes prompt, stdout, stderr, and metadata files', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-artifacts-'));
    const writer = new RunArtifactWriter(vaultRoot);
    const paths = writer.plan('VC-902', new Date('2026-04-24T10:11:12.000Z'));

    await writer.write({
      paths,
      prompt: '# Prompt',
      stdout: 'out',
      stderr: 'err',
      metadata: {
        issueId: 'VC-902',
        executor: 'fake',
        statusBefore: 'READY',
        statusAfter: 'REVIEW',
        startedAt: '2026-04-24T10:11:12.000Z',
        completedAt: '2026-04-24T10:11:13.000Z',
        promptPath: paths.promptPath,
        stdoutPath: paths.stdoutPath,
        stderrPath: paths.stderrPath,
        exitCode: 0,
      },
    });

    expect(await fs.readFile(paths.promptPath, 'utf-8')).toBe('# Prompt');
    expect(await fs.readFile(paths.stdoutPath, 'utf-8')).toBe('out');
    expect(await fs.readFile(paths.stderrPath, 'utf-8')).toBe('err');
    const metadata = JSON.parse(await fs.readFile(paths.metadataPath, 'utf-8'));
    expect(metadata.issueId).toBe('VC-902');
    expect(metadata.statusAfter).toBe('REVIEW');
  });
});
```

- [ ] **Step 2: Write failing issue log tests**

Create `packages/core/tests/executor/issue-log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendIssueLogEntry } from '../../src/executor/issue-log';

describe('appendIssueLogEntry', () => {
  it('appends to an existing 로그 section', () => {
    const next = appendIssueLogEntry(`# Title

## 목적
Body

## 로그
- old
`, '- 2026-04-24T00:00:00.000Z RUNNING: execution started by fake.');

    expect(next).toContain('## 로그\n- old\n- 2026-04-24T00:00:00.000Z RUNNING: execution started by fake.');
  });

  it('creates 로그 section when it is missing', () => {
    const next = appendIssueLogEntry(`# Title

## 목적
Body
`, '- 2026-04-24T00:00:00.000Z REVIEW: execution completed successfully. Artifacts: runs/2026-04-24/VC-903.');

    expect(next).toContain('## 로그\n- 2026-04-24T00:00:00.000Z REVIEW: execution completed successfully.');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/run-artifacts.test.ts executor/issue-log.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement artifact writer and log appender**

Create `packages/core/src/executor/run-artifacts.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';

export interface RunArtifactPaths {
  runDirectory: string;
  promptPath: string;
  stdoutPath: string;
  stderrPath: string;
  metadataPath: string;
}

export interface RunMetadata {
  issueId: string;
  executor: string;
  statusBefore: 'READY';
  statusAfter: 'REVIEW' | 'FAILED';
  startedAt: string;
  completedAt: string;
  worktreePath?: string;
  promptPath: string;
  stdoutPath: string;
  stderrPath: string;
  exitCode: number;
}

export class RunArtifactWriter {
  constructor(private readonly vaultRoot: string) {}

  plan(issueId: string, now = new Date()): RunArtifactPaths {
    const date = now.toISOString().slice(0, 10);
    const runDirectory = path.join(this.vaultRoot, 'runs', date, issueId);
    return {
      runDirectory,
      promptPath: path.join(runDirectory, 'prompt.md'),
      stdoutPath: path.join(runDirectory, 'stdout.txt'),
      stderrPath: path.join(runDirectory, 'stderr.txt'),
      metadataPath: path.join(runDirectory, 'metadata.json'),
    };
  }

  async write(input: {
    paths: RunArtifactPaths;
    prompt: string;
    stdout: string;
    stderr: string;
    metadata: RunMetadata;
  }): Promise<void> {
    await fs.mkdir(input.paths.runDirectory, { recursive: true });
    await fs.writeFile(input.paths.promptPath, input.prompt, 'utf-8');
    await fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf-8');
    await fs.writeFile(input.paths.stderrPath, input.stderr, 'utf-8');
    await fs.writeFile(input.paths.metadataPath, `${JSON.stringify(input.metadata, null, 2)}\n`, 'utf-8');
  }
}
```

Create `packages/core/src/executor/issue-log.ts`:

```ts
export function appendIssueLogEntry(markdown: string, entry: string): string {
  const normalizedEntry = entry.endsWith('\n') ? entry.slice(0, -1) : entry;
  const logHeading = /^## 로그\s*$/m;
  const match = logHeading.exec(markdown);

  if (!match) {
    const base = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
    return `${base}\n## 로그\n${normalizedEntry}\n`;
  }

  const insertAt = markdown.length;
  const base = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  return `${base.slice(0, insertAt)}${normalizedEntry}\n${base.slice(insertAt)}`;
}

export function runningLogEntry(timestamp: string, executor: string): string {
  return `- ${timestamp} RUNNING: execution started by ${executor}.`;
}

export function reviewLogEntry(timestamp: string, artifactsRelativePath: string): string {
  return `- ${timestamp} REVIEW: execution completed successfully. Artifacts: ${artifactsRelativePath}.`;
}

export function failedLogEntry(timestamp: string, exitCode: number, artifactsRelativePath: string): string {
  return `- ${timestamp} FAILED: execution failed with exit code ${exitCode}. Artifacts: ${artifactsRelativePath}.`;
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export * from './run-artifacts';
export * from './issue-log';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/run-artifacts.test.ts executor/issue-log.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor
git commit -m "feat(core): write run artifacts and issue logs"
```

### Task 3: Lock Manager with Guaranteed Release Path

**Files:**

- Create: `packages/core/src/executor/lock.ts`
- Modify: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/lock.test.ts`

- [ ] **Step 1: Write failing lock tests**

Create `packages/core/tests/executor/lock.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { LockManager } from '../../src/executor/lock';

describe('LockManager', () => {
  it('acquires and releases an issue lock', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-lock-'));
    const manager = new LockManager(vaultRoot);
    const lock = await manager.acquire('VC-904');
    await expect(fs.stat(lock.path)).resolves.toBeTruthy();
    await lock.release();
    await expect(fs.stat(lock.path)).rejects.toThrow();
  });

  it('rejects a second lock for the same issue', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-lock-'));
    const manager = new LockManager(vaultRoot);
    const lock = await manager.acquire('VC-905');
    await expect(manager.acquire('VC-905')).rejects.toThrow('Issue is already locked: VC-905');
    await lock.release();
  });

  it('releases the lock when withLock callback throws', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-lock-'));
    const manager = new LockManager(vaultRoot);
    await expect(manager.withLock('VC-906', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await expect(manager.acquire('VC-906')).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run lock tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/lock.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement lock manager**

Create `packages/core/src/executor/lock.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';

export interface LockHandle {
  issueId: string;
  path: string;
  release(): Promise<void>;
}

export class LockManager {
  constructor(private readonly vaultRoot: string) {}

  async acquire(issueId: string): Promise<LockHandle> {
    const lockDir = path.join(this.vaultRoot, 'runtime', 'locks');
    await fs.mkdir(lockDir, { recursive: true });
    const lockPath = path.join(lockDir, `${issueId}.lock`);

    try {
      const file = await fs.open(lockPath, 'wx');
      await file.writeFile(JSON.stringify({ issueId, acquiredAt: new Date().toISOString() }));
      await file.close();
    } catch (error: any) {
      if (error?.code === 'EEXIST') {
        throw new Error(`Issue is already locked: ${issueId}`);
      }
      throw error;
    }

    return {
      issueId,
      path: lockPath,
      release: async () => {
        await fs.rm(lockPath, { force: true });
      },
    };
  }

  async withLock<T>(issueId: string, callback: () => Promise<T>): Promise<T> {
    const lock = await this.acquire(issueId);
    try {
      return await callback();
    } finally {
      await lock.release();
    }
  }
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export * from './lock';
```

- [ ] **Step 4: Run lock tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/lock.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/lock.test.ts
git commit -m "feat(core): add issue lock manager"
```

### Task 4: Worktree Manager and Command Runner

**Files:**

- Create: `packages/core/src/executor/command-runner.ts`
- Create: `packages/core/src/executor/worktree.ts`
- Modify: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/worktree.test.ts`

- [ ] **Step 1: Write failing worktree manager tests**

Create `packages/core/tests/executor/worktree.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { WorktreeManager } from '../../src/executor/worktree';
import type { CommandRunner } from '../../src/executor/command-runner';

describe('WorktreeManager', () => {
  it('plans default worktree path under target repo', () => {
    const manager = new WorktreeManager({ run: vi.fn() } as unknown as CommandRunner);
    expect(manager.plan('/repo', 'VC-907')).toBe(path.join('/repo', '.worktrees/kanban/VC-907'));
  });

  it('creates a git worktree with non-interactive commands and rejects existing paths', async () => {
    const targetRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-repo-'));
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const runner = {
      run: vi.fn(async (args: string[], options?: { cwd?: string }) => {
        calls.push({ args, cwd: options?.cwd });
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
    } as unknown as CommandRunner;

    const manager = new WorktreeManager(runner);
    const result = await manager.create({ targetRepo, issueId: 'VC-908' });

    expect(result.path).toBe(path.join(targetRepo, '.worktrees/kanban/VC-908'));
    expect(calls[0]).toEqual({
      args: ['worktree', 'add', result.path, '-b', 'kanban/VC-908'],
      cwd: targetRepo,
    });
    await fs.mkdir(result.path, { recursive: true });
    await expect(manager.create({ targetRepo, issueId: 'VC-908' })).rejects.toThrow('Worktree already exists');
  });

  it('merges approved work with ff-only', async () => {
    const runner = {
      run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
    } as unknown as CommandRunner;
    const manager = new WorktreeManager(runner);
    await manager.mergeFastForward({ targetRepo: '/repo', branch: 'kanban/VC-909' });
    expect(runner.run).toHaveBeenCalledWith(['merge', '--ff-only', 'kanban/VC-909'], { cwd: '/repo' });
  });
});
```

- [ ] **Step 2: Run worktree tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/worktree.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement command runner**

Create `packages/core/src/executor/command-runner.ts`:

```ts
import { spawn } from 'child_process';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class CommandRunner {
  async run(args: string[], options: { cwd?: string; command?: string; timeoutMs?: number } = {}): Promise<CommandResult> {
    const command = options.command ?? 'git';
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      const timeout = options.timeoutMs
        ? setTimeout(() => {
            child.kill('SIGTERM');
          }, options.timeoutMs)
        : undefined;

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('close', code => {
        if (timeout) clearTimeout(timeout);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }
}
```

- [ ] **Step 4: Implement worktree manager**

Create `packages/core/src/executor/worktree.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { CommandRunner } from './command-runner';

export interface WorktreeMetadata {
  path: string;
  branch: string;
  targetRepo: string;
}

export class WorktreeManager {
  constructor(private readonly runner: CommandRunner) {}

  plan(targetRepo: string, issueId: string): string {
    return path.join(targetRepo, '.worktrees', 'kanban', issueId);
  }

  async create(input: { targetRepo: string; issueId: string }): Promise<WorktreeMetadata> {
    const worktreePath = this.plan(input.targetRepo, input.issueId);
    try {
      await fs.stat(worktreePath);
      throw new Error(`Worktree already exists: ${worktreePath}`);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const branch = `kanban/${input.issueId}`;
    await this.runner.run(['worktree', 'add', worktreePath, '-b', branch], { cwd: input.targetRepo });
    return { path: worktreePath, branch, targetRepo: input.targetRepo };
  }

  async mergeFastForward(input: { targetRepo: string; branch: string }): Promise<void> {
    const result = await this.runner.run(['merge', '--ff-only', input.branch], { cwd: input.targetRepo });
    if (result.exitCode !== 0) {
      throw new Error(`ff-only merge failed: ${result.stderr || result.stdout}`);
    }
  }

  async cleanup(worktreePath: string, targetRepo: string): Promise<void> {
    const result = await this.runner.run(['worktree', 'remove', worktreePath, '--force'], { cwd: targetRepo });
    if (result.exitCode !== 0) {
      throw new Error(`worktree cleanup failed: ${result.stderr || result.stdout}`);
    }
  }
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export * from './command-runner';
export * from './worktree';
```

- [ ] **Step 5: Run worktree tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/worktree.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/worktree.test.ts
git commit -m "feat(core): add worktree manager"
```

### Task 5: Prompt Assembler and State Transition Service

**Files:**

- Create: `packages/core/src/executor/prompt-assembler.ts`
- Create: `packages/core/src/executor/state-transition-service.ts`
- Modify: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/state-transition-service.test.ts`

- [ ] **Step 1: Write failing state transition tests**

Create `packages/core/tests/executor/state-transition-service.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MarkdownStore, WorkspaceResolver } from '../../src';
import { StateMachine } from '../../src/state-machine';
import { StateTransitionService } from '../../src/executor/state-transition-service';
import { issueMarkdown, writeRegistry } from './fixtures';

describe('StateTransitionService', () => {
  it('transitions issue status, appends log entry, and writes event JSONL', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-state-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-910-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-910', 'READY'), 'utf-8');

    const resolver = WorkspaceResolver.fromRegistry({
      spaces: {
        'vibe-coding': {
          type: 'container',
          issues: 'issues/vibe-coding',
          board: 'boards/vibe-coding.md',
          projects: { 'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' } },
        },
      },
    }, vaultRoot);
    const store = new MarkdownStore({ vaultRoot, resolver });
    const service = new StateTransitionService({ store, stateMachine: new StateMachine(), vaultRoot });

    await service.transitionAndLog('VC-910', 'RUNNING', '- 2026-04-24T00:00:00.000Z RUNNING: execution started by fake.');

    const content = await fs.readFile(issuePath, 'utf-8');
    expect(content).toContain('status: RUNNING');
    expect(content).toContain('RUNNING: execution started by fake.');
    const eventContent = await fs.readFile(path.join(vaultRoot, 'events/execution.jsonl'), 'utf-8');
    expect(JSON.parse(eventContent.trim())).toMatchObject({ issueId: 'VC-910', to: 'RUNNING' });
  });
});
```

- [ ] **Step 2: Run transition test to verify it fails**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/state-transition-service.test.ts
```

Expected: FAIL with missing `StateTransitionService`, or with constructor mismatches if prerequisite plans changed `MarkdownStore`. Adjust only the test setup to the final vault-store constructor shape, not the service behavior.

- [ ] **Step 3: Implement prompt assembler**

Create `packages/core/src/executor/prompt-assembler.ts`:

```ts
import type { CanonicalTaskModel } from '../types';

export class PromptAssembler {
  assemble(issue: CanonicalTaskModel, markdownBody: string): string {
    return [
      `# Execute ${issue.task_ref.external_id}: ${issue.summary}`,
      '',
      '## Issue',
      `- ID: ${issue.task_ref.external_id}`,
      `- Status: ${issue.workflow.normalized_status}`,
      `- Type: ${issue.classification.issue_type}`,
      `- Priority: ${issue.classification.priority}`,
      '',
      '## Source Markdown',
      markdownBody.trim(),
      '',
    ].join('\n');
  }
}
```

- [ ] **Step 4: Implement state transition service**

Create `packages/core/src/executor/state-transition-service.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import type { NormalizedStatus, TaskStore } from '../types';
import { StateMachine } from '../state-machine';
import { appendIssueLogEntry } from './issue-log';

export class StateTransitionService {
  constructor(private readonly deps: {
    store: TaskStore;
    stateMachine: StateMachine;
    vaultRoot: string;
  }) {}

  async transitionAndLog(issueId: string, to: NormalizedStatus, logEntry: string): Promise<void> {
    const issue = await this.deps.store.findByIssueId(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);
    const next = this.deps.stateMachine.transition(issue, to);
    await this.deps.store.writeBack(next, next);

    const issuePath = await this.deps.store.resolveIssuePath(next.task_ref);
    const currentMarkdown = await fs.readFile(issuePath, 'utf-8');
    await fs.writeFile(issuePath, appendIssueLogEntry(currentMarkdown, logEntry), 'utf-8');

    await this.appendEvent({
      type: 'execution.transition',
      issueId,
      from: issue.workflow.normalized_status,
      to,
      timestamp: new Date().toISOString(),
    });
  }

  async appendEvent(event: Record<string, unknown>): Promise<void> {
    const eventsPath = path.join(this.deps.vaultRoot, 'events', 'execution.jsonl');
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf-8');
  }
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export * from './prompt-assembler';
export * from './state-transition-service';
```

- [ ] **Step 5: Run transition test to verify it passes**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/state-transition-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/state-transition-service.test.ts
git commit -m "feat(core): add execution state transition service"
```

### Task 6: Execution Harness Dry Run

**Files:**

- Create: `packages/core/src/executor/execution-harness.ts`
- Modify: `packages/core/src/executor/index.ts`
- Create: `packages/core/tests/executor/execution-harness-dry-run.test.ts`

- [ ] **Step 1: Write failing dry-run harness tests**

Create `packages/core/tests/executor/execution-harness-dry-run.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MarkdownStore, WorkspaceResolver } from '../../src';
import { ExecutionHarness, FakeExecutor, LockManager, PromptAssembler, RunArtifactWriter, WorktreeManager, CommandRunner } from '../../src/executor';
import { StateMachine } from '../../src/state-machine';
import { issueMarkdown, writeRegistry } from './fixtures';

async function createHarness(vaultRoot: string) {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      'vibe-coding': {
        type: 'container',
        issues: 'issues/vibe-coding',
        board: 'boards/vibe-coding.md',
        projects: { 'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' } },
      },
    },
  }, vaultRoot);
  const store = new MarkdownStore({ vaultRoot, resolver });
  return new ExecutionHarness({
    vaultRoot,
    store,
    stateMachine: new StateMachine(),
    lockManager: new LockManager(vaultRoot),
    worktreeManager: new WorktreeManager(new CommandRunner()),
    artifactWriter: new RunArtifactWriter(vaultRoot),
    promptAssembler: new PromptAssembler(),
    executor: new FakeExecutor('success'),
  });
}

describe('ExecutionHarness dry run', () => {
  it('prints a run plan without writing files or changing status', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-dry-run-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-911-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-911', 'READY'), 'utf-8');
    const harness = await createHarness(vaultRoot);

    const plan = await harness.dryRun('VC-911');

    expect(plan.issueId).toBe('VC-911');
    expect(plan.statusBefore).toBe('READY');
    expect(plan.executor).toBe('fake');
    expect(plan.runDirectory).toContain('runs/');
    expect(plan.promptPreview).toContain('# Execute VC-911');
    expect(await fs.readFile(issuePath, 'utf-8')).toContain('status: READY');
    await expect(fs.stat(path.join(vaultRoot, 'runs'))).rejects.toThrow();
  });

  it('rejects missing issues, Epics, and non-READY issues', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-dry-run-'));
    await writeRegistry(vaultRoot);
    await fs.writeFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-912-execute.md'), issueMarkdown('VC-912', 'TODO'), 'utf-8');
    await fs.writeFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-913-epic.md'), issueMarkdown('VC-913', 'READY', 'epic'), 'utf-8');
    const harness = await createHarness(vaultRoot);

    await expect(harness.dryRun('missing')).rejects.toThrow('Issue not found: missing');
    await expect(harness.dryRun('VC-912')).rejects.toThrow('Issue must be READY to run: VC-912');
    await expect(harness.dryRun('VC-913')).rejects.toThrow('Epics cannot run: VC-913');
  });
});
```

- [ ] **Step 2: Run dry-run tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-dry-run.test.ts
```

Expected: FAIL with missing `ExecutionHarness`.

- [ ] **Step 3: Implement dry-run path**

Create `packages/core/src/executor/execution-harness.ts` with constructor dependencies and `dryRun()`:

```ts
import fs from 'fs/promises';
import path from 'path';
import type { CanonicalTaskModel, TaskStore } from '../types';
import { StateMachine } from '../state-machine';
import type { IssueExecutor, PlannedRun } from './types';
import { LockManager } from './lock';
import { WorktreeManager } from './worktree';
import { RunArtifactWriter } from './run-artifacts';
import { PromptAssembler } from './prompt-assembler';

export interface ExecutionHarnessDependencies {
  vaultRoot: string;
  store: TaskStore;
  stateMachine: StateMachine;
  lockManager: LockManager;
  worktreeManager: WorktreeManager;
  artifactWriter: RunArtifactWriter;
  promptAssembler: PromptAssembler;
  executor: IssueExecutor;
}

export class ExecutionHarness {
  constructor(private readonly deps: ExecutionHarnessDependencies) {}

  async dryRun(issueId: string): Promise<PlannedRun> {
    const issue = await this.loadRunnableIssue(issueId);
    const paths = this.deps.artifactWriter.plan(issueId);
    const sourceMarkdown = await this.readIssueMarkdown(issue);
    const promptPreview = this.deps.promptAssembler.assemble(issue, sourceMarkdown);
    return {
      issueId,
      statusBefore: issue.workflow.normalized_status,
      executor: this.deps.executor.name,
      worktreePath: this.resolvePlannedWorktreePath(issue),
      runDirectory: paths.runDirectory,
      promptPreview,
    };
  }

  private async loadRunnableIssue(issueId: string): Promise<CanonicalTaskModel> {
    const issue = await this.deps.store.findByIssueId(issueId);
    if (!issue) throw new Error(`Issue not found: ${issueId}`);
    if (issue.classification.issue_type === 'Epic') throw new Error(`Epics cannot run: ${issueId}`);
    if (issue.workflow.normalized_status !== 'READY') throw new Error(`Issue must be READY to run: ${issueId}`);
    return issue;
  }

  private resolvePlannedWorktreePath(issue: CanonicalTaskModel): string | undefined {
    const targetRepo = issue.automation.workspace;
    if (!targetRepo) return undefined;
    return this.deps.worktreeManager.plan(targetRepo, issue.task_ref.external_id);
  }

  private async readIssueMarkdown(issue: CanonicalTaskModel): Promise<string> {
    const issuePath = await this.deps.store.resolveIssuePath(issue.task_ref);
    return fs.readFile(issuePath, 'utf-8');
  }
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export * from './execution-harness';
```

- [ ] **Step 4: Run dry-run tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-dry-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/execution-harness-dry-run.test.ts
git commit -m "feat(core): plan execution dry runs"
```

### Task 7: Execution Harness Fake Run Path

**Files:**

- Modify: `packages/core/src/executor/execution-harness.ts`
- Modify: `packages/core/src/executor/types.ts`
- Create: `packages/core/tests/executor/execution-harness-fake-run.test.ts`

- [ ] **Step 1: Write failing fake run tests**

Create `packages/core/tests/executor/execution-harness-fake-run.test.ts` with three E2E tests:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MarkdownStore, WorkspaceResolver } from '../../src';
import { CommandRunner, ExecutionHarness, FakeExecutor, LockManager, PromptAssembler, RunArtifactWriter, WorktreeManager } from '../../src/executor';
import { StateMachine } from '../../src/state-machine';
import { issueMarkdown, writeRegistry } from './fixtures';

async function buildHarness(vaultRoot: string, mode: 'success' | 'failure' | 'timeout') {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      'vibe-coding': {
        type: 'container',
        issues: 'issues/vibe-coding',
        board: 'boards/vibe-coding.md',
        projects: { 'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' } },
      },
    },
  }, vaultRoot);
  return new ExecutionHarness({
    vaultRoot,
    store: new MarkdownStore({ vaultRoot, resolver }),
    stateMachine: new StateMachine(),
    lockManager: new LockManager(vaultRoot),
    worktreeManager: new WorktreeManager(new CommandRunner()),
    artifactWriter: new RunArtifactWriter(vaultRoot),
    promptAssembler: new PromptAssembler(),
    executor: new FakeExecutor(mode),
  });
}

describe('ExecutionHarness fake run', () => {
  it('moves READY to REVIEW and writes artifacts for fake success', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-run-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-914-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-914', 'READY'), 'utf-8');

    const result = await (await buildHarness(vaultRoot, 'success')).run('VC-914');

    expect(result.statusAfter).toBe('REVIEW');
    expect(result.exitCode).toBe(0);
    const content = await fs.readFile(issuePath, 'utf-8');
    expect(content).toContain('status: REVIEW');
    expect(content).toContain('RUNNING: execution started by fake.');
    expect(content).toContain('REVIEW: execution completed successfully.');
    const metadata = JSON.parse(await fs.readFile(path.join(result.artifactsPath, 'metadata.json'), 'utf-8'));
    expect(metadata).toMatchObject({ issueId: 'VC-914', executor: 'fake', statusBefore: 'READY', statusAfter: 'REVIEW', exitCode: 0 });
    await expect(fs.stat(path.join(vaultRoot, 'runtime/locks/VC-914.lock'))).rejects.toThrow();
  });

  it('moves READY to FAILED and writes artifacts for fake failure', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-run-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-915-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-915', 'READY'), 'utf-8');

    const result = await (await buildHarness(vaultRoot, 'failure')).run('VC-915');

    expect(result.statusAfter).toBe('FAILED');
    expect(result.exitCode).toBe(1);
    const content = await fs.readFile(issuePath, 'utf-8');
    expect(content).toContain('status: FAILED');
    expect(content).toContain('FAILED: execution failed with exit code 1.');
    expect(await fs.readFile(path.join(result.artifactsPath, 'stderr.txt'), 'utf-8')).toContain('simulated failure');
  });

  it('moves READY to FAILED and releases lock for fake timeout', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-run-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-916-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-916', 'READY'), 'utf-8');

    const result = await (await buildHarness(vaultRoot, 'timeout')).run('VC-916');

    expect(result.statusAfter).toBe('FAILED');
    expect(result.exitCode).toBe(124);
    await expect(fs.stat(path.join(vaultRoot, 'runtime/locks/VC-916.lock'))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run fake run tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-fake-run.test.ts
```

Expected: FAIL with `harness.run is not a function`.

- [ ] **Step 3: Implement `run()` orchestration**

Add `run()` to `ExecutionHarness`:

```ts
async run(issueId: string): Promise<HarnessRunResult> {
  return this.deps.lockManager.withLock(issueId, async () => {
    const issue = await this.loadRunnableIssue(issueId);
    const paths = this.deps.artifactWriter.plan(issueId);
    const sourceMarkdown = await this.readIssueMarkdown(issue);
    const prompt = this.deps.promptAssembler.assemble(issue, sourceMarkdown);
    const startedLogAt = new Date().toISOString();

    await this.transitionAndLog(issueId, 'RUNNING', runningLogEntry(startedLogAt, this.deps.executor.name));
    const worktreePath = this.resolvePlannedWorktreePath(issue);

    const executorResult = await this.deps.executor.run({
      issue,
      promptPath: paths.promptPath,
      worktreePath,
    });

    const statusAfter = executorResult.exitCode === 0 ? 'REVIEW' : 'FAILED';
    await this.deps.artifactWriter.write({
      paths,
      prompt,
      stdout: executorResult.stdout,
      stderr: executorResult.stderr,
      metadata: {
        issueId,
        executor: this.deps.executor.name,
        statusBefore: 'READY',
        statusAfter,
        startedAt: executorResult.startedAt,
        completedAt: executorResult.completedAt,
        worktreePath,
        promptPath: paths.promptPath,
        stdoutPath: paths.stdoutPath,
        stderrPath: paths.stderrPath,
        exitCode: executorResult.exitCode,
      },
    });

    const relativeArtifactsPath = path.relative(this.deps.vaultRoot, paths.runDirectory);
    const finalLog = statusAfter === 'REVIEW'
      ? reviewLogEntry(executorResult.completedAt, relativeArtifactsPath)
      : failedLogEntry(executorResult.completedAt, executorResult.exitCode, relativeArtifactsPath);
    await this.transitionAndLog(issueId, statusAfter, finalLog);
    await this.appendEvent({
      type: 'execution.run.completed',
      issueId,
      executor: this.deps.executor.name,
      statusAfter,
      artifactsPath: relativeArtifactsPath,
      exitCode: executorResult.exitCode,
      timestamp: executorResult.completedAt,
    });

    return {
      issueId,
      executor: this.deps.executor.name,
      statusBefore: 'READY',
      statusAfter,
      artifactsPath: paths.runDirectory,
      exitCode: executorResult.exitCode,
    };
  });
}
```

Add private helpers in the same file:

```ts
private async transitionAndLog(issueId: string, to: 'RUNNING' | 'REVIEW' | 'FAILED', logEntry: string): Promise<void> {
  const issue = await this.deps.store.findByIssueId(issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);
  const next = this.deps.stateMachine.transition(issue, to);
  await this.deps.store.writeBack(next, next);
  const issuePath = await this.deps.store.resolveIssuePath(next.task_ref);
  const currentMarkdown = await fs.readFile(issuePath, 'utf-8');
  await fs.writeFile(issuePath, appendIssueLogEntry(currentMarkdown, logEntry), 'utf-8');
}

private async appendEvent(event: Record<string, unknown>): Promise<void> {
  const eventsPath = path.join(this.deps.vaultRoot, 'events', 'execution.jsonl');
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf-8');
}
```

Update imports in `execution-harness.ts`:

```ts
import { appendIssueLogEntry, failedLogEntry, reviewLogEntry, runningLogEntry } from './issue-log';
import type { HarnessRunResult, IssueExecutor, PlannedRun } from './types';
```

- [ ] **Step 4: Run fake run tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-fake-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/execution-harness-fake-run.test.ts
git commit -m "feat(core): run issues with fake executor"
```

### Task 8: Approval, Abort, and Retry Core Flows

**Files:**

- Modify: `packages/core/src/executor/types.ts`
- Modify: `packages/core/src/executor/issue-log.ts`
- Modify: `packages/core/src/executor/execution-harness.ts`
- Create: `packages/core/tests/executor/execution-harness-approval.test.ts`

- [ ] **Step 1: Write failing approval flow tests**

Create `packages/core/tests/executor/execution-harness-approval.test.ts` with tests that set up issues in `REVIEW` and `FAILED`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownStore, WorkspaceResolver } from '../../src';
import { CommandRunner, ExecutionHarness, FakeExecutor, LockManager, PromptAssembler, RunArtifactWriter, WorktreeManager } from '../../src/executor';
import { StateMachine } from '../../src/state-machine';
import { issueMarkdown, writeRegistry } from './fixtures';

async function harness(vaultRoot: string, runner = new CommandRunner()) {
  const resolver = WorkspaceResolver.fromRegistry({
    spaces: {
      'vibe-coding': {
        type: 'container',
        issues: 'issues/vibe-coding',
        board: 'boards/vibe-coding.md',
        projects: { 'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' } },
      },
    },
  }, vaultRoot);
  return new ExecutionHarness({
    vaultRoot,
    store: new MarkdownStore({ vaultRoot, resolver }),
    stateMachine: new StateMachine(),
    lockManager: new LockManager(vaultRoot),
    worktreeManager: new WorktreeManager(runner),
    artifactWriter: new RunArtifactWriter(vaultRoot),
    promptAssembler: new PromptAssembler(),
    executor: new FakeExecutor('success'),
  });
}

describe('ExecutionHarness approval flows', () => {
  it('approves REVIEW to DONE and writes completed timestamp', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-approve-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-917-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-917', 'REVIEW'), 'utf-8');

    const result = await (await harness(vaultRoot)).approve('VC-917');

    expect(result.statusAfter).toBe('DONE');
    const content = await fs.readFile(issuePath, 'utf-8');
    expect(content).toContain('status: DONE');
    expect(content).toContain('completed:');
    expect(content).toContain('DONE: execution approved.');
  });

  it('aborts REVIEW or FAILED back to READY without deleting artifacts', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-abort-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-918-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-918', 'FAILED'), 'utf-8');
    await fs.mkdir(path.join(vaultRoot, 'runs/2026-04-24/VC-918'), { recursive: true });

    const result = await (await harness(vaultRoot)).abort('VC-918');

    expect(result.statusAfter).toBe('READY');
    expect(await fs.readFile(issuePath, 'utf-8')).toContain('READY: execution aborted.');
    await expect(fs.stat(path.join(vaultRoot, 'runs/2026-04-24/VC-918'))).resolves.toBeTruthy();
  });

  it('requires cleanup flag before retry deletes existing worktree state', async () => {
    const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-retry-'));
    await writeRegistry(vaultRoot);
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-919-execute.md');
    await fs.writeFile(issuePath, issueMarkdown('VC-919', 'FAILED'), 'utf-8');
    const runner = { run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })) } as unknown as CommandRunner;

    await expect((await harness(vaultRoot, runner)).retry('VC-919', { cleanupWorktree: false, worktreePath: '/repo/.worktrees/kanban/VC-919', targetRepo: '/repo' }))
      .rejects.toThrow('Retry cleanup requires --cleanup-worktree');

    const result = await (await harness(vaultRoot, runner)).retry('VC-919', { cleanupWorktree: true, worktreePath: '/repo/.worktrees/kanban/VC-919', targetRepo: '/repo' });
    expect(result.statusAfter).toBe('READY');
    expect(runner.run).toHaveBeenCalledWith(['worktree', 'remove', '/repo/.worktrees/kanban/VC-919', '--force'], { cwd: '/repo' });
  });
});
```

- [ ] **Step 2: Run approval tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-approval.test.ts
```

Expected: FAIL with missing `approve`, `abort`, and `retry` methods.

- [ ] **Step 3: Implement approval log helpers and result type**

Add to `packages/core/src/executor/types.ts`:

```ts
export interface HarnessActionResult {
  issueId: string;
  statusBefore: NormalizedStatus;
  statusAfter: NormalizedStatus;
}
```

Add to `packages/core/src/executor/issue-log.ts`:

```ts
export function approvedLogEntry(timestamp: string): string {
  return `- ${timestamp} DONE: execution approved.`;
}

export function abortedLogEntry(timestamp: string): string {
  return `- ${timestamp} READY: execution aborted.`;
}

export function retryLogEntry(timestamp: string): string {
  return `- ${timestamp} READY: execution retry requested.`;
}
```

- [ ] **Step 4: Implement `approve`, `abort`, and `retry`**

Add methods to `ExecutionHarness`:

```ts
async approve(issueId: string, options: { worktreeBranch?: string; targetRepo?: string; cleanupWorktree?: boolean; worktreePath?: string } = {}): Promise<HarnessActionResult> {
  const issue = await this.loadIssueForAction(issueId, ['REVIEW']);
  if (options.worktreeBranch && options.targetRepo) {
    await this.deps.worktreeManager.mergeFastForward({ targetRepo: options.targetRepo, branch: options.worktreeBranch });
  }
  await this.transitionAndLog(issueId, 'DONE', approvedLogEntry(new Date().toISOString()));
  if (options.cleanupWorktree && options.worktreePath && options.targetRepo) {
    await this.deps.worktreeManager.cleanup(options.worktreePath, options.targetRepo);
  }
  await this.appendEvent({ type: 'execution.approved', issueId, timestamp: new Date().toISOString() });
  return { issueId, statusBefore: issue.workflow.normalized_status, statusAfter: 'DONE' };
}

async abort(issueId: string): Promise<HarnessActionResult> {
  const issue = await this.loadIssueForAction(issueId, ['REVIEW', 'FAILED']);
  await this.transitionAndLog(issueId, 'READY', abortedLogEntry(new Date().toISOString()));
  await this.appendEvent({ type: 'execution.aborted', issueId, timestamp: new Date().toISOString() });
  return { issueId, statusBefore: issue.workflow.normalized_status, statusAfter: 'READY' };
}

async retry(issueId: string, options: { cleanupWorktree?: boolean; worktreePath?: string; targetRepo?: string } = {}): Promise<HarnessActionResult> {
  const issue = await this.loadIssueForAction(issueId, ['REVIEW', 'FAILED']);
  if (options.worktreePath || options.targetRepo) {
    if (!options.cleanupWorktree || !options.worktreePath || !options.targetRepo) {
      throw new Error('Retry cleanup requires --cleanup-worktree');
    }
    await this.deps.worktreeManager.cleanup(options.worktreePath, options.targetRepo);
  }
  await this.transitionAndLog(issueId, 'READY', retryLogEntry(new Date().toISOString()));
  await this.appendEvent({ type: 'execution.retry_requested', issueId, timestamp: new Date().toISOString() });
  return { issueId, statusBefore: issue.workflow.normalized_status, statusAfter: 'READY' };
}

private async loadIssueForAction(issueId: string, allowed: Array<'REVIEW' | 'FAILED'>): Promise<CanonicalTaskModel> {
  const issue = await this.deps.store.findByIssueId(issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);
  if (!allowed.includes(issue.workflow.normalized_status as 'REVIEW' | 'FAILED')) {
    throw new Error(`Issue ${issueId} must be one of ${allowed.join(', ')}`);
  }
  return issue;
}
```

Update imports for `approvedLogEntry`, `abortedLogEntry`, `retryLogEntry`, and `HarnessActionResult`.

- [ ] **Step 5: Run approval tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/execution-harness-approval.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/execution-harness-approval.test.ts
git commit -m "feat(core): add execution approval flows"
```

### Task 9: CLI Run, Approve, Abort, Retry, and JSON Output

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/context.ts`
- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/commands/approve.ts`
- Create: `packages/cli/src/commands/abort.ts`
- Create: `packages/cli/src/commands/retry.ts`
- Create: `packages/cli/tests/commands/run.test.ts`
- Create: `packages/cli/tests/commands/approval.test.ts`

- [ ] **Step 1: Confirm CLI MVP package exists**

Run:

```bash
test -f packages/cli/src/context.ts && test -f packages/cli/src/index.ts && test -f packages/cli/package.json
```

Expected: exit code 0. If this fails, stop and complete the CLI MVP implementation first.

- [ ] **Step 2: Write failing CLI run tests**

Create `packages/cli/tests/commands/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../test-utils';

describe('kanban run', () => {
  it('prints dry-run JSON without writing artifacts', async () => {
    const result = await runCli(['run', 'VC-920', '--dry-run', '--executor', 'fake', '--json']);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toMatchObject({ ok: true, command: 'run', issueId: 'VC-920', dryRun: true, executor: 'fake' });
    expect(json.plan.promptPreview).toContain('VC-920');
  });

  it('runs fake executor success and reports REVIEW as JSON', async () => {
    const result = await runCli(['run', 'VC-921', '--executor', 'fake', '--fake-mode', 'success', '--json']);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toMatchObject({ ok: true, command: 'run', issueId: 'VC-921', statusAfter: 'REVIEW', exitCode: 0 });
    expect(json.artifactsPath).toContain('runs/');
  });

  it('runs fake executor failure and reports FAILED as JSON with nonzero command exit', async () => {
    const result = await runCli(['run', 'VC-922', '--executor', 'fake', '--fake-mode', 'failure', '--json']);
    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json).toMatchObject({ ok: false, command: 'run', issueId: 'VC-922', statusAfter: 'FAILED', exitCode: 1 });
  });
});
```

If the CLI MVP used a different test helper name than `runCli`, adjust only the helper import and invocation to the existing CLI test pattern.

- [ ] **Step 3: Write failing CLI approval tests**

Create `packages/cli/tests/commands/approval.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../test-utils';

describe('kanban approval commands', () => {
  it('approves a reviewed issue with JSON output', async () => {
    const result = await runCli(['approve', 'VC-923', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: 'approve', issueId: 'VC-923', statusAfter: 'DONE' });
  });

  it('aborts reviewed or failed work back to READY', async () => {
    const result = await runCli(['abort', 'VC-924', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: 'abort', issueId: 'VC-924', statusAfter: 'READY' });
  });

  it('passes explicit cleanup flag to retry', async () => {
    const result = await runCli(['retry', 'VC-925', '--cleanup-worktree', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: 'retry', issueId: 'VC-925', statusAfter: 'READY' });
  });
});
```

- [ ] **Step 4: Run CLI tests to verify they fail**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- run.test.ts approval.test.ts
```

Expected: FAIL because commands are not registered.

- [ ] **Step 5: Add harness construction to CLI context**

Modify `packages/cli/src/context.ts` to expose a helper with this shape, adapting imports to the CLI MVP context type:

```ts
import {
  CommandRunner,
  ExecutionHarness,
  FakeExecutor,
  LockManager,
  PromptAssembler,
  RunArtifactWriter,
  WorktreeManager,
} from '@kanban-task-engine/core';

export function createExecutionHarness(context: CliContext, options: {
  executor: 'fake';
  fakeMode?: 'success' | 'failure' | 'timeout';
}): ExecutionHarness {
  const commandRunner = new CommandRunner();
  const executor = new FakeExecutor(options.fakeMode ?? 'success');
  return new ExecutionHarness({
    vaultRoot: context.vaultRoot,
    store: context.store,
    stateMachine: context.stateMachine,
    lockManager: new LockManager(context.vaultRoot),
    worktreeManager: new WorktreeManager(commandRunner),
    artifactWriter: new RunArtifactWriter(context.vaultRoot),
    promptAssembler: new PromptAssembler(),
    executor,
  });
}
```

If the CLI MVP context does not expose `stateMachine`, add it as `stateMachine: new StateMachine()` in the same context builder that already creates `store`.

- [ ] **Step 6: Implement CLI command modules**

Create `packages/cli/src/commands/run.ts`:

```ts
import type { CAC } from 'cac';
import { buildCliContext, createExecutionHarness, writeJsonResult } from '../context';

export function registerRunCommand(cli: CAC): void {
  cli.command('run <issueId>', 'Run one READY issue')
    .option('--dry-run', 'Print the run plan without writing')
    .option('--executor <executor>', 'Executor to use: fake', { default: 'fake' })
    .option('--fake-mode <mode>', 'Fake executor mode: success, failure, timeout', { default: 'success' })
    .option('--json', 'Print JSON output')
    .action(async (issueId: string, options: any) => {
      const context = await buildCliContext(options);
      const harness = createExecutionHarness(context, {
        executor: 'fake',
        fakeMode: options.fakeMode,
      });
      if (options.dryRun) {
        const plan = await harness.dryRun(issueId);
        const payload = { ok: true, command: 'run', issueId, dryRun: true, executor: plan.executor, plan };
        return writeJsonResult(context, payload, 0, options.json);
      }
      const result = await harness.run(issueId);
      const ok = result.statusAfter === 'REVIEW';
      return writeJsonResult(context, { ok, command: 'run', ...result }, ok ? 0 : 1, options.json);
    });
}
```

Create `approve.ts`, `abort.ts`, and `retry.ts` with the same pattern:

```ts
export function registerApproveCommand(cli: CAC): void {
  cli.command('approve <issueId>', 'Approve reviewed execution')
    .option('--json', 'Print JSON output')
    .action(async (issueId: string, options: any) => {
      const context = await buildCliContext(options);
      const result = await createExecutionHarness(context, { executor: 'fake' }).approve(issueId);
      return writeJsonResult(context, { ok: true, command: 'approve', ...result }, 0, options.json);
    });
}
```

```ts
export function registerAbortCommand(cli: CAC): void {
  cli.command('abort <issueId>', 'Abort reviewed or failed execution')
    .option('--json', 'Print JSON output')
    .action(async (issueId: string, options: any) => {
      const context = await buildCliContext(options);
      const result = await createExecutionHarness(context, { executor: 'fake' }).abort(issueId);
      return writeJsonResult(context, { ok: true, command: 'abort', ...result }, 0, options.json);
    });
}
```

```ts
export function registerRetryCommand(cli: CAC): void {
  cli.command('retry <issueId>', 'Return reviewed or failed execution to READY')
    .option('--cleanup-worktree', 'Delete existing worktree state before retry')
    .option('--json', 'Print JSON output')
    .action(async (issueId: string, options: any) => {
      const context = await buildCliContext(options);
      const result = await createExecutionHarness(context, { executor: 'fake' }).retry(issueId, {
        cleanupWorktree: Boolean(options.cleanupWorktree),
      });
      return writeJsonResult(context, { ok: true, command: 'retry', ...result }, 0, options.json);
    });
}
```

Modify `packages/cli/src/index.ts` to import and register all four commands after the CLI MVP commands.

- [ ] **Step 7: Run CLI tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- run.test.ts approval.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src packages/cli/tests/commands
git commit -m "feat(cli): add execution harness commands"
```

### Task 10: Claude Code Executor Wrapper

**Files:**

- Create: `packages/core/src/executor/claude-code-executor.ts`
- Modify: `packages/core/src/executor/index.ts`
- Modify: `packages/cli/src/context.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Create: `packages/core/tests/executor/claude-code-executor.test.ts`

- [ ] **Step 1: Write failing Claude executor wrapper tests**

Create `packages/core/tests/executor/claude-code-executor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ClaudeCodeExecutor } from '../../src/executor/claude-code-executor';
import type { CommandRunner } from '../../src/executor/command-runner';

describe('ClaudeCodeExecutor', () => {
  it('invokes claude non-interactively with prompt file and worktree cwd', async () => {
    const runner = {
      run: vi.fn(async () => ({ exitCode: 0, stdout: 'done', stderr: '' })),
    } as unknown as CommandRunner;
    const executor = new ClaudeCodeExecutor(runner);
    const result = await executor.run({
      issue: {
        task_ref: { provider: 'local', external_key: 'vibe-coding/kanban-task-engine', external_id: 'VC-926' },
        summary: 'Claude run',
        workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
        classification: { issue_type: 'Task', priority: 'High', labels: [], component: [] },
        ownership: { assignee: '', reporter: '' },
        planning: {},
        automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
        sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' },
      },
      promptPath: '/vault/runs/2026-04-24/VC-926/prompt.md',
      worktreePath: '/repo/.worktrees/kanban/VC-926',
      timeoutMs: 1000,
    });

    expect(runner.run).toHaveBeenCalledWith(
      ['--print', '--dangerously-skip-permissions', '--file', '/vault/runs/2026-04-24/VC-926/prompt.md'],
      { command: 'claude', cwd: '/repo/.worktrees/kanban/VC-926', timeoutMs: 1000 }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('done');
  });
});
```

- [ ] **Step 2: Run Claude executor test to verify it fails**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/claude-code-executor.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement Claude executor**

Create `packages/core/src/executor/claude-code-executor.ts`:

```ts
import { CommandRunner } from './command-runner';
import type { ExecutorRunRequest, ExecutorRunResult, IssueExecutor } from './types';

export class ClaudeCodeExecutor implements IssueExecutor {
  readonly name = 'claude-code';

  constructor(private readonly runner: CommandRunner) {}

  async run(request: ExecutorRunRequest): Promise<ExecutorRunResult> {
    const startedAt = new Date().toISOString();
    const result = await this.runner.run(
      ['--print', '--dangerously-skip-permissions', '--file', request.promptPath],
      {
        command: 'claude',
        cwd: request.worktreePath,
        timeoutMs: request.timeoutMs,
      }
    );
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
```

Append to `packages/core/src/executor/index.ts`:

```ts
export { ClaudeCodeExecutor } from './claude-code-executor';
```

- [ ] **Step 4: Run Claude executor test to verify it passes**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/claude-code-executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Expose Claude executor selection in CLI context**

Modify `packages/cli/src/context.ts` to import `ClaudeCodeExecutor` and widen `createExecutionHarness()`:

```ts
import { ClaudeCodeExecutor } from '@kanban-task-engine/core';

export function createExecutionHarness(context: CliContext, options: {
  executor: 'fake' | 'claude';
  fakeMode?: 'success' | 'failure' | 'timeout';
}): ExecutionHarness {
  const commandRunner = new CommandRunner();
  const executor = options.executor === 'fake'
    ? new FakeExecutor(options.fakeMode ?? 'success')
    : new ClaudeCodeExecutor(commandRunner);
  return new ExecutionHarness({
    vaultRoot: context.vaultRoot,
    store: context.store,
    stateMachine: context.stateMachine,
    lockManager: new LockManager(context.vaultRoot),
    worktreeManager: new WorktreeManager(commandRunner),
    artifactWriter: new RunArtifactWriter(context.vaultRoot),
    promptAssembler: new PromptAssembler(),
    executor,
  });
}
```

Modify `packages/cli/src/commands/run.ts` so the option help and harness call allow Claude:

```ts
.option('--executor <executor>', 'Executor to use: fake or claude', { default: 'claude' })
```

```ts
const harness = createExecutionHarness(context, {
  executor: options.executor,
  fakeMode: options.fakeMode,
});
```

- [ ] **Step 6: Run Claude executor and CLI run tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor/claude-code-executor.test.ts
pnpm --filter @kanban-task-engine/cli test -- run.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/executor packages/core/tests/executor/claude-code-executor.test.ts packages/cli/src/context.ts packages/cli/src/commands/run.ts
git commit -m "feat(core): add claude code executor wrapper"
```

### Task 11: Full Workspace Verification and Help Surface

**Files:**

- Modify only files named by failing diagnostics from previous tasks.
- Test: root workspace.

- [ ] **Step 1: Run focused core executor tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- executor
```

Expected: PASS.

- [ ] **Step 2: Run focused CLI tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test
```

Expected: PASS, including CLI MVP tests and new execution command tests.

- [ ] **Step 3: Verify CLI help lists MVP plus execution commands**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec kanban --help
```

Expected: output includes `doctor`, `validate`, `render-board`, `run`, `approve`, `abort`, and `retry`.

- [ ] **Step 4: Run full workspace tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Run full workspace build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit verification fixes if any were required**

If Steps 1-5 required code changes, commit only those changes:

```bash
git add <files named by diagnostics>
git commit -m "fix: align execution harness workspace verification"
```

If no changes were required, do not create an empty commit.

## Self-Review Checklist

- [ ] `kanban run <issue-id> --dry-run` maps to Task 6 and Task 9. It resolves context, issue, status, Epic rejection, planned worktree path, planned artifact path, prompt preview, and writes nothing.
- [ ] `kanban run <issue-id>` with fake success maps to Task 7. It acquires a lock, writes artifacts, appends `RUNNING` and `REVIEW` logs, writes an event, releases the lock, and moves `READY -> REVIEW`.
- [ ] Fake failure maps to Task 7. It writes stdout/stderr/metadata, appends a `FAILED` log, releases the lock, and moves `READY -> FAILED`.
- [ ] Fake timeout maps to Task 7. It returns exit code `124`, moves `READY -> FAILED`, writes artifacts, and releases the lock.
- [ ] Lock release in a `finally` path maps to Task 3 and is exercised again by Task 7 timeout coverage.
- [ ] Artifact writing maps to Task 2 and Task 7. Required files are `prompt.md`, `stdout.txt`, `stderr.txt`, and `metadata.json` under `runs/<YYYY-MM-DD>/<issue-id>/`.
- [ ] Issue log appending maps to Task 2, Task 5, Task 7, and Task 8. Missing `## 로그` is created.
- [ ] State transitions map to Task 5, Task 7, and Task 8. `READY -> RUNNING -> REVIEW`, `READY -> RUNNING -> FAILED`, `REVIEW -> DONE`, `REVIEW -> READY`, and `FAILED -> READY` are covered.
- [ ] Worktree manager maps to Task 4. Default path is `<target-repo>/.worktrees/kanban/<issue-id>`, existing worktrees fail, and approve can perform `git merge --ff-only`.
- [ ] Claude executor wrapper maps to Task 10 and is intentionally implemented after fake executor and fake run E2E coverage.
- [ ] `kanban approve`, `kanban abort`, and `kanban retry` map to Task 8 and Task 9, including retry cleanup flag behavior.
- [ ] JSON output maps to Task 9 for run, dry-run, approve, abort, and retry.
- [ ] Full workspace verification maps to Task 11 with `pnpm test` and `pnpm build`.
- [ ] Dependency boundaries are respected: contract hardening, vault-store identity/path work, and CLI MVP command infrastructure are prerequisites, not duplicated implementation tasks.
