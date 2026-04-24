# Kanban Adapter Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub, Jira, Firebase, OpenClaw, and execution adapters preserve shared core contracts and `TaskRef` identity semantics without real network integration scope.

**Architecture:** Core remains the owner of shared adapter contracts, including `ExecutionAdapter`, `WorkStateProvider`, and `TaskRef`. Provider packages translate `TaskRef.external_key` and `TaskRef.external_id` internally, while shared conformance helpers lock adapter behavior through mocked contract tests. OpenClaw keeps its gateway behavior but exposes a core-compatible execution wrapper and uses `external_id` as the task id in prompts and metadata.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, mocked `fetch`, mocked provider transports, existing `@kanban-task-engine/core` adapter interfaces.

---

## File Structure

**Create:**

- `packages/core/tests/contracts/execution-adapter-contract.ts` - reusable Vitest helper that verifies a core `ExecutionAdapter` exposes `name`, receives `(task, transition)`, reports session status, and cancels sessions.
- `packages/core/tests/contracts/task-ref-contract.ts` - reusable fixtures and expectations for `TaskRef` identity semantics across GitHub, Jira, Firebase, and OpenClaw metadata.
- `packages/adapter-openclaw/tests/openclaw-execution-adapter.test.ts` - OpenClaw core execution wrapper tests using the shared execution contract helper and mocked gateway responses.

**Modify:**

- `packages/core/src/types.ts` - change `WorkStateProvider.fetchTask()` and `pushStatus()` to accept `TaskRef`; keep the shared `ExecutionAdapter` contract as the only exported core execution interface.
- `packages/core/src/index.ts` - export any shared contract types already exposed through `types.ts`; no new runtime implementation exports are needed for test helpers.
- `packages/core/src/sync-coordinator.ts` - call provider `pushStatus(task.task_ref, status)` and rely on vault-store work for local `TaskStore.findByTaskRef()` lookup once that plan lands.
- `packages/core/tests/sync-coordinator.test.ts` - update mocked `WorkStateProvider` expectations from namespace strings to full `TaskRef` objects.
- `packages/adapter-openclaw/src/openclaw-adapter.ts` - remove the local conflicting `ExecutionAdapter` interface, rename the gateway client contract to `OpenClawGatewayAdapter`, add `OpenClawExecutionAdapter` implementing core `ExecutionAdapter`, and fix metadata/prompt id semantics.
- `packages/adapter-openclaw/src/index.ts` - export `OpenClawGatewayAdapter`, `OpenClawExecutionAdapter`, and `OpenClawAdapter` compatibility aliases without exporting a conflicting `ExecutionAdapter`.
- `packages/adapter-openclaw/src/rate-limit-queue.ts` - store queued task ids from `task.task_ref.external_id`, not `external_key`.
- `packages/adapter-openclaw/tests/openclaw-adapter.test.ts` - update gateway-client tests for `ticketId`, `namespace`, `workspace`, and prompt heading semantics.
- `packages/adapter-openclaw/tests/rate-limit-queue.test.ts` - update queue identity assertions to use `external_id`.
- `packages/adapter-github/src/github-adapter.ts` - migrate `fetchTask(ref: TaskRef)` and `pushStatus(ref: TaskRef, status)`; validate repo namespace and issue id before mocked GraphQL calls.
- `packages/adapter-github/tests/github-mapper.test.ts` - assert `external_key = owner/repo` and `external_id = #number`.
- `packages/adapter-github/tests/status-mapping.test.ts` - keep status mapping tests unchanged unless TypeScript import fallout requires a type-only import update.
- `packages/adapter-github/tests/github-adapter.test.ts` - add mocked GraphQL tests for `TaskRef` method arguments and invalid namespace/id rejection.
- `packages/adapter-jira/src/jira-mapper.ts` - add `jiraIssueToCanonical()` if provider-to-canonical mapping does not exist when this task starts.
- `packages/adapter-jira/tests/jira-mapper.test.ts` - assert Jira project key maps to `external_key` and issue key maps to `external_id`.
- `packages/adapter-firebase/src/firebase-adapter.ts` - keep publish behavior using `event.task_ref.external_id`; add a guard that rejects events whose `external_key` does not match configured workspace/collection when publishing.
- `packages/adapter-firebase/src/firebase-mapper.ts` - preserve `external_key = workspace/collection` and `external_id = doc.id`.
- `packages/adapter-firebase/tests/firebase-mapper.test.ts` - assert Firebase identity semantics explicitly.
- `packages/adapter-firebase/tests/firebase-adapter.test.ts` - add mocked Firestore publish tests for document id and workspace/collection namespace.

**Do Not Modify:**

- Real network integration behavior beyond mocked unit/contract tests.
- GitHub Project V2 field discovery.
- Firebase realtime listener resilience.
- Jira bidirectional sync.
- CLI command behavior.
- Files outside this task's listed scope.

## Preconditions

