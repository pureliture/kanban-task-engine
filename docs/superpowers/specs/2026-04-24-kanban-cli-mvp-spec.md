# Kanban CLI MVP Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec defines the first user-facing `kanban` CLI.

The CLI MVP is limited to inspection, validation, and generated board rendering. It must make the project usable before execution automation is added.

## 2. Positioning

The CLI is for a Markdown issue control plane, not a generic kanban application.

Initial commands:

```text
kanban doctor
kanban validate
kanban render-board
```

Execution, status-transition, merge, and external-adapter commands are out of scope for this spec.

## 3. Package Layout

Create:

```text
packages/cli/
  package.json
  tsconfig.json
  src/bin.ts
  src/index.ts
  src/context.ts
  src/commands/doctor.ts
  src/commands/validate.ts
  src/commands/render-board.ts
  tests/context.test.ts
  tests/commands/doctor.test.ts
  tests/commands/validate.test.ts
  tests/commands/render-board.test.ts
  tests/fixtures/minimal-vault/
```

Package name:

```text
@kanban-task-engine/cli
```

Binary:

```text
kanban
```

## 4. CLI Context Resolution

Vault path resolution order:

```text
1. --vault <path>
2. KANBAN_HOME
3. <OPENCLAW_HOME>/workspace-kanban/kanban
```

All commands use one shared context builder.

Context contains:

```ts
interface CliContext {
  vaultRoot: string;
  registryPath: string;
  resolver: WorkspaceResolver;
  store: MarkdownStore;
  stdout: Writable;
  stderr: Writable;
}
```

Path expansion:

- `~` expands to the user home directory.
- Relative `--vault` paths resolve from `process.cwd()`.
- Missing vault paths fail with a clear error.

## 5. Command: `kanban doctor`

Purpose:
Report whether the local vault and toolchain are usable.

Checks:

- Node is available.
- pnpm is available.
- git is available.
- Vault root exists.
- `registry.yaml` exists and parses.
- `issues/` exists.
- `boards/` exists.
- `events/` exists or can be created by later state-changing commands.
- `runtime/` exists or can be created by later state-changing commands.
- Optional: `claude` executable availability is reported but does not fail the CLI MVP.

Output:

- Human-readable table by default.
- JSON with `--json`.

Exit codes:

```text
0 all required checks pass
1 required check fails
```

## 6. Command: `kanban validate`

Forms:

```text
kanban validate
kanban validate <issue-id>
kanban validate --json
```

Behavior:

- Without an id, validate every issue discovered by `MarkdownStore.listTasks()`.
- With an id, validate one issue by `findByIssueId()`.
- Report file path, issue id, and validation errors.
- Continue validating remaining files after individual parse errors.
- Do not print raw YAML parser stacks.

Exit codes:

```text
0 no validation errors
1 one or more validation errors
2 command usage error
```

## 7. Command: `kanban render-board`

Forms:

```text
kanban render-board
kanban render-board --check
kanban render-board --space vibe-coding
```

Behavior:

- Reads registry and issues.
- Generates board Markdown for the selected space or all spaces.
- Writes board files by default.
- With `--check`, does not write and exits nonzero if generated output differs.
- Excludes Epics from Kanban cards.
- Uses relative links from board files to issue files.

Initial renderer may reuse existing `renderBoardMarkdown()` if registry-aware aggregation is not yet implemented. If so, this command must document the limitation in output and tests.

Exit codes:

```text
0 boards written or already current
1 --check found stale board output
2 command usage error
```

## 8. Output Rules

Human output:

- Concise.
- File paths included.
- No stack traces unless `--debug` is later added.

JSON output:

```ts
interface CommandJsonResult {
  ok: boolean;
  command: string;
  vaultRoot: string;
  errors: Array<{ file?: string; issueId?: string; message: string }>;
  warnings: Array<{ file?: string; issueId?: string; message: string }>;
}
```

## 9. Out of Scope

- `kanban init`
- `kanban run`
- `kanban approve`
- `kanban abort`
- `kanban retry`
- Jira/GitHub/Firebase network calls
- OpenClaw execution
- Claude execution
- Any issue status transition
- Any git merge or worktree operation

## 10. Acceptance Criteria

- `pnpm --filter @kanban-task-engine/cli test` passes.
- `pnpm --filter @kanban-task-engine/cli build` passes.
- Root `pnpm test` and `pnpm build` pass.
- `kanban --help` lists only inspection, validation, and board-rendering commands.
- `kanban doctor --json` returns stable JSON in tests.
- `kanban validate` reports invalid fixture files without throwing raw parser stacks.
- `kanban render-board --check` detects stale fixture boards.

## 11. Implementation Notes

Recommended dependencies:

- Use a small CLI parser such as `cac` or `commander`.
- Prefer dependency injection for command tests.
- Do not reuse `packages/adapter-cli` as the user-facing CLI. That package represents an executor adapter, not the product CLI.
