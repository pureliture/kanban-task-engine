# Kanban System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 2026-05-02 system hardening spec so `kanban-task-engine` has enforceable schema, vault, runtime policy, execution, adapter, CLI, docs, and CI contracts.

**Architecture:** The implementation moves source-of-truth behavior into core services and keeps CLI as a facade. Safety gates are layered: schema validation, registry-aware vault path resolution, runtime policy, adapter guards, and execution preflight all fail closed before mutating issue state.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, GitHub Actions, `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:requesting-code-review`, `code-simplifier`.

---

## 0. Plugin And Skill Routing

| Phase | Plugin/skill | Required use |
| --- | --- | --- |
| External docs check | `context7` | Start here when a package/API question appears. For this repo, Vitest targeted runs already checked: use `vitest run <file>` for one-shot TDD cycles. |
| Review input reception | `superpowers:receiving-code-review` | Treat GPT-5.5-pro findings as review suggestions to verify against local code before implementing. |
| Architecture decisions | `architecture`, `system-design` | Keep Work/Home policy, adapter boundaries, and vault/target path separation explicit. |
| Test design | `testing-strategy`, `superpowers:test-driven-development` | Add failing tests first for every behavior change, verify RED, then implement. |
| Documentation | `documentation` | Update README/runtime/archive docs and add a checker so docs do not drift. |
| Tech debt | `tech-debt` | Apply P1 override for security/data-loss/policy bypass even when numeric score is lower. |
| Skill hygiene | `skill-creator`, `superpowers:writing-skills` | Only create a reusable skill after implementation if repeated process failure is broader than this repo. Project-specific rules stay in docs/plans. |
| Implementation orchestration | `superpowers:subagent-driven-development` | Dispatch one worker per task or subtask, then run spec review and code-quality review before moving on. |
| Refactoring | `code-simplifier` | After tests are green, reduce duplicated CLI/core parsing and policy plumbing without changing behavior. |
| Final review | `superpowers:requesting-code-review` | Run multi-agent review before merge. |
| Completion gate | `superpowers:verification-before-completion` | No completion claim before fresh green verification output. |

## 1. Source Documents