- Work from `~/.config/superpowers/worktrees/kanban-task-engine/docs-gpt55-review-specs` or another isolated worktree on the implementation branch.
- Run `git status --short` before each task. If another agent changed unrelated docs or code, do not revert it.
- Keep network behavior mocked. GitHub tests mock `@octokit/graphql`, Jira tests use injected `JiraTransport`, Firebase tests mock `firebase-admin`, and OpenClaw tests mock `global.fetch`.
- This plan depends on the identity decisions in `docs/superpowers/specs/2026-04-24-kanban-vault-store-spec.md` and should be executed after, or alongside, the vault-store plan where `TaskStore.findByTaskRef()` exists.
- Commit after each task. If a task cannot compile because the vault-store plan has not landed, stop after the failing command and record that dependency rather than adding compatibility shims.

## Task 1: Baseline and Shared Contract Helpers

**Files:**

- Create: `packages/core/tests/contracts/execution-adapter-contract.ts`
- Create: `packages/core/tests/contracts/task-ref-contract.ts`
- Test: `pnpm --filter @kanban-task-engine/core test -- contracts`

- [ ] **Step 1: Run baseline verification before edits**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands pass before adapter hardening starts. If either fails, capture the failing package and test name in the implementation notes before editing.

- [ ] **Step 2: Create shared execution adapter contract helper**

Create `packages/core/tests/contracts/execution-adapter-contract.ts`:

```ts
import { expect } from 'vitest';
import type {
  CanonicalTaskModel,
  ExecutionAdapter,
  ExecutionStatus,
  StateTransition,
} from '../../src/types';

export interface ExecutionAdapterContractOptions {
  createAdapter(): ExecutionAdapter;
  task: CanonicalTaskModel;
  transition: StateTransition;
  expectedSessionStatus: ExecutionStatus;
}

export async function expectExecutionAdapterContract(
  options: ExecutionAdapterContractOptions
): Promise<void> {
  const adapter = options.createAdapter();

  expect(adapter.name).toBeTruthy();

  const result = await adapter.execute(options.task, options.transition);
  expect(result.startedAt).toBeTruthy();
  expect(typeof result.success).toBe('boolean');

  const sessionId = result.sessionId ?? 'known-session';
  await expect(adapter.getSessionStatus(sessionId)).resolves.toBe(options.expectedSessionStatus);
  await expect(adapter.cancel(sessionId)).resolves.toBeUndefined();
}
```

- [ ] **Step 3: Create shared TaskRef contract helper**

Create `packages/core/tests/contracts/task-ref-contract.ts`:

```ts
import { expect } from 'vitest';
import type { CanonicalTaskModel, TaskRef } from '../../src/types';

export const taskRefFixtures = {
  github: { provider: 'github', external_key: 'owner/repo', external_id: '#123' },
  jira: { provider: 'jira', external_key: 'PROJ', external_id: 'PROJ-42' },
  firebase: { provider: 'firebase', external_key: 'workspace/tasks', external_id: 'doc-123' },
  openclaw: { provider: 'local', external_key: 'openclaw', external_id: 'OC-001' },
} as const satisfies Record<string, TaskRef>;

export function expectTaskRef(ref: TaskRef, expected: TaskRef): void {
  expect(ref.provider).toBe(expected.provider);
  expect(ref.external_key).toBe(expected.external_key);
  expect(ref.external_id).toBe(expected.external_id);
}

export function createContractTask(ref: TaskRef): CanonicalTaskModel {
  return {
    task_ref: ref,
    summary: 'Contract task',
    workflow: {
      normalized_status: 'READY',
      raw_status: 'READY',
      raw_status_category: 'READY',
    },
    classification: {
      issue_type: 'Task',
      priority: 'High',
      labels: [],
      component: [],
    },
    ownership: { assignee: '', reporter: '' },
    planning: {},
    automation: {
      policy_id: 'default',
      on_enter: [],
      on_exit: [],
      execution_profile: 'standard',
    },
    sync: {
      last_synced_at: '2026-04-24T00:00:00.000Z',
      last_source: ref.provider === 'github' || ref.provider === 'firebase' ? ref.provider : 'local',
    },
  };
}
```

- [ ] **Step 4: Run helper typecheck**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- contracts
pnpm --filter @kanban-task-engine/core build
```

Expected: test command exits without matching tests or passes helper compilation through Vitest; build passes.

- [ ] **Step 5: Commit shared helpers**

Run:

```bash
git add packages/core/tests/contracts/execution-adapter-contract.ts packages/core/tests/contracts/task-ref-contract.ts
git commit -m "test(core): add adapter contract helpers"
```

Expected: commit includes only the two helper files.

## Task 2: WorkStateProvider Uses TaskRef

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/sync-coordinator.ts`
- Modify: `packages/core/tests/sync-coordinator.test.ts`
- Test: `pnpm --filter @kanban-task-engine/core test -- sync-coordinator.test.ts`

- [ ] **Step 1: Write failing sync test for `pushStatus(ref, status)`**

Edit `packages/core/tests/sync-coordinator.test.ts`. Add or update the provider mock so `pushStatus` expects a full `TaskRef`:

```ts
const pushStatus = vi.fn().mockResolvedValue(undefined);
const provider = {
  fetchTasks: vi.fn().mockResolvedValue([]),
  fetchTask: vi.fn(),
  pushStatus,
  resolveRef: vi.fn(),
};

await coordinator.pushToProvider('github', task);

expect(pushStatus).toHaveBeenCalledWith(task.task_ref, task.workflow.normalized_status);
expect(pushStatus).not.toHaveBeenCalledWith(task.task_ref.external_key, task.workflow.normalized_status);
```

