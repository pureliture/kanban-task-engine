# Kanban Adapter Hardening Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec covers adapter contract hardening after local CLI and local execution are usable.

The goal is to make all adapters preserve core contracts rather than redefining similar shapes.

## 2. Current Evidence

Observed in the current repo:

- `packages/core/src/types.ts` defines `ExecutionAdapter`.
- `packages/adapter-cli/src/cli-adapter.ts` implements `execute(task, transition)`.
- `packages/adapter-openclaw/src/openclaw-adapter.ts` defines its own `ExecutionAdapter` interface with `execute(task)`.
- OpenClaw request metadata currently uses `task.task_ref.external_key` as `ticketId`.
- GitHub mapper uses `external_key = owner/repo` and `external_id = #number`.
- Firebase mapper uses `external_key = workspace` and `external_id = doc.id`.

## 3. Adapter Contract Rules

Adapters must import shared contracts from core when they implement shared behavior.

Rules:

- Do not redefine `ExecutionAdapter` with a conflicting shape.
- Do not redefine `TaskRef`.
- Do not push or fetch provider records by `external_key` when the provider requires `external_id`.
- Preserve `TaskRef` semantics from the vault/store spec.

## 4. Execution Adapter Contract

Core execution adapter:

```ts
export interface ExecutionAdapter {
  name: string;
  execute(task: CanonicalTaskModel, transition: StateTransition): Promise<ExecutionResult>;
  getSessionStatus(sessionId: string): Promise<ExecutionStatus>;
  cancel(sessionId: string): Promise<void>;
}
```

Adapter requirements:

- `adapter-cli` remains compatible.
- `adapter-claude-code` either implements this contract or documents itself as a lower-level executor wrapper used by the execution harness.
- `adapter-openclaw` must expose a core-compatible adapter or a clearly named wrapper such as `OpenClawExecutionAdapter`.

## 5. OpenClaw Metadata Contract

OpenClaw request metadata:

```text
ticketId: task.task_ref.external_id
namespace: task.task_ref.external_key
workspace: task.automation.workspace ?? task.task_ref.external_key
```

Prompt heading:

```text
Execute task <external_id>: <summary>
```

Do not use provider namespace as the issue id.

## 6. WorkStateProvider Contract

Current shape:

```ts
fetchTask(externalKey: string): Promise<CanonicalTaskModel | null>;
pushStatus(externalKey: string, status: NormalizedStatus): Promise<void>;
```

Required replacement:

```ts
fetchTask(ref: TaskRef): Promise<CanonicalTaskModel | null>;
pushStatus(ref: TaskRef, status: NormalizedStatus): Promise<void>;
```

If provider-specific implementations require a narrower id, adapters translate internally.

Examples:

- GitHub uses `owner/repo` plus issue number.
- Jira uses project key plus issue key.
- Firebase uses workspace/collection plus document id.

## 7. Contract Test Suite

Create shared conformance helpers under core or tests:

```text
packages/core/tests/contracts/
  execution-adapter-contract.ts
  task-ref-contract.ts
```

Execution contract tests:

- Adapter exposes `name`.
- `execute()` receives task and transition.
- `getSessionStatus()` returns a known status.
- `cancel()` handles known session ids.

TaskRef mapper tests:

- GitHub maps `owner/repo` to `external_key` and `#number` to `external_id`.
- Jira maps project key to `external_key` and issue key to `external_id`.
- Firebase maps workspace/collection to `external_key` and document id to `external_id`.
- OpenClaw metadata uses `external_id` as ticket id.

## 8. Out of Scope

- Network integration hardening beyond mocked/contract tests.
- GitHub Project V2 field id discovery.
- Firebase realtime listener resilience.
- Jira bidirectional sync.
- OpenClaw gateway feature expansion.

## 9. Acceptance Criteria

- No adapter exports a conflicting `ExecutionAdapter` interface.
- `adapter-openclaw` has a core-compatible execution wrapper or is clearly lower-level and not named as a core adapter.
- `WorkStateProvider` no longer accepts namespace-only strings for `fetchTask()` and `pushStatus()`.
- Mapper tests preserve `TaskRef` semantics across GitHub, Jira, Firebase, and OpenClaw metadata.
- Full workspace verification passes:

```bash
pnpm test
pnpm build
```

## 10. Implementation Notes

Recommended files:

- Modify `packages/core/src/types.ts`.
- Modify `packages/adapter-openclaw/src/openclaw-adapter.ts`.
- Modify `packages/adapter-openclaw/tests/openclaw-adapter.test.ts`.
- Modify `packages/adapter-github/src/github-adapter.ts`.
- Modify `packages/adapter-jira/src/jira-adapter.ts` if it implements provider push/fetch behavior.
- Modify `packages/adapter-firebase/src/firebase-adapter.ts`.
- Add shared contract tests where reuse is practical.
