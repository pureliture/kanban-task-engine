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

Authoring commands require an explicit `KANBAN_HOME`; the CLI must not write to the default Home vault unless the operator set the vault root deliberately. Run these from the engine repo after `pnpm -r build`.

```bash
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine "Draft issue title"
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine --dry-run --json "Preview issue"
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js normalize inbox/rough-note.md --check --space vibe-coding --project kanban-task-engine --json
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js normalize inbox/rough-note.md --write --space vibe-coding --project kanban-task-engine
```

`kanban new` creates a canonical issue file, allocates the next safe id, and fills required frontmatter. `kanban normalize` turns rough Markdown into a formal issue without using an LLM; `--check` previews the deterministic output and `--write` either rewrites a sole owned issue-root file in place or creates a canonical target while preserving the rough source.

Lifecycle and projection commands:

```bash
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js sync
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js board
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js next
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js run VC-001
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban node packages/cli/dist/bin.js run VC-001 --execute --agent codex
```

Board write smoke tests must use a disposable vault prepared with a test `registry.yaml` and issue notes. This block is safe to copy as-is from the engine repo:

```bash
DISPOSABLE_VAULT=$(mktemp -d)
mkdir -p "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine" "$DISPOSABLE_VAULT/issues/vibe-coding/_epics"
cat > "$DISPOSABLE_VAULT/registry.yaml" <<'YAML'
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
cat > "$DISPOSABLE_VAULT/issues/vibe-coding/kanban-task-engine/VC-001-ready.md" <<'MD'
---
id: VC-001
title: Ready item
type: task
status: READY
priority: P1
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Ready item

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
MD
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --space vibe-coding
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --write --space vibe-coding
KANBAN_HOME=$DISPOSABLE_VAULT node packages/cli/dist/bin.js board --write --all
grep -q 'kanban-plugin: board' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -Eq 'checksum=sha256:[a-f0-9]{64}' "$DISPOSABLE_VAULT/boards/vibe-coding.md"
grep -q '```dataview' "$DISPOSABLE_VAULT/boards/vibe-coding-epics.md"
```

`kanban board --write` writes generated projection files only. `boards/<space>.md` is an Obsidian Kanban board, and `boards/<space>-epics.md` is a Dataview index. These files are not source of truth; issue notes under `issues/**/*.md` remain authoritative. Moving an existing card in Obsidian is only a pending proposal until `kanban reconcile-board --apply` succeeds.

### Moving Issues

`kanban move <issue-id> <status>` is the canonical CLI mutation path for issue status. It updates issue frontmatter and preserves generated board files as projections. Use `--space <space>` when a vault can contain the same issue id in multiple spaces, and use `kanban board --write --space <space>` after a move to refresh Obsidian views.

`kanban reconcile-board --space <space>` reads a generated Obsidian Kanban board and reports proposed card movements. It is dry-run by default. `--apply` writes issue frontmatter only when every proposal passes stale, duplicate, checksum, and state-machine checks.

Use a disposable vault for smoke tests. Do not point write examples at `$HOME/.openclaw/workspace-kanban/kanban` unless the operator explicitly approves mutating that live-adjacent vault for this run.

Approve/abort/retry commands are lifecycle commands over existing run state. They must preserve diagnostics unless the operator explicitly chooses discard semantics and the git ancestry checks pass.

## Disposable Authoring Smoke

Before running Phase 1 authoring commands against a live vault, build the CLI and smoke test a disposable vault:

```bash
pnpm -r build
node packages/cli/dist/bin.js --help
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
```

The smoke must prove `kanban new`, `kanban new --dry-run --json`, `kanban normalize --check --json`, and `kanban normalize --write --json` against a temporary vault. Passing this gate is not Obsidian GUI readiness and is not live `workspace-kanban` readiness.

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