- [ ] **Step 2: Run sync test to verify current namespace-only behavior fails**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- sync-coordinator.test.ts
```

Expected: FAIL because `pushToProvider()` still passes `task.task_ref.external_key`.

- [ ] **Step 3: Change `WorkStateProvider` signature**

Edit `packages/core/src/types.ts`:

```ts
export interface WorkStateProvider {
  fetchTasks(since?: string): Promise<CanonicalTaskModel[]>;
  fetchTask(ref: TaskRef): Promise<CanonicalTaskModel | null>;
  pushStatus(ref: TaskRef, status: NormalizedStatus): Promise<void>;
  resolveRef(taskRef: TaskRef): Promise<string>;
}
```

- [ ] **Step 4: Pass `TaskRef` through `SyncCoordinator`**

Edit `packages/core/src/sync-coordinator.ts`:

```ts
await provider.pushStatus(task.task_ref, task.workflow.normalized_status);
```

If vault-store work has already replaced local lookup, ensure `syncFromProvider()` uses:

```ts
const localTask = await this.taskStore.findByTaskRef(remoteTask.task_ref);
```

If `TaskStore.findByTaskRef()` does not exist yet, stop this task after the `pushStatus()` migration and note the vault-store dependency; do not reintroduce `findByExternalKey()` compatibility into `TaskStore`.

- [ ] **Step 5: Run focused core tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- sync-coordinator.test.ts
pnpm --filter @kanban-task-engine/core build
```

Expected: sync tests pass. Build may fail in adapters that still implement the old `WorkStateProvider`; those adapter failures are fixed in Tasks 5 and 7.

- [ ] **Step 6: Commit core provider signature migration**

Run:

```bash
git add packages/core/src/types.ts packages/core/src/sync-coordinator.ts packages/core/tests/sync-coordinator.test.ts
git commit -m "feat(core): pass task refs to work state providers"
```

Expected: commit includes only core provider contract files.

## Task 3: OpenClaw Metadata and Core Execution Wrapper

**Files:**

- Modify: `packages/adapter-openclaw/src/openclaw-adapter.ts`
- Modify: `packages/adapter-openclaw/src/index.ts`
- Modify: `packages/adapter-openclaw/tests/openclaw-adapter.test.ts`
- Create: `packages/adapter-openclaw/tests/openclaw-execution-adapter.test.ts`
- Test: `pnpm --filter @kanban-task-engine/adapter-openclaw test -- openclaw-adapter.test.ts openclaw-execution-adapter.test.ts`

- [ ] **Step 1: Write failing metadata test**

Edit `packages/adapter-openclaw/tests/openclaw-adapter.test.ts`. Set the task ref to namespace/id values that differ:

```ts
const mockTask = createMockTask({
  task_ref: { provider: 'local', external_key: 'openclaw', external_id: 'OC-001' },
  automation: {
    policy_id: 'default',
    on_enter: [],
    on_exit: [],
    execution_profile: 'standard',
    workspace: 'operator-workspace',
  },
});
```

Add this expectation after `await adapter.execute(mockTask)`:

```ts
const [, init] = mockFetch.mock.calls[0];
const body = JSON.parse(init.body as string);

expect(body.metadata).toEqual({
  ticketId: 'OC-001',
  namespace: 'openclaw',
  workspace: 'operator-workspace',
});
expect(body.messages[0].content).toContain('Execute task OC-001: Test task');
expect(body.messages[0].content).not.toContain('Execute task openclaw:');
```

- [ ] **Step 2: Write failing execution wrapper contract test**

Create `packages/adapter-openclaw/tests/openclaw-execution-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { expectExecutionAdapterContract as expectCoreExecutionContract } from '../../core/tests/contracts/execution-adapter-contract';
import { createContractTask, taskRefFixtures } from '../../core/tests/contracts/task-ref-contract';
import { OpenClawExecutionAdapter } from '../src/openclaw-adapter';
import type { GatewayCompletionResponse } from '../src/types';

describe('OpenClawExecutionAdapter', () => {
  it('implements the core execution adapter contract with mocked gateway client', async () => {
    const task = createContractTask(taskRefFixtures.openclaw);
    const gatewayResponse: GatewayCompletionResponse = { id: 'completion-1', status: 'queued' };
    const gateway = {
      name: 'openclaw-gateway',
      execute: vi.fn().mockResolvedValue(gatewayResponse),
      getCompletionStatus: vi.fn().mockResolvedValue('running'),
      cancelCompletion: vi.fn().mockResolvedValue(undefined),
    };

    await expectCoreExecutionContract({
      createAdapter: () => new OpenClawExecutionAdapter(gateway),
      task,
      transition: { from: 'READY', to: 'RUNNING' },
      expectedSessionStatus: 'running',
    });

    expect(gateway.execute).toHaveBeenCalledWith(task);
  });
});
```