- Spec: `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`
- Existing control-plane design: `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- Existing AgentRunner design: `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`
- Current runtime guide: `docs/kanban-runtime.md`

## 2. File Structure

### Create

- `.github/workflows/ci.yml`
- `docs/archive/README.md`
- `scripts/check-hardening.ts`
- `packages/cli/tests/sync-board-next.test.ts`
- `packages/adapter-firebase/tests/firebase-policy.test.ts`
- `packages/core/src/store/vault-path.ts`
- `packages/core/src/store/vault-service.ts`
- `packages/core/src/runtime/adapter-policy.ts`
- `recipes/work-jira-export.yaml`
- `recipes/examples/home-full-auto.yaml`

### Modify

- `package.json`
- `README.md`
- `docs/kanban-runtime.md`
- `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`
- `scripts/eval-superpowers.ts`
- `packages/schema/src/issue-schema.ts`
- `packages/schema/src/status.ts`
- `packages/schema/src/fixtures.ts`
- `packages/schema/tests/issue-schema.test.ts`
- `packages/schema/tests/status.test.ts`
- `packages/core/src/types.ts`
- `packages/core/src/state-machine.ts`
- `packages/core/src/store/registry.ts`
- `packages/core/src/store/path-validator.ts`
- `packages/core/src/store/markdown-store.ts`
- `packages/core/src/store/mapper.ts`
- `packages/core/src/boards/board-generator.ts`
- `packages/core/src/recipes/recipe-loader.ts`
- `packages/core/src/runtime/policy.ts`
- `packages/core/src/executor/execution-target.ts`
- `packages/core/src/executor/git.ts`
- `packages/core/src/executor/prompt-assembler.ts`
- `packages/core/src/executor/run-artifacts.ts`
- `packages/core/src/executor/worktree.ts`
- `packages/core/tests/*`
- `packages/cli/src/context.ts`
- `packages/cli/src/vault.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/commands/next.ts`
- `packages/cli/src/commands/sync.ts`
- `packages/cli/src/commands/board.ts`
- `packages/cli/src/commands/approve.ts`
- `packages/cli/src/commands/abort.ts`
- `packages/cli/src/commands/retry.ts`
- `packages/cli/src/commands/recover-run.ts`
- `packages/adapter-firebase/src/firebase-adapter.ts`
- `packages/adapter-firebase/src/firebase-listener.ts`
- `packages/adapter-openclaw/src/rate-limit-queue.ts`
- `packages/adapter-openclaw/src/openclaw-adapter.ts`
- `packages/adapter-jira/src/jira-adapter.ts`
- `packages/adapter-cli/src/session-manager.ts`

---

## Task 0: Baseline Executability And Scaffold

**Uses:** `superpowers:verification-before-completion`, `superpowers:test-driven-development`

**Files:**
- Create: `packages/core/src/store/vault-path.ts`
- Create: `packages/core/src/runtime/adapter-policy.ts`
- Modify: `packages/core/tests/board-generator.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Record baseline source gaps**

Run:

```bash
rg --files packages/core/src | rg '^packages/core/src/boards/board-generator.ts$'
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts
```

Expected:

- first command finds `packages/core/src/boards/board-generator.ts`,
- second command passes.

- [ ] **Step 2: Add compile scaffolding for new modules**

Create minimal exports before behavioral RED tests so later failures are about behavior, not module resolution:

```ts
// packages/core/src/store/vault-path.ts
export async function resolveVaultPath(_vaultRoot: string, ..._segments: string[]): Promise<string> {
  throw new Error('resolveVaultPath not implemented');
}
```

```ts
// packages/core/src/runtime/adapter-policy.ts
import type { RuntimePolicy } from './policy';

export function assertAdapterAllowed(_policy: RuntimePolicy, adapterId: string, action: string): void {
  throw new Error(`Adapter policy not implemented: ${adapterId} ${action}`);
}
```

- [ ] **Step 3: Run scaffold RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts tests/path-validator.test.ts tests/policy-engine.test.ts
```

Expected:

- tests compile,
- `path-validator.test.ts` and `policy-engine.test.ts` expose missing behavior or stub failures,
- `board-generator.test.ts` remains green and becomes a guard while CLI board generation moves to core services.

- [ ] **Step 4: Run baseline GREEN for board generator**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts
```

Expected: pass.

---

## Task 1: Schema, Status, And READY Contract

**Uses:** `superpowers:test-driven-development`, `testing-strategy`, `architecture`

**Files:**
- Modify: `packages/schema/tests/issue-schema.test.ts`
- Modify: `packages/schema/tests/status.test.ts`
- Modify: `packages/schema/src/issue-schema.ts`
- Modify: `packages/schema/src/status.ts`
- Modify: `packages/schema/src/fixtures.ts`
- Modify: `packages/core/tests/state-machine.test.ts`
- Modify: `packages/core/src/state-machine.ts`

- [ ] **Step 1: Add failing schema tests**

Add these tests to `packages/schema/tests/issue-schema.test.ts`:

```ts
it('rejects task issues missing 로그 section', () => {
  const markdown = VALID_ISSUE_MARKDOWN.replace(/\n## 로그\n[\s\S]*$/m, '\n');
  const result = parseIssueMarkdown(markdown);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors).toContain('Missing required section: 로그');
});

it.each(['READY', 'RUNNING', 'REVIEW', 'FAILED'])('rejects epic status %s', status => {
  const markdown = VALID_EPIC_MARKDOWN.replace('status: TODO', `status: ${status}`);
  const result = parseIssueMarkdown(markdown);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid epic status');
});

it('rejects epic executor other than human', () => {
  const markdown = VALID_EPIC_MARKDOWN.replace('executor: human', 'executor: codex');
  const result = parseIssueMarkdown(markdown);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join('\n')).toContain('Epic executor must be human');
});

it('rejects unsafe issue ids before path usage', () => {
  const unsafeIds = ['../VC-001', 'VC/001', 'VC\\001', '.', '..', '', '   ', '-VC-001', `VC-\0-001`];
  for (const unsafeId of unsafeIds) {
    const result = validateIssueFrontmatter({
      id: unsafeId,
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      project: 'kanban-task-engine',
      created: '2026-05-02',
      updated: '2026-05-02',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid issue id');
  }
});

it('rejects registry idPrefix mismatch in registry-aware validation', () => {
  const result = validateIssueFrontmatterForRegistry({
    id: 'OC-001',
    title: 'x',
    type: 'task',
    status: 'TODO',
    executor: 'human',
    project: 'kanban-task-engine',
    created: '2026-05-02',
    updated: '2026-05-02',
  }, { idPrefix: 'VC', spaceType: 'container' });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid issue id');
});

it('accepts namespaced Jira sync metadata but rejects flat Jira fields', () => {
  expect(validateIssueFrontmatter({
    id: 'VC-100',
    title: 'x',
    type: 'task',
    status: 'TODO',
    executor: 'human',
    project: 'kanban-task-engine',
    created: '2026-05-02',
    updated: '2026-05-02',
    sync: { jira: { key: 'AUTH-1', status: 'To Do', exportedAt: '2026-05-02T00:00:00.000Z' } },
  }).ok).toBe(true);
  expect(validateIssueFrontmatter({
    id: 'VC-100',
    title: 'x',
    type: 'task',
    status: 'TODO',
    executor: 'human',
    project: 'kanban-task-engine',
    created: '2026-05-02',
    updated: '2026-05-02',
    jiraKey: 'AUTH-1',
  }).ok).toBe(false);
});

it('preserves automation trigger, allowedActions, and extra metadata in canonical mapping', () => {
  const markdown = VALID_ISSUE_MARKDOWN.replace('run_count: 0', `run_count: 0
automation:
  trigger: manual
  allowedActions:
    - transition
    - execute
  retryLimit: 2`);
  const canonical = markdownIssueToCanonical(markdown, '/vault/issues/vibe-coding/kanban-task-engine/VC-006.md');
  expect(canonical.automation).toMatchObject({
    trigger: 'manual',
    allowedActions: ['transition', 'execute'],
    extra: { retryLimit: 2 },
  });
});
```

- [ ] **Step 2: Add failing state tests**

Change `packages/core/tests/state-machine.test.ts` so `FAILED` no longer sets `completed`:

```ts
it('does not set completed date on FAILED', () => {
  const runningTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'RUNNING' as NormalizedStatus } };
  const result = sm.transition(runningTask, 'FAILED');
  expect(result.completed).toBeUndefined();
});
```

Add transition tests that `TODO -> FAILED` and `REVIEW -> FAILED` are not default transitions.

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/schema exec vitest run tests/issue-schema.test.ts tests/status.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/state-machine.test.ts
```

Expected:

- schema tests fail for missing validators,
- state-machine test fails because `FAILED` still sets `completed`.

- [ ] **Step 4: Implement schema and status contract**

Implementation rules:

- Add `sync?: { jira?: { key?: string; status?: string; exportedAt?: string } }` to `IssueFrontmatter`.
- Add `validateIssueIdSegment(id: string): string[]`.
- Add `validateIssueFrontmatterForRegistry(input, context)` with `idPrefix` and `spaceType` checks.
- Add `로그` to both required section lists.
- Keep Epic child marker as `kanban:auto-render start/end`.
- Reject Epic statuses outside `TODO|DONE`.
- Reject non-human Epic executor.
- Reject flat `jiraKey`, `jiraStatus`, `exportedAt`, `syncTarget`, `jiraProject`.
- Preserve `automation.trigger`, `automation.allowedActions`, and serializable unknown automation data under `automation.extra` in `markdownIssueToCanonical()`.
- Remove `TODO -> FAILED` and `REVIEW -> FAILED` from default transitions.
- In `StateMachine.transition()`, set `completed` only when `newStatus === 'DONE'`.

- [ ] **Step 5: Run GREEN**

Run the same commands from Step 3.

Expected: all pass.

---

## Task 2: Safe Vault Resolver And Core Vault Service

**Uses:** `superpowers:test-driven-development`, `system-design`, `tech-debt`

**Files:**
- Create: `packages/core/src/store/vault-path.ts`
- Create: `packages/core/src/store/vault-service.ts`
- Modify: `packages/core/tests/path-validator.test.ts`
- Modify: `packages/core/tests/markdown-store.test.ts`
- Modify: `packages/core/tests/registry.test.ts`
- Modify: `packages/core/src/store/registry.ts`
- Modify: `packages/core/src/store/markdown-store.ts`
- Modify: `packages/cli/src/vault.ts`

- [ ] **Step 1: Add failing safe path tests**

Add to `packages/core/tests/path-validator.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveVaultPath } from '../src/store/vault-path';

it('rejects path traversal segments', async () => {
  for (const segment of ['..', '.', '', '   ', '/absolute', 'a/b', 'a\\b', `nul\0x`]) {
    await expect(resolveVaultPath('/vault', 'issues', segment, 'escape.md')).rejects.toThrow('Unsafe vault path segment');
  }
});

it('rejects symlink escapes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-vault-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-outside-'));
  await fs.symlink(outside, path.join(root, 'issues-link'));
  await expect(resolveVaultPath(root, 'issues-link', 'VC-001.md')).rejects.toThrow('Vault path escapes root');
});
```

- [ ] **Step 2: Add failing traversal parity tests**

Add a `MarkdownStore` test that creates a registry with `issues/vibe-coding/kanban-task-engine/VC-001.md` and expects `listTasks()` to include it. Add a CLI test later in Task 5 to prove CLI delegates to the same core service.

Use a new real-files test file such as `packages/core/tests/markdown-store-registry.test.ts` instead of extending the existing `markdown-store.test.ts`, because the existing file mocks `fs/promises`.

- [ ] **Step 2a: Add failing artifact segment tests**

Add tests to `packages/core/tests/executor/run-artifacts.test.ts` and `packages/core/tests/executor/worktree.test.ts`:

```ts
it.each(['../VC-001', 'VC/001', '-VC-001'])('rejects unsafe issue id %s before artifact path creation', issueId => {
  expect(() => getRunArtifactPaths('/vault', '2026-05-02', issueId, 1)).toThrow('Invalid issue id');
});

it.each(['../VC-001', 'VC/001', '-VC-001'])('rejects unsafe issue id %s before worktree path creation', issueId => {
  expect(() => getKanbanBranchName(issueId)).toThrow('Invalid issue id');
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/path-validator.test.ts tests/registry.test.ts tests/markdown-store.test.ts tests/markdown-store-registry.test.ts tests/executor/run-artifacts.test.ts tests/executor/worktree.test.ts
```

Expected: missing `resolveVaultPath` and traversal behavior fail.

- [ ] **Step 4: Implement resolver and service**

Implementation rules:

- `resolveVaultPath(vaultRoot, ...segments)` must be async because symlink containment needs `realpath`.
- export and await `resolveVaultPath()` consistently; call sites must not assume a synchronous return.
- Reject unsafe segments before joining.
- Compare `path.relative(realVaultRoot, realCandidate)` and reject values starting with `..` or absolute paths.
- For non-existing write targets, realpath the nearest existing parent.
- `VaultService` loads `registry.yaml`, lists issue roots, reads Markdown through schema parser, renders boards, and writes canonical/boards through `resolveVaultPath`.
- `MarkdownStore` delegates issue traversal/write path decisions to registry-aware helpers instead of one-depth `issues` scanning.
- `run-artifacts`, `run-issue.writePrompt`, `appendRunEvent`, and worktree branch/path helpers validate issue id segments before `path.join()`.

- [ ] **Step 5: Run GREEN**

Run the same command from Step 3.

Expected: all pass.

---

## Task 3: Runtime Policy, Adapter Guard, And Recipes

**Uses:** `superpowers:test-driven-development`, `architecture`, `system-design`

**Files:**
- Create: `packages/core/src/runtime/adapter-policy.ts`
- Create: `recipes/work-jira-export.yaml`
- Create: `recipes/examples/home-full-auto.yaml`
- Modify: `recipes/home-full-auto.yaml`
- Modify: `packages/core/src/runtime/policy.ts`
- Modify: `packages/core/src/policy-engine.ts`
- Modify: `packages/core/src/recipes/recipe-loader.ts`
- Modify: `packages/core/tests/policy-engine.test.ts`
- Modify: `packages/core/tests/recipe-loader.test.ts`

- [ ] **Step 1: Add failing policy tests**

Add tests:

```ts
import { assertAdapterAllowed } from '../src/runtime/adapter-policy';

it('denies adapters when deniedAdapters wins', () => {
  expect(() => assertAdapterAllowed({
    mode: 'work',
    automationCanMoveIssues: false,
    automationCanStartExecution: false,
    externalSync: 'atlassian-only',
    allowedAdapters: ['jira'],
    deniedAdapters: ['codex'],
    allowedExecutionRoots: [],
    jira: { allowedHosts: ['your-company.atlassian.net'] },
    writeBack: { allowedFields: ['sync.jira.key'], bodyAllowed: false },
    allowedSideEffects: ['readIssue'],
  }, 'codex', 'execute')).toThrow('Adapter codex is denied');
});

it('fails closed for unknown adapter ids from recipes', () => {
  expect(() => parseRecipeYaml('mode: work\nmodules: []\npolicy:\n  mode: work\n  allowedAdapters: [wat]\n  deniedAdapters: []\n  automationCanMoveIssues: false\n  automationCanStartExecution: false\n  externalSync: none\n  allowedExecutionRoots: []\n  writeBack:\n    allowedFields: []\n    bodyAllowed: false\n  allowedSideEffects: []\n')).toThrow('Invalid adapter id');
});
```

- [ ] **Step 2: Add failing recipe tests**

Add tests proving:

- `recipes/work-jira-export.yaml` parses,
- default recipes only reference registered modules,
- `home-full-auto.yaml` is no longer a default executable recipe until factories exist.

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/policy-engine.test.ts tests/recipe-loader.test.ts
```

Expected: missing adapter-policy and recipe failures.

- [ ] **Step 4: Implement policy**

Implementation rules:

- Define `RuntimeMode`, `ExternalSyncPolicy`, `AdapterId`, expanded `RuntimePolicy`.
- Add `allowedExecutionRoots: string[]` and `jira.allowedHosts: string[]`.
- Keep backward compatibility by allowing old recipes with only `allowedSideEffects` through a migration function that fills safe defaults for `validate-only`.
- Add `assertAdapterAllowed(policy, adapterId, action)`.
- Add `loadActiveRecipePolicy({ vaultRoot, env })` that resolves in this order: `KANBAN_RECIPE`, `<vaultRoot>/config/active-recipe.yaml`, bundled `recipes/home-assisted.yaml`; Work tests pass `KANBAN_RECIPE=recipes/work-jira-export.yaml`.
- `PolicyEngine.registerAdapter()` validates adapter id before storing.
- Move `recipes/home-full-auto.yaml` to `recipes/examples/home-full-auto.yaml`.
- Add executable `recipes/work-jira-export.yaml` using `sync.jira.*` write-back fields.

- [ ] **Step 5: Run GREEN**

Run the same command from Step 3.

Expected: all pass.

---

## Task 4: Execution Target, Git Fallback, Prompt Contract

**Uses:** `superpowers:test-driven-development`, `context7` if Node child_process or git behavior needs confirmation

**Files:**
- Modify: `packages/core/tests/executor/execution-target.test.ts`
- Modify: `packages/core/tests/executor/git.test.ts`
- Modify: `packages/core/tests/executor/prompt-assembler.test.ts`
- Modify: `packages/core/src/executor/execution-target.ts`
- Modify: `packages/core/src/executor/git.ts`
- Modify: `packages/core/src/executor/prompt-assembler.ts`

- [ ] **Step 1: Add failing target fallback tests**

Add tests:

```ts
function fakeGitRunnerWithFailures(options: {
  symbolicRefFails?: boolean;
  localBranches?: string[];
}): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args[0] === 'symbolic-ref' && options.symbolicRefFails) {
        throw new Error('origin HEAD missing');
      }
      if (args[0] === 'show-ref' && args[1] === '--verify') {
        const branch = String(args[2] ?? '').replace('refs/heads/', '');
        if (options.localBranches?.includes(branch)) return { stdout: '', stderr: '' };
        throw new Error('missing ref');
      }
      return { stdout: 'origin/main\n', stderr: '' };
    },
  };
}

it('falls back to ~/Projects/<project> when working_dir is missing', async () => {
  const target = await resolveExecutionTarget(fakeGitRunner(), {
    id: 'VC-001',
    project: 'kanban-task-engine',
  });
  expect(target.workingDir).toBe(path.join(os.homedir(), 'Projects', 'kanban-task-engine'));
});

it('falls back to local main when origin HEAD is unavailable', async () => {
  const runner = fakeGitRunnerWithFailures({ symbolicRefFails: true, localBranches: ['main'] });
  const target = await resolveExecutionTarget(runner, {
    id: 'VC-001',
    workingDir: '/repo',
  });
  expect(target).toMatchObject({ mergeInto: 'main', baseRef: 'main' });
});

it('rejects execution targets outside allowed roots', async () => {
  await expect(resolveExecutionTarget(fakeGitRunner(), {
    id: 'VC-001',
    workingDir: '/tmp/untrusted',
    project: 'kanban-task-engine',
  }, {
    allowedExecutionRoots: [path.join(os.homedir(), 'Projects')],
  })).rejects.toThrow('Execution target is outside allowed roots');
});
```

- [ ] **Step 2: Add failing prompt tests**

Assert the prompt includes `목적`, `컨텍스트`, `Acceptance Criteria`, `실행 힌트`, the protocol tail, and does not include `## 로그` as a primary instruction section.

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/executor/execution-target.test.ts tests/executor/git.test.ts tests/executor/prompt-assembler.test.ts
```

- [ ] **Step 4: Implement target and prompt**

Implementation rules:

- Extend `ExecutionTargetIssue` with `project?: string` and `space?: string`.
- Extend `resolveExecutionTarget(runner, issue, policy)` with `allowedExecutionRoots`.
- Resolve `workingDir` fallback as spec §11.1.
- Reject unauthorized, symlink-escaped, or unrelated execution roots before git commands.
- Add helpers `hasRemote`, `refExists`, `getLocalDefaultBranch`.
- `fetchOrigin()` is a no-op when remote `origin` does not exist.
- Build prompt from parsed issue sections and append a protocol tail.

- [ ] **Step 5: Run GREEN**

Run the same command from Step 3.

Expected: all pass.

---

## Task 5: CLI Sync, Board, Next, Run Policy Preflight

**Uses:** `superpowers:test-driven-development`, `documentation`, `code-simplifier`

**Files:**
- Create: `packages/cli/tests/sync-board-next.test.ts`
- Modify: `packages/cli/tests/index.test.ts`
- Modify: `packages/cli/tests/run-args.test.ts`
- Modify: `packages/cli/src/context.ts`
- Modify: `packages/cli/src/vault.ts`
- Modify: `packages/cli/src/commands/sync.ts`
- Modify: `packages/cli/src/commands/board.ts`
- Modify: `packages/cli/src/commands/next.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add failing CLI tests**

Add tests proving:

- `createCliContext()` uses core `resolveKanbanHome()` and expands `~`.
- `sync --strict` exits non-zero with warnings.
- `sync --write-boards` writes `boards/<space>.md` and `boards/<space>-epics.md`.
- `board --space vibe-coding --write` writes one space board.
- `next --execute --agent codex` delegates to run lifecycle.
- `createCliContext()` reads `KANBAN_RECIPE` into `recipePath`.
- Work recipe blocks `run --execute --agent codex` before issue status changes.
- Work recipe blocks `next --execute --agent claude-code` before issue status changes.
- `approve`, `abort`, `retry`, and `recover-run` still pass their existing lifecycle tests after `VaultService` delegation.
- help includes `--execute`, `--agent`, `--mock-executor`, `--strict`, `--write`, `--space`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/cli exec vitest run tests/index.test.ts tests/run-args.test.ts tests/sync-board-next.test.ts
```

- [ ] **Step 3: Implement CLI behavior**

Implementation rules:

- CLI context imports `resolveKanbanHome()` from core.
- CLI context adds `recipePath?: string` from `KANBAN_RECIPE`.
- `sync`, `board`, and `next` parse flags explicitly and reject unknown options.
- CLI delegates vault traversal/rendering to core `VaultService`.
- `run`, `next --execute`, `approve`, `abort`, `retry`, and `recover-run` use core-backed read/write services so lifecycle mutation does not bypass path validation.
- `run` and `next --execute` load active policy before mutation through `loadActiveRecipePolicy()` and call `assertAdapterAllowed()`.
- Work mode execution failures print a clear error and do not edit the issue file.

- [ ] **Step 4: Run GREEN**

Run the same command from Step 2.

Expected: all pass.

---

## Task 6: Adapter Safety Hardening

**Uses:** `superpowers:test-driven-development`, `tech-debt`, `code-simplifier`

**Files:**
- Create: `packages/adapter-firebase/tests/firebase-policy.test.ts`
- Modify: `packages/adapter-firebase/src/firebase-adapter.ts`
- Modify: `packages/adapter-firebase/src/firebase-listener.ts`
- Modify: `packages/adapter-openclaw/src/rate-limit-queue.ts`
- Modify: `packages/adapter-openclaw/src/openclaw-adapter.ts`
- Modify: `packages/adapter-jira/src/jira-adapter.ts`
- Modify: `packages/adapter-jira/tests/jira-adapter.test.ts`
- Modify: `packages/adapter-cli/src/session-manager.ts`
- Modify: `packages/adapter-cli/tests/session-manager.test.ts`

- [ ] **Step 1: Add failing adapter tests**

Add tests:

- Firebase Work policy rejects constructor/connect/subscribe/publish.
- Firebase `todo` maps to `TODO`.
- Firebase `selected` maps to `READY` only when policy permits external movement; otherwise it remains `TODO` or throws a structured adapter error.
- Omitted policy uses explicit default-deny behavior for Firebase/OpenClaw/Jira operations.
- OpenClaw queue persists `pending` and `processing`, implements `ack`, `requeue`, `recoverProcessing`, `drain`, and rejects corrupt backups.
- Jira export refuses non-https `baseUrl` in Work mode and skips create when `sync.jira.key` exists through a new `exportIssue({ issue, force })` API.
- Jira host allowlist comes from `RuntimePolicy.jira.allowedHosts`.
- SessionManager excludes `NODE_OPTIONS`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `CUSTOM_TOKEN`, `CUSTOM_SECRET`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-firebase exec vitest run tests/firebase-mapper.test.ts tests/firebase-policy.test.ts
pnpm --filter @kanban-task-engine/adapter-openclaw exec vitest run tests/rate-limit-queue.test.ts tests/openclaw-adapter.test.ts
pnpm --filter @kanban-task-engine/adapter-jira exec vitest run tests/jira-adapter.test.ts tests/jira-mapper.test.ts
pnpm --filter @kanban-task-engine/adapter-cli exec vitest run tests/session-manager.test.ts
```

- [ ] **Step 3: Implement adapter guards**

Implementation rules:

- Adapter constructors require `RuntimePolicy` or use an explicit default-deny policy; omitted policy must not grant access.
- Firebase listener maps `todo` to `TODO`.
- OpenClaw queue file shape is `{ pending: QueuedTask[], processing: ProcessingTask[] }`.
- OpenClaw persistence writes temp file then rename.
- Jira adds `exportIssue({ issue, force })`, validates `https` and host allowlist when policy mode is `work`, and enforces `sync.jira.*` write-back fields.
- Adapter-cli builds child env from an allowlist plus explicit `config.env` keys.

- [ ] **Step 4: Run GREEN**

Run the same commands from Step 2.

Expected: all pass.

---

## Task 7: Documentation, Hardening Eval, And CI

**Uses:** `documentation`, `skill-creator`, `superpowers:writing-skills`, `superpowers:test-driven-development`

**Files:**
- Create: `docs/archive/README.md`
- Create: `scripts/check-hardening.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `scripts/eval-superpowers.ts`
- Modify: `README.md`
- Modify: `docs/kanban-runtime.md`
- Modify: `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- Modify: `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`

- [ ] **Step 1: Add failing hardening checker**

Create `scripts/check-hardening.ts` with checks for:

- `README.md` headings: Quick Start, Home And Work Modes, CLI, Recipes, Safety Model.
- `docs/kanban-runtime.md` references the 2026-05-02 spec and states no-change `FAILED`.
- `docs/archive/README.md` exists and maps old docs to current docs.
- `.github/workflows/ci.yml` exists and includes `pull_request`, `push` to `main`, Node 22, `corepack prepare pnpm@10.32.1 --activate`, `actions/setup-node` pnpm cache, `pnpm install --frozen-lockfile`, `git diff --check`, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`, `pnpm eval:hardening`.
- `package.json` has `packageManager: "pnpm@10.32.1"` and `scripts["eval:hardening"]`.
- `scripts/eval-superpowers.ts` includes the 2026-05-02 spec in eval inputs and no longer requires `docs/kanban-runtime.md` to declare 2026-04-23 as the sole authoritative design.
- `config/workspaces.json` is documented as migration-only legacy config or removed; this plan chooses migration-only for one release and documents that decision.
- raw `path.join(vaultRoot, ...)`, direct CLI YAML lifecycle writes, and adapter constructors without policy are scanned by allowlist-based architecture guards in `check-hardening.ts`.

- [ ] **Step 2: Run RED**

Run:

```bash
node --import tsx scripts/check-hardening.ts
```

Expected: fails because docs, script entry, CI workflow, and packageManager are missing.

- [ ] **Step 3: Implement docs and CI**

Implementation rules:

- Add `"packageManager": "pnpm@10.32.1"` to root `package.json`.
- Add `"eval:hardening": "node --import tsx scripts/check-hardening.ts"`.
- Write README with concise quick start and safety model.
- Rewrite `docs/kanban-runtime.md` as operator runtime guide.
- Add archive delta index.
- Add superseded notes to old specs for no-change, `next`, and Work metadata.
- Update `scripts/eval-superpowers.ts` to align with the new doc hierarchy.
- Mark `config/workspaces.json` as migration-only in README/runtime/archive docs; keep the file for one release to avoid silent breaking changes.
- Add CI workflow pinned to Node 22 and pnpm 10.32.1.
- Do not create a new global skill in this task. Use `skill-creator`/`writing-skills` only for final retrospective; repo-specific process rules stay in `README.md`, `docs/kanban-runtime.md`, and this plan.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm eval:hardening
```

Expected: pass.

---

## Task 8: Final Verification, Multi-Agent Review, And Refactor

**Uses:** `superpowers:requesting-code-review`, `code-simplifier`, `superpowers:verification-before-completion`

**Files:**
- Review all changed source and docs files.

- [ ] **Step 1: Run focused gates**

Run:

```bash
pnpm --filter @kanban-task-engine/schema exec vitest run tests/issue-schema.test.ts tests/status.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts tests/state-machine.test.ts tests/markdown-store.test.ts tests/markdown-store-registry.test.ts tests/path-validator.test.ts tests/registry.test.ts tests/policy-engine.test.ts tests/recipe-loader.test.ts tests/executor/git.test.ts tests/executor/execution-target.test.ts tests/executor/prompt-assembler.test.ts tests/executor/run-artifacts.test.ts tests/executor/worktree.test.ts tests/executor/run-issue.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/index.test.ts tests/run-args.test.ts tests/sync-board-next.test.ts
pnpm --filter @kanban-task-engine/adapter-firebase exec vitest run tests/firebase-mapper.test.ts tests/firebase-policy.test.ts
pnpm --filter @kanban-task-engine/adapter-openclaw exec vitest run tests/rate-limit-queue.test.ts tests/openclaw-adapter.test.ts
pnpm --filter @kanban-task-engine/adapter-jira exec vitest run tests/jira-adapter.test.ts tests/jira-mapper.test.ts
pnpm --filter @kanban-task-engine/adapter-cli exec vitest run tests/session-manager.test.ts
```

- [ ] **Step 2: Run full gates**

Run:

```bash
pnpm -r build
pnpm -r test
pnpm eval:superpowers
pnpm eval:hardening
git diff --check
```

- [ ] **Step 3: Run code-simplifier pass**

Use `code-simplifier` on duplicated CLI/core boundary code and policy plumbing after tests pass. Refactor only when it preserves behavior and keeps public CLI contract intact.

- [ ] **Step 4: Re-run focused and full gates after refactor**

Run Steps 1 and 2 again. Expected: both focused and full gates pass after refactoring.

- [ ] **Step 5: Request three independent reviews**

Dispatch at least three reviewers:

1. architecture/runtime reviewer,
2. security/adapter/path reviewer,
3. testing/docs/CI reviewer.

Each reviewer must compare implementation against `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md` and this plan, not just inspect changed filenames.

- [ ] **Step 6: Apply required review fixes with TDD**

For every P0/P1 finding:

1. write a failing regression test,
2. verify RED,
3. implement minimal fix,
4. verify GREEN,
5. re-run the focused package gate.

- [ ] **Step 7: Post-fix review if code changed after review**

If P0/P1 fixes or any additional simplifier changes modify source after Step 5 review, re-dispatch at least one targeted reviewer for the changed area.

- [ ] **Step 8: Final completion gate**

Run full gates from Step 2 again. Only after fresh green output, report completion with exact commands and results.
