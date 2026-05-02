# Kanban Runtime

이 문서는 operator가 `kanban-task-engine`을 실행할 때 따라야 하는 runtime guide입니다.

최신 contract는 `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`입니다. `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`는 vault layout과 control-plane 배경 설계이고, `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`는 AgentRunner backend lifecycle 배경 문서입니다.

## Runtime Topology

- Engine repo: `~/Projects/kanban-task-engine`
- Home operator workspace: `~/.openclaw/workspace-kanban`
- Home issue vault: `~/.openclaw/workspace-kanban/kanban`
- Work vault: work machine의 별도 local Markdown vault

Markdown issue files under `<vaultRoot>/issues/` are the source of truth. Canonical JSON, board files, run artifacts, events, and export files are generated runtime artifacts and must not become a second source of truth.

## Required Environment

- Node 22
- pnpm 10.32.1
- `KANBAN_HOME=<vaultRoot>` for operator CLI commands
- optional `KANBAN_RECIPE=<recipe path>` for overriding active recipe

`config/workspaces.json` is migration-only legacy config. It remains in the repo for one release so old layouts can be identified deliberately, but new runtime behavior must use `KANBAN_HOME`, `<vaultRoot>/registry.yaml`, and active recipe policy instead.

## Home And Work Modes

Home mode may enable local automation modules such as validation, board rendering, audit log, git checkpoint, and explicit agent execution. Execution still requires an explicit command such as `kanban run <id> --execute` or `kanban next --execute`.

Work mode uses the same Markdown schema and parser, but disables OpenClaw execution, Firebase/mobile sync, and broad external writes. Work mode may export to Jira when policy allows the `jira` adapter and may write back only namespaced metadata under `sync.jira.*`.

## Issue Lifecycle

Valid non-epic statuses are:

```text
TODO -> READY -> RUNNING -> REVIEW -> DONE
                  RUNNING -> FAILED
                  FAILED -> READY
```

Important runtime rules:

- `kanban run <id>` is inspect-only.
- `kanban next` is discovery-only.
- `kanban run <id> --execute` and `kanban next --execute` are execution triggers.
- Every issue that reaches `RUNNING` must converge to `REVIEW` or `FAILED`.
- no-change success, where an agent exits 0 but produces no file changes, converges to `FAILED` because there is no checkpoint commit to approve.
- `completed` is written only for `DONE`; `FAILED` is an execution-attempt result, not completed work.

## Operator Commands

```bash
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- sync
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- board
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- next
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- run VC-001
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- run VC-001 --execute --agent codex
```

Approve/abort/retry commands are lifecycle commands over existing run state. They must preserve diagnostics unless the operator explicitly chooses discard semantics and the git ancestry checks pass.

## Recipes And Policy

Active recipe resolution order:

1. `KANBAN_RECIPE`
2. `<vaultRoot>/config/active-recipe.yaml`
3. bundled `recipes/home-assisted.yaml`

Runtime policy must fail closed. If an adapter is unknown, denied, or missing required policy, the runtime should reject before mutating issue state. Work mode must reject agent execution and non-Jira external sync before a runner or adapter can perform side effects.

## Runtime Artifacts

Runtime artifacts live under the vault:

- `runs/<date>/<issueId>/run-<n>.log`
- `runs/<date>/<issueId>/run-<n>.json`
- `runs/<date>/<issueId>/run-<n>.ndjson`
- `events/<date>.jsonl`
- `runtime/current.lock`

Secrets in stdout, stderr, metadata, and JSONL events must be redacted before persistence. Artifact write failures after a REVIEW candidate must reconverge the issue to `FAILED`.

## Deploy Readiness

Before shipping a runtime or CI change:

```bash
pnpm -r build
pnpm -r test
pnpm eval:superpowers
pnpm eval:hardening
git diff --check
```

For production automation, also clear or explicitly accept every architecture allowlist entry reported by:

```bash
pnpm eval:hardening -- --strict-architecture
```

Use `docs/deploy-checklist.md` for the full deploy checklist, rollback triggers, and tech-debt triage.