- [ ] **Step 3: Run OpenClaw tests to verify failures**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-openclaw test -- openclaw-adapter.test.ts openclaw-execution-adapter.test.ts
```

Expected: FAIL because metadata still uses `external_key`, the prompt uses `external_key`, and `OpenClawExecutionAdapter` does not exist.

- [ ] **Step 4: Remove conflicting local `ExecutionAdapter` and add named gateway contract**

Edit `packages/adapter-openclaw/src/openclaw-adapter.ts`. Replace the local interface and class declaration with:

```ts
import type {
  CanonicalTaskModel,
  ExecutionAdapter,
  ExecutionResult,
  ExecutionStatus,
  StateTransition,
} from '@kanban-task-engine/core';
import type { GatewayCredentials, GatewayCompletionResponse } from './types';

export interface OpenClawGatewayAdapter {
  name: string;
  execute(task: CanonicalTaskModel): Promise<GatewayCompletionResponse>;
}

export class OpenClawAdapter implements OpenClawGatewayAdapter {
  readonly name = 'openclaw';
```

Do not export a symbol named `ExecutionAdapter` from the OpenClaw adapter package.

- [ ] **Step 5: Fix OpenClaw request metadata and prompt heading**

In `sendRequest()`, replace metadata with:

```ts
metadata: {
  ticketId: task.task_ref.external_id,
  namespace: task.task_ref.external_key,
  workspace: task.automation.workspace ?? task.task_ref.external_key,
}
```

In `buildPrompt()`, return:

```ts
return `Execute task ${task.task_ref.external_id}: ${task.summary}\n\n${task.description_ref ?? ''}`;
```

- [ ] **Step 6: Add `OpenClawExecutionAdapter` wrapper**

Append this class to `packages/adapter-openclaw/src/openclaw-adapter.ts`:

```ts
export interface OpenClawGatewaySessionClient extends OpenClawGatewayAdapter {
  getCompletionStatus?(sessionId: string): Promise<ExecutionStatus>;
  cancelCompletion?(sessionId: string): Promise<void>;
}

export class OpenClawExecutionAdapter implements ExecutionAdapter {
  readonly name = 'openclaw';

  constructor(private gateway: OpenClawGatewaySessionClient) {}

  async execute(task: CanonicalTaskModel, _transition: StateTransition): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const response = await this.gateway.execute(task);

    return {
      success: true,
      sessionId: response.id,
      startedAt,
    };
  }

  async getSessionStatus(sessionId: string): Promise<ExecutionStatus> {
    return this.gateway.getCompletionStatus?.(sessionId) ?? 'pending';
  }

  async cancel(sessionId: string): Promise<void> {
    await this.gateway.cancelCompletion?.(sessionId);
  }
}
```

- [ ] **Step 7: Export non-conflicting OpenClaw symbols**

Edit `packages/adapter-openclaw/src/index.ts`:

```ts
export {
  OpenClawAdapter,
  OpenClawExecutionAdapter,
  type OpenClawAdapterOptions,
  type OpenClawGatewayAdapter,
  type OpenClawGatewaySessionClient,
} from './openclaw-adapter';
export * from './types';
export * from './config-adapter';
export * from './rate-limit-queue';
```

- [ ] **Step 8: Run OpenClaw tests**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-openclaw test -- openclaw-adapter.test.ts openclaw-execution-adapter.test.ts
pnpm --filter @kanban-task-engine/adapter-openclaw build
```

Expected: tests and build pass.

- [ ] **Step 9: Commit OpenClaw execution hardening**

Run:

```bash
git add packages/adapter-openclaw/src/openclaw-adapter.ts packages/adapter-openclaw/src/index.ts packages/adapter-openclaw/tests/openclaw-adapter.test.ts packages/adapter-openclaw/tests/openclaw-execution-adapter.test.ts
git commit -m "feat(adapter-openclaw): align execution contract and metadata"
```

Expected: commit includes only OpenClaw adapter wrapper and tests.

## Task 4: OpenClaw Queue Identity Uses External ID

**Files:**

- Modify: `packages/adapter-openclaw/src/rate-limit-queue.ts`
- Modify: `packages/adapter-openclaw/tests/rate-limit-queue.test.ts`
- Test: `pnpm --filter @kanban-task-engine/adapter-openclaw test -- rate-limit-queue.test.ts`

- [ ] **Step 1: Write failing queue identity assertions**

Edit `packages/adapter-openclaw/tests/rate-limit-queue.test.ts` so test tasks have different namespace and id values:

```ts
task_ref: { provider: 'local', external_key: 'openclaw', external_id: 'TEST-001' }
```

Update queue assertions to read `task_ref.external_id`:

```ts
expect(first?.task_ref.external_id).toBe('TEST-002');
expect(second?.task_ref.external_id).toBe('TEST-003');
expect(third?.task_ref.external_id).toBe('TEST-001');
```

Add a `setPriority()` assertion that uses issue id:

```ts
queue.setPriority('TEST-002', 90);
expect(queue.peek()?.task_ref.external_id).toBe('TEST-002');
```

