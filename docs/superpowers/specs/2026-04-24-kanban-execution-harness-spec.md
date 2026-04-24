# Kanban Execution Harness Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec defines the local execution harness after the inspection and board CLI exists.

The goal is to execute one non-Epic `READY` Markdown issue through an explicit command and record auditable results.

## 2. Commands

Execution commands:

```text
kanban run <issue-id>
kanban run <issue-id> --dry-run
kanban approve <issue-id>
kanban abort <issue-id>
kanban retry <issue-id>
```

These commands extend `packages/cli`.

## 3. Safety Principles

- Card movement is not execution.
- `READY -> RUNNING` requires `kanban run` or an explicitly enabled recipe policy.
- Epics cannot run.
- A lock is required before any state-changing run operation.
- `--dry-run` writes nothing.
- All run artifacts go under `runs/<date>/<issue-id>/`.
- Credentials are never written to issue files, event files, stdout, stderr artifacts, or metadata.
- Destructive cleanup requires an explicit command path.

## 4. Components

Required components:

```text
LockManager
WorktreeManager
PromptAssembler
CommandRunner
FakeExecutor
ClaudeCodeExecutor
RunArtifactWriter
IssueLogAppender
StateTransitionService
ExecutionHarness
```

Recommended core layout:

```text
packages/core/src/executor/
  lock.ts
  worktree.ts
  prompt-assembler.ts
  command-runner.ts
  fake-executor.ts
  claude-code-executor.ts
  run-artifacts.ts
  issue-log.ts
  state-transition-service.ts
  execution-harness.ts
  index.ts
```

## 5. Run Flow

`kanban run <issue-id> --dry-run`:

```text
1. Resolve CLI context.
2. Resolve issue by issue id.
3. Parse and validate issue.
4. Reject missing issue.
5. Reject Epic issue.
6. Reject issue unless status is READY.
7. Resolve planned worktree path.
8. Resolve planned run artifact path.
9. Render planned prompt.
10. Print plan.
11. Exit without writing.
```

`kanban run <issue-id>`:

```text
1. Resolve CLI context.
2. Resolve issue by issue id.
3. Parse and validate issue.
4. Reject missing issue.
5. Reject Epic issue.
6. Reject issue unless status is READY.
7. Acquire lock.
8. Create run artifact directory.
9. Transition READY -> RUNNING.
10. Append RUNNING log entry.
11. Create worktree if configured.
12. Assemble prompt.
13. Write prompt artifact.
14. Invoke executor.
15. Write stdout/stderr artifacts.
16. Write metadata JSON.
17. Transition RUNNING -> REVIEW on exit code 0.
18. Transition RUNNING -> FAILED on nonzero exit, timeout, or handled executor error.
19. Append final log entry.
20. Write event JSONL entry.
21. Release lock.
```

Lock release must happen in a `finally` path.

## 6. Executor Contract

```ts
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
```

`FakeExecutor` is required before `ClaudeCodeExecutor`.

Fake modes:

```text
success
failure
timeout
```

## 7. Worktree Contract

Default path:

```text
<target-repo>/.worktrees/kanban/<issue-id>
```

Rules:

- `working_dir` from frontmatter identifies the target repo.
- Missing `working_dir` is allowed only for `--dry-run` or fake executor tests that do not require a repo.
- Worktree creation uses non-interactive git commands.
- Existing worktree for the issue fails unless retry cleanup has prepared it.
- Worktree metadata is written into run artifacts.

## 8. Artifact Contract

Required files:

```text
runs/<YYYY-MM-DD>/<issue-id>/
  prompt.md
  stdout.txt
  stderr.txt
  metadata.json
```

Required metadata fields:

```ts
interface RunMetadata {
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
```

## 9. Issue Log Contract

Append to `## 로그`.

Required entries:

```text
- <ISO timestamp> RUNNING: execution started by <executor>.
- <ISO timestamp> REVIEW: execution completed successfully. Artifacts: <relative path>.
- <ISO timestamp> FAILED: execution failed with exit code <n>. Artifacts: <relative path>.
```

If `## 로그` is missing, the appender may create it because the parser treats it as optional.

## 10. Approval Flow

`kanban approve <issue-id>`:

```text
1. Resolve issue.
2. Require status REVIEW.
3. If worktree metadata exists, perform ff-only merge.
4. Transition REVIEW -> DONE.
5. Set completed timestamp.
6. Append log entry.
7. Write event.
8. Clean up worktree when cleanup policy allows.
```

`kanban abort <issue-id>`:

```text
1. Resolve issue.
2. Require REVIEW or FAILED.
3. Transition REVIEW -> READY or FAILED -> READY.
4. Append log entry.
5. Keep worktree and artifacts by default.
```

`kanban retry <issue-id>`:

```text
1. Resolve issue.
2. Require REVIEW or FAILED.
3. Require explicit cleanup flag when deleting existing worktree state.
4. Transition REVIEW -> READY or FAILED -> READY.
5. Increment run_count when present.
6. Append log entry.
```

## 11. Out of Scope

- OpenClaw execution.
- GitHub/Firebase/Jira synchronization.
- Multi-issue scheduling.
- Parallel execution.
- Web UI.

## 12. Acceptance Criteria

- Fake success E2E test moves `READY -> REVIEW`.
- Fake failure E2E test moves `READY -> FAILED`.
- Fake timeout E2E test moves `READY -> FAILED`.
- Non-READY issue is rejected before lock/worktree creation.
- Epic issue is rejected before lock/worktree creation.
- `--dry-run` writes no files.
- Lock file is released after success and after failure.
- Prompt, stdout, stderr, and metadata artifacts are written.
- `approve` rejects non-`REVIEW` issues.
- `abort` can move `FAILED -> READY`.
- `abort` can move `REVIEW -> READY`.
- `retry` can move `REVIEW -> READY` and `FAILED -> READY`.
- `retry` does not silently delete worktree state.
- Full workspace verification passes:

```bash
pnpm test
pnpm build
```
