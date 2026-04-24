# Kanban Vault Store and Identity Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec covers the vault/store identity and path work called out by the GPT-5.5 Pro review.

The goal is to make local Markdown lookup, sync lookup, and file writes deterministic.

## 2. Current Evidence

Observed in the current repo:

- `TaskRef` has `provider`, `external_key`, and `external_id`.
- `MarkdownStore.findByExternalKey(provider, externalKey)` calls `findIssueFile(externalKey)`.
- `SyncCoordinator.syncFromProvider()` calls `findByExternalKey(remoteTask.task_ref.provider, remoteTask.task_ref.external_key)`.
- `MarkdownStore.writeBack()` uses `task.task_ref.external_key` to find the existing file.
- `MarkdownStore.getIssueFilePath()` composes `task.automation.workspace ?? 'workspace'` with `issues/`.
- `WorkspaceResolver.fromRegistry()` exists but `MarkdownStore` does not yet depend on it.
- `MarkdownStore.getAllIssueFiles()` scans only direct children of `issues/`.

These behaviors conflate namespace identity with issue identity and do not support container-space project directories.

## 3. TaskRef Semantics

`TaskRef` means:

```text
provider      external_key             external_id
local         space or vault namespace  VC-001
github        owner/repo                #123
jira          project key               PROJ-42
firebase      workspace/collection      document id
```

Rules:

- `external_key` identifies where the issue lives within a provider.
- `external_id` identifies the issue itself.
- Local Markdown file lookup uses `external_id`.
- Provider synchronization may use both values, but must not treat `external_key` as the issue id.

## 4. Store API

Replace ambiguous lookup with explicit lookup.

Required interface:

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

Migration:

- Replace internal callers of `findByExternalKey()`.
- Remove `findByExternalKey()` from `TaskStore` after callers are migrated.
- If a short compatibility period is needed, keep a deprecated method only on `MarkdownStore`, not in the shared interface.

## 5. Vault Layout Contract

The store supports these issue roots:

```text
issues/<single-space>/<ISSUE-ID>-title.md
issues/<single-space>/_epics/<ISSUE-ID>-title.md
issues/<container-space>/<project>/<ISSUE-ID>-title.md
issues/<container-space>/_epics/<ISSUE-ID>-title.md
```

Examples:

```text
issues/openclaw/OC-001-fix-heartbeat.md
issues/openclaw/_epics/OC-010-agent-runtime.md
issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md
issues/vibe-coding/_epics/VC-005-cli-mvp.md
```

Filename rule:

```text
<external_id>-<slug>.md
```

The resolver may accept `<external_id>.md` for legacy files, but new writes use the full filename rule.

## 6. WorkspaceResolver Integration

`MarkdownStore` must be constructed with a resolver or enough registry data to create one.

Supported construction:

```ts
new MarkdownStore({
  vaultRoot,
  resolver,
  policyEngine,
});
```

Backwards-compatible construction using only `basePath` may remain temporarily for tests, but production CLI wiring must use the resolver.

Required resolver behavior:

- Resolve project paths from `registry.yaml`.
- Honor explicit `projects.*.path`.
- Resolve Epic paths under `_epics`.
- Reject unknown spaces.
- Reject unknown projects in container spaces.
- Reject paths outside the vault root.

## 7. Recursive Scan Contract

`listTasks()` scans recursively under configured issue roots.

Rules:

- Include `.md` issue files.
- Exclude dotfiles.
- Exclude generated board files.
- Include `_epics`.
- Surface parse errors through `onParseError`.
- Continue scanning other files after a parse error.

## 8. Write Safety Contract

All writes must pass through path validation.

Required checks:

- Resolved path is inside the vault root.
- Resolved path is inside an allowed issue root.
- `external_id` cannot contain `/`, `\`, `..`, NUL, or path separators.
- Slug generation cannot create an empty unsafe path component.
- Atomic writes remain in use.

## 9. SyncCoordinator Changes

`SyncCoordinator.syncFromProvider()` must find the local equivalent by task reference or issue id.

Required behavior:

- Local lookup uses `remoteTask.task_ref.external_id` for issue identity.
- Provider namespace is preserved for conflict metadata.
- `pushToProvider()` must not push by `external_key` alone if the provider requires issue id.

If the current `WorkStateProvider` interface is too ambiguous, it should be changed in the adapter-hardening spec, but local sync must stop using namespace-only lookup in this spec.

## 10. Out of Scope

- CLI command implementation.
- Board rendering changes beyond whatever tests are needed for path fixtures.
- Worktree execution.
- External adapter API redesign beyond compile fixes.

## 11. Acceptance Criteria

- `MarkdownStore.writeBack()` locates the file for `task_ref.external_id`.
- `SyncCoordinator.syncFromProvider()` no longer calls local store lookup with `external_key` as the issue id.
- `MarkdownStore.listTasks()` finds nested project issues and `_epics`.
- `MarkdownStore.saveTask()` writes into resolver-approved paths.
- Path traversal attempts are rejected in tests.
- Tests cover single space, container project, and Epic issue paths.
- Full workspace verification passes:

```bash
pnpm test
pnpm build
```

## 12. Implementation Notes

Recommended files:

- Modify `packages/core/src/types.ts`.
- Modify `packages/core/src/store/markdown-store.ts`.
- Modify `packages/core/src/store/workspace-resolver.ts`.
- Modify `packages/core/src/sync-coordinator.ts`.
- Modify `packages/core/tests/markdown-store.test.ts`.
- Modify `packages/core/tests/workspace-resolver.test.ts`.
- Add sync tests under `packages/core/tests/` if no focused file exists.