- [ ] **Step 2: Run queue tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-openclaw test -- rate-limit-queue.test.ts
```

Expected: FAIL because queue entries still store `task.task_ref.external_key`.

- [ ] **Step 3: Store queued task id from `external_id`**

Edit `packages/adapter-openclaw/src/rate-limit-queue.ts`:

```ts
this.queue.push({
  taskId: task.task_ref.external_id,
  task,
  priority,
  enqueuedAt: Date.now(),
  attempts: 0
});
```

- [ ] **Step 4: Run queue tests and OpenClaw package build**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-openclaw test -- rate-limit-queue.test.ts
pnpm --filter @kanban-task-engine/adapter-openclaw build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit queue identity fix**

Run:

```bash
git add packages/adapter-openclaw/src/rate-limit-queue.ts packages/adapter-openclaw/tests/rate-limit-queue.test.ts
git commit -m "fix(adapter-openclaw): queue tasks by external id"
```

Expected: commit includes only queue files.

## Task 5: GitHub WorkStateProvider and TaskRef Semantics

**Files:**

- Modify: `packages/adapter-github/src/github-adapter.ts`
- Modify: `packages/adapter-github/tests/github-mapper.test.ts`
- Create: `packages/adapter-github/tests/github-adapter.test.ts`
- Test: `pnpm --filter @kanban-task-engine/adapter-github test`

- [ ] **Step 1: Add mapper contract assertion**

Edit `packages/adapter-github/tests/github-mapper.test.ts` in the first test:

```ts
expect(result.task_ref).toEqual({
  provider: 'github',
  external_key: 'owner/repo',
  external_id: '#42',
});
```

- [ ] **Step 2: Add mocked adapter tests for TaskRef arguments**

Create `packages/adapter-github/tests/github-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GitHubAdapter } from '../src/github-adapter';
import type { TaskRef } from '@kanban-task-engine/core';

const graphqlMock = vi.fn();

vi.mock('@octokit/graphql', () => ({
  graphql: {
    defaults: () => graphqlMock,
  },
}));

describe('GitHubAdapter TaskRef contract', () => {
  const ref: TaskRef = { provider: 'github', external_key: 'owner/repo', external_id: '#42' };

  it('fetches a task using external_id as issue number and config repo as namespace', async () => {
    graphqlMock.mockResolvedValueOnce({
      repository: {
        issue: {
          number: 42,
          title: 'Task',
          body: 'Body',
          state: 'OPEN',
          labels: { nodes: [] },
          assignee: null,
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
          closedAt: null,
        },
      },
    });

    const adapter = new GitHubAdapter({
      token: 'token',
      owner: 'owner',
      repo: 'repo',
      projectId: 'project',
      statusFieldId: 'status',
    });

    const result = await adapter.fetchTask(ref);

    expect(graphqlMock).toHaveBeenCalledWith(expect.stringContaining('issue(number: $number)'), {
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    expect(result?.task_ref).toEqual(ref);
  });

  it('rejects refs for a different repository namespace', async () => {
    const adapter = new GitHubAdapter({
      token: 'token',
      owner: 'owner',
      repo: 'repo',
      projectId: 'project',
      statusFieldId: 'status',
    });

    await expect(adapter.fetchTask({
      provider: 'github',
      external_key: 'other/repo',
      external_id: '#42',
    })).rejects.toThrow('GitHub ref namespace mismatch: other/repo');
  });

  it('pushes status using external_id as issue number', async () => {
    graphqlMock
      .mockResolvedValueOnce({ repository: { issue: { id: 'node-42' } } })
      .mockResolvedValueOnce({ updateProjectV2ItemFieldValue: { projectV2Item: { id: 'item-1' } } });

    const adapter = new GitHubAdapter({
      token: 'token',
      owner: 'owner',
      repo: 'repo',
      projectId: 'project',
      statusFieldId: 'status',
    });

    await adapter.pushStatus(ref, 'RUNNING');

    expect(graphqlMock.mock.calls[0][1]).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
  });
});
```

- [ ] **Step 3: Run GitHub tests to verify failures**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-github test
```

Expected: FAIL because `fetchTask()` and `pushStatus()` still accept strings.

- [ ] **Step 4: Migrate GitHub adapter methods to `TaskRef`**

Edit `packages/adapter-github/src/github-adapter.ts`. Add helpers:

```ts
private repoFullName(): string {
  return `${this.config.owner}/${this.config.repo}`;
}

private parseIssueRef(ref: TaskRef): number {
  const repoFullName = this.repoFullName();
  if (ref.provider !== 'github') {
    throw new Error(`Invalid GitHub provider: ${ref.provider}`);
  }
  if (ref.external_key !== repoFullName) {
    throw new Error(`GitHub ref namespace mismatch: ${ref.external_key}`);
  }

  const issueNumber = parseInt(ref.external_id.replace('#', ''), 10);
  if (Number.isNaN(issueNumber)) {
    throw new Error(`Invalid GitHub issue id: ${ref.external_id}`);
  }

  return issueNumber;
}
```

Change method signatures and issue-number parsing:

```ts
async fetchTask(ref: TaskRef): Promise<CanonicalTaskModel | null> {
  const issueNumber = this.parseIssueRef(ref);
  const repoFullName = this.repoFullName();
  // existing query body
}

async pushStatus(ref: TaskRef, status: NormalizedStatus): Promise<void> {
  const issueNumber = this.parseIssueRef(ref);
  const githubStatus = normalizedToGithubStatus(status);
  // existing mutation body
}
```

Replace other local `const repoFullName = ...` constructions with `this.repoFullName()` where practical.

- [ ] **Step 5: Run GitHub tests and build**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-github test
pnpm --filter @kanban-task-engine/adapter-github build
```

Expected: tests and build pass with mocked GraphQL only.

- [ ] **Step 6: Commit GitHub adapter hardening**

Run:

```bash
git add packages/adapter-github/src/github-adapter.ts packages/adapter-github/tests/github-mapper.test.ts packages/adapter-github/tests/github-adapter.test.ts
git commit -m "feat(adapter-github): use task refs for provider state"
```

Expected: commit includes only GitHub adapter files and tests.

## Task 6: Jira Mapper Identity Semantics

**Files:**

- Modify: `packages/adapter-jira/src/jira-mapper.ts`
- Modify: `packages/adapter-jira/tests/jira-mapper.test.ts`
- Test: `pnpm --filter @kanban-task-engine/adapter-jira test`

- [ ] **Step 1: Write failing Jira provider-to-canonical mapper test**

Edit `packages/adapter-jira/tests/jira-mapper.test.ts`:

```ts
import { canonicalToJiraPayload, jiraIssueToCanonical } from '../src/jira-mapper';
```

Add:

```ts
it('maps Jira project key to external_key and issue key to external_id', () => {
  const result = jiraIssueToCanonical({
    key: 'AUTH-42',
    fields: {
      project: { key: 'AUTH' },
      summary: 'Token refresh',
      description: 'Improve token refresh',
      issuetype: { name: 'Task' },
      priority: { name: 'High' },
      labels: ['auth'],
      assignee: { displayName: 'Dev' },
      reporter: { displayName: 'Reporter' },
      status: { name: 'In Progress' },
      created: '2026-04-24T00:00:00.000Z',
      updated: '2026-04-24T01:00:00.000Z',
    },
  });

  expect(result.task_ref).toEqual({
    provider: 'jira',
    external_key: 'AUTH',
    external_id: 'AUTH-42',
  });
  expect(result.workflow.normalized_status).toBe('RUNNING');
  expect(result.classification.priority).toBe('High');
});
```

- [ ] **Step 2: Run Jira mapper tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-jira test -- jira-mapper.test.ts
```

Expected: FAIL because `jiraIssueToCanonical()` does not exist.

- [ ] **Step 3: Add Jira provider-to-canonical mapper**

Edit `packages/adapter-jira/src/jira-mapper.ts`:

```ts
import { CanonicalTaskModel, NormalizedStatus, RawStatusCategory } from '@kanban-task-engine/core';

export interface JiraIssueData {
  key: string;
  fields: {
    project: { key: string };
    summary: string;
    description?: string;
    issuetype?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    assignee?: { displayName?: string } | null;
    reporter?: { displayName?: string } | null;
    status?: { name?: string };
    created?: string;
    updated?: string;
  };
}

export function jiraIssueToCanonical(issue: JiraIssueData): CanonicalTaskModel {
  const normalized = jiraStatusToNormalized(issue.fields.status?.name ?? 'To Do');

  return {
    task_ref: {
      provider: 'jira',
      external_key: issue.fields.project.key,
      external_id: issue.key,
    },
    summary: issue.fields.summary,
    description_ref: issue.fields.description ?? '',
    workflow: {
      normalized_status: normalized,
      raw_status: issue.fields.status?.name ?? 'To Do',
      raw_status_category: statusCategory(normalized),
    },
    classification: {
      issue_type: mapJiraIssueType(issue.fields.issuetype?.name),
      priority: mapJiraPriority(issue.fields.priority?.name),
      labels: issue.fields.labels ?? [],
      component: [],
    },
    ownership: {
      assignee: issue.fields.assignee?.displayName ?? '',
      reporter: issue.fields.reporter?.displayName ?? '',
    },
    planning: {},
    automation: {
      policy_id: 'default',
      on_enter: ['RUNNING'],
      on_exit: [],
      execution_profile: 'standard',
    },
    sync: {
      last_synced_at: issue.fields.updated ?? new Date().toISOString(),
      last_source: 'local',
    },
    created: issue.fields.created,
    updated: issue.fields.updated,
  };
}

function jiraStatusToNormalized(status: string): NormalizedStatus {
  const key = status.toLowerCase();
  if (key.includes('progress')) return 'RUNNING';
  if (key.includes('review')) return 'REVIEW';
  if (key.includes('done') || key.includes('closed')) return 'DONE';
  if (key.includes('blocked') || key.includes('failed')) return 'FAILED';
  if (key.includes('ready')) return 'READY';
  return 'TODO';
}

function statusCategory(status: NormalizedStatus): RawStatusCategory {
  const map: Record<NormalizedStatus, RawStatusCategory> = {
    TODO: 'TODO',
    READY: 'READY',
    RUNNING: 'IN_PROGRESS',
    REVIEW: 'IN_REVIEW',
    DONE: 'DONE',
    FAILED: 'FAILED',
  };
  return map[status];
}

function mapJiraIssueType(input?: string): CanonicalTaskModel['classification']['issue_type'] {
  if (input === 'Epic') return 'Epic';
  if (input === 'Story') return 'Story';
  if (input === 'Bug') return 'Bug';
  if (input === 'Sub-task') return 'Sub-task';
  return 'Task';
}

function mapJiraPriority(input?: string): CanonicalTaskModel['classification']['priority'] {
  const allowed = ['Blocker', 'Critical', 'High', 'Medium', 'Low', 'Trivial'] as const;
  return allowed.includes(input as typeof allowed[number])
    ? input as CanonicalTaskModel['classification']['priority']
    : 'Medium';
}
```

If `sync.last_source` has been widened to include `'jira'` by the contract-hardening plan, use `last_source: 'jira'`. If it has not been widened, keep `last_source: 'local'` to avoid unrelated schema work in this adapter plan.

- [ ] **Step 4: Run Jira tests and build**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-jira test
pnpm --filter @kanban-task-engine/adapter-jira build
```

Expected: tests and build pass with injected/mocked transports only.

- [ ] **Step 5: Commit Jira mapper identity semantics**

Run:

```bash
git add packages/adapter-jira/src/jira-mapper.ts packages/adapter-jira/tests/jira-mapper.test.ts
git commit -m "feat(adapter-jira): map jira task refs explicitly"
```

Expected: commit includes only Jira mapper files and tests.

## Task 7: Firebase Mapper and Publish Namespace Semantics

**Files:**

- Modify: `packages/adapter-firebase/src/firebase-adapter.ts`
- Modify: `packages/adapter-firebase/tests/firebase-mapper.test.ts`
- Create: `packages/adapter-firebase/tests/firebase-adapter.test.ts`
- Test: `pnpm --filter @kanban-task-engine/adapter-firebase test`

- [ ] **Step 1: Add Firebase mapper identity assertion**

Edit `packages/adapter-firebase/tests/firebase-mapper.test.ts` in the first mapper test:

```ts
expect(result.task_ref).toEqual({
  provider: 'firebase',
  external_key: 'workspace-vibe-coding/tasks',
  external_id: 'VC-001',
});
```

Change the call in that test to:

```ts
const result = firestoreDocToCanonical(doc, 'workspace-vibe-coding/tasks');
```

- [ ] **Step 2: Add mocked Firebase publish test**

Create `packages/adapter-firebase/tests/firebase-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FirebaseAdapter } from '../src/firebase-adapter';
import type { SyncEvent } from '@kanban-task-engine/core';

const setMock = vi.fn();
const docMock = vi.fn(() => ({ set: setMock }));
const collectionMock = vi.fn(() => ({ doc: docMock, limit: vi.fn() }));

vi.mock('firebase-admin', () => ({
  default: {
    apps: [],
    initializeApp: vi.fn(() => ({})),
    app: vi.fn(() => ({})),
    credential: {
      applicationDefault: vi.fn(),
      cert: vi.fn(),
    },
    firestore: vi.fn(() => ({
      collection: collectionMock,
    })),
  },
}));

describe('FirebaseAdapter TaskRef contract', () => {
  it('publishes status to the document named by external_id', async () => {
    const adapter = new FirebaseAdapter({
      projectId: 'project',
      collectionPath: 'tasks',
      workspace: 'workspace-vibe-coding/tasks',
    });
    const event: SyncEvent = {
      event_id: 'event-1',
      provider: 'firebase',
      task_ref: {
        provider: 'firebase',
        external_key: 'workspace-vibe-coding/tasks',
        external_id: 'doc-123',
      },
      prev_status: 'READY',
      new_status: 'RUNNING',
      timestamp: '2026-04-24T00:00:00.000Z',
    };

    await adapter.publish(event);

    expect(collectionMock).toHaveBeenCalledWith('tasks');
    expect(docMock).toHaveBeenCalledWith('doc-123');
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'doc-123',
      status: 'RUNNING',
    }), { merge: true });
  });

  it('rejects events for a different Firebase namespace', async () => {
    const adapter = new FirebaseAdapter({
      projectId: 'project',
      collectionPath: 'tasks',
      workspace: 'workspace-vibe-coding/tasks',
    });

    await expect(adapter.publish({
      event_id: 'event-2',
      provider: 'firebase',
      task_ref: {
        provider: 'firebase',
        external_key: 'other/tasks',
        external_id: 'doc-123',
      },
      prev_status: 'READY',
      new_status: 'RUNNING',
      timestamp: '2026-04-24T00:00:00.000Z',
    })).rejects.toThrow('Firebase ref namespace mismatch: other/tasks');
  });
});
```

- [ ] **Step 3: Run Firebase tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-firebase test
```

Expected: FAIL because publish does not validate `external_key` against configured workspace/collection.

- [ ] **Step 4: Add Firebase namespace guard**

Edit `packages/adapter-firebase/src/firebase-adapter.ts` in `publish()`:

```ts
if (event.task_ref.provider !== 'firebase') {
  throw new Error(`Invalid Firebase provider: ${event.task_ref.provider}`);
}
if (event.task_ref.external_key !== this.config.workspace) {
  throw new Error(`Firebase ref namespace mismatch: ${event.task_ref.external_key}`);
}

const db = admin.firestore(this.app);
const docRef = db.collection(this.config.collectionPath).doc(event.task_ref.external_id);
```

- [ ] **Step 5: Run Firebase tests and build**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-firebase test
pnpm --filter @kanban-task-engine/adapter-firebase build
```

Expected: tests and build pass with mocked Firebase Admin SDK only.

- [ ] **Step 6: Commit Firebase identity semantics**

Run:

```bash
git add packages/adapter-firebase/src/firebase-adapter.ts packages/adapter-firebase/tests/firebase-mapper.test.ts packages/adapter-firebase/tests/firebase-adapter.test.ts
git commit -m "feat(adapter-firebase): enforce task ref namespace"
```

Expected: commit includes only Firebase adapter files and tests.

## Task 8: Cross-Adapter Contract Scans and Full Verification

**Files:**

- Modify: files already changed by Tasks 1-7 when verification diagnostics point back to those changes.
- Test: `pnpm test`
- Test: `pnpm build`

- [ ] **Step 1: Scan for conflicting adapter `ExecutionAdapter` exports**

Run:

```bash
rg -n "export interface ExecutionAdapter|interface ExecutionAdapter|implements ExecutionAdapter" packages
```

Expected:

```text
packages/core/src/types.ts:...:export interface ExecutionAdapter
packages/adapter-cli/src/cli-adapter.ts:...:export class CliAdapter implements ExecutionAdapter
packages/adapter-openclaw/src/openclaw-adapter.ts:...:export class OpenClawExecutionAdapter implements ExecutionAdapter
```

No adapter package should define or export its own `ExecutionAdapter` interface.

- [ ] **Step 2: Scan for namespace-only provider calls**

Run:

```bash
rg -n "fetchTask\\([^:]*string|pushStatus\\([^:]*string|pushStatus\\([^,]*external_key|fetchTask\\([^,]*external_key" packages
```

Expected: no matches in production adapter/core files. Matches in historical comments or this plan are acceptable only outside `packages/**/src`.

- [ ] **Step 3: Scan OpenClaw metadata semantics**

Run:

```bash
rg -n "ticketId: task\\.task_ref\\.external_key|Execute task \\$\\{task\\.task_ref\\.external_key\\}" packages/adapter-openclaw/src
```

Expected: no matches.

- [ ] **Step 4: Run full workspace tests**

Run:

```bash
pnpm test
```

Expected: all workspace tests pass. Any failure must be fixed only in the package that owns the failing test or the direct type fallout from Tasks 2-7.

- [ ] **Step 5: Run full workspace build**

Run:

```bash
pnpm build
```

Expected: all workspace packages build. If adapter packages fail due to `WorkStateProvider` signature changes, update only the named package method signatures to accept `TaskRef` and preserve provider-specific id translation internally.

- [ ] **Step 6: Commit verification fallout if any**

If Step 4 or Step 5 required changes, run:

```bash
git add <only-files-fixed-for-verification>
git commit -m "fix: resolve adapter contract build fallout"
```

Expected: commit includes only files needed for full workspace verification.

If no changes were needed, do not create an empty commit.

## Self-Review Checklist

- [ ] Acceptance criterion: No adapter exports a conflicting `ExecutionAdapter` interface. Covered by Task 3 removing the OpenClaw local interface and Task 8 scan.
- [ ] Acceptance criterion: `adapter-openclaw` has a core-compatible execution wrapper or is clearly lower-level. Covered by Task 3 adding `OpenClawExecutionAdapter` and renaming the lower-level contract to `OpenClawGatewayAdapter`.
- [ ] Acceptance criterion: OpenClaw metadata uses `external_id` as `ticketId`, `external_key` as namespace, and `automation.workspace ?? external_key` as workspace. Covered by Task 3 metadata and prompt tests.
- [ ] Acceptance criterion: `WorkStateProvider` no longer accepts namespace-only strings for `fetchTask()` and `pushStatus()`. Covered by Task 2 core signature migration, Task 5 GitHub implementation, and Task 8 namespace-only scan.
- [ ] Acceptance criterion: GitHub maps `owner/repo` to `external_key` and `#number` to `external_id`. Covered by Task 5 mapper and adapter tests.
- [ ] Acceptance criterion: Jira maps project key to `external_key` and issue key to `external_id`. Covered by Task 6 mapper test and `jiraIssueToCanonical()`.
- [ ] Acceptance criterion: Firebase maps workspace/collection to `external_key` and document id to `external_id`. Covered by Task 7 mapper and publish tests.
- [ ] Acceptance criterion: OpenClaw queue and prompt behavior do not treat namespace as issue id. Covered by Tasks 3 and 4.
- [ ] Acceptance criterion: Network behavior remains mocked/contract-tested. Covered by Preconditions plus Tasks 3, 5, 6, and 7 using mocked `fetch`, mocked GraphQL, injected Jira transport, and mocked Firebase Admin SDK.
- [ ] Acceptance criterion: Full workspace verification passes. Covered by Task 8 running `pnpm test` and `pnpm build`.
