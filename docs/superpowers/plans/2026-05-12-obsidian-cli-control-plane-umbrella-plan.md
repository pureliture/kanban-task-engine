# Obsidian CLI Control Plane Umbrella Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This umbrella plan must not be executed as one monolithic implementation batch; create and complete the child phase plans in order.

**Goal:** Make `kanban-task-engine` usable as a Markdown-first Kanban control plane where CLI commands and Obsidian views can create, normalize, project, move, reconcile, and execute issues against a real vault without requiring an LLM for core operation.

**Architecture:** Markdown issue files in the external vault are the only source of truth. CLI commands perform deterministic, policy-checked mutations; Obsidian Kanban and Dataview files are generated projections unless `reconcile-board` explicitly validates and applies a board change back to issue frontmatter. LLM/agent execution remains a later runtime layer over a fully working LLM-free issue lifecycle.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, gray-matter/YAML, Obsidian Kanban markdown format, Obsidian Dataview DQL, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, optional `computer-use` for GUI smoke.

---

## 0. Umbrella Scope

This plan exists to lock the cross-phase contract, not to implement every command in one change. Runtime quality comes from each phase passing concrete acceptance gates against disposable and live-adjacent vaults.

### Commands Covered

| Command | User meaning | Runtime role |
| --- | --- | --- |
| `kanban new` | Create a ticket | Allocate id, fill required frontmatter, write a Markdown issue file |
| `kanban normalize` | Promote rough note | Deterministically convert an incomplete Markdown note into a schema-valid issue |
| `kanban board --write` | Generate Obsidian views | Write Kanban board and Dataview index files under `boards/` |
| `kanban move` | Change status safely | Apply state-machine validated status changes to issue frontmatter |
| `kanban reconcile-board` | Validate Obsidian board edits | Diff board card movement against issue frontmatter, then optionally apply |
| Obsidian smoke | Prove human UX | Confirm Kanban plugin and Dataview can operate on generated vault files |

### Non-Negotiable Boundaries

- The engine repo never stores live issue state.
- The Home vault is external to the engine repo, normally `~/.openclaw/workspace-kanban/kanban`.
- `issues/**/*.md` are source of truth.
- `boards/**/*.md`, `canonical/**/*.json`, `runs/**`, `events/**`, and exports are generated/runtime artifacts.
- LLMs may assist authoring, but the board, ticket creation, id allocation, status changes, and reconciliation must work without an LLM.
- Obsidian Kanban drag/drop is not source of truth until `kanban reconcile-board --apply` succeeds.
- Agent execution is never implied by board movement; execution remains gated by `kanban run <id> --execute` or `kanban next --execute`.

## 1. Harness Routing

| Phase | Harness | Required use |
| --- | --- | --- |
| Architecture contract | `system-design`, `architecture` | Keep vault boundary, source-of-truth policy, Obsidian projection semantics, and runtime mutation gates explicit. |
| Documentation | `documentation` | Update runtime docs and smoke-test runbook after implementation slices land. |
| Planning | `superpowers:writing-plans` | Create one child implementation plan per phase before code changes. |
| Isolated workspace | `superpowers:using-git-worktrees` | Start implementation in an isolated worktree from `main`; do not carry unrelated dirty files. |
| TDD | `superpowers:test-driven-development` | Write failing tests before production code for each command or behavior change. |
| Parallel implementation | `spawn_agent` with worker agents | Use only after explicit user approval; assign disjoint write scopes per child phase or subtask. |
| External docs | `context7` | Verify current Obsidian Kanban and Dataview syntax before locking renderer/parser behavior. |
| Test strategy | `testing-strategy` | Keep unit, integration, CLI smoke, vault smoke, and GUI smoke acceptance levels separate. |
| Completion gate | `superpowers:verification-before-completion` | No phase completion claim before fresh verification output. |
| Review | `code-review`, `superpowers:requesting-code-review` | Review each child phase before merge or before moving to the next runtime gate. |
| GUI smoke | `computer-use` | Optional for opening Obsidian and checking Kanban/Dataview behavior when file-level smoke is green. |
| GitHub/PR | `GitHub` or `github` plugin | Use only after local phase verification to publish branches or PRs. |

## 2. Current Baseline To Preserve

- Current CLI handlers are `run`, `next`, `approve`, `abort`, `retry`, `recover-run`, `sync`, and `board`.
- `allocateNextIssueId(existingIds, idPrefix)` already exists in `packages/core/src/store/sequence.ts`.
- `kanban board` currently renders to stdout and does not write Obsidian plugin board files.
- `packages/cli/src/vault.ts` has CLI-local registry traversal and board rendering that should be migrated toward core services rather than expanded indefinitely.
- `docs/kanban-runtime.md` already defines `KANBAN_HOME`, source-of-truth policy, lifecycle states, and execution-trigger semantics.
- Existing generated board output is not yet Obsidian Kanban-native because it uses `type: kanban-board` frontmatter instead of the Kanban plugin's `kanban-plugin: board` marker.

## 3. Source Documents

Implementation child plans must treat these documents as the current contract stack:

- `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`: command, Obsidian, reconciliation, and acceptance-level contract for this umbrella plan.
- `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`: schema, policy, execution, adapter, CLI hardening baseline.
- `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`: vault layout and Home/Work control-plane background.
- `docs/kanban-runtime.md`: current operator runtime guide.

Do not create Phase 1 or later child implementation plans until the 2026-05-12 spec is reviewed and either accepted or amended.

## 4. Child Phase Plan Inventory

Each child plan must be saved under `docs/superpowers/plans/` and must contain exact tests, exact files, exact commands, and expected output. Each phase should produce working, testable behavior on its own.

| Phase | Child plan file | Primary outcome |
| --- | --- | --- |
| 1 | `docs/superpowers/plans/2026-05-12-kanban-authoring-new-normalize-plan.md` | `kanban new` and `kanban normalize` work against disposable vaults |
| 2 | `docs/superpowers/plans/2026-05-12-obsidian-board-write-plan.md` | `kanban board --write` writes Obsidian Kanban and Dataview projections |
| 3 | `docs/superpowers/plans/2026-05-12-kanban-move-reconcile-plan.md` | `kanban move` and `kanban reconcile-board` safely mutate issue frontmatter |
| 4 | `docs/superpowers/plans/2026-05-12-obsidian-smoke-plan.md` | Disposable vault and optional Obsidian GUI smoke prove human usability |
| 5 | `docs/superpowers/plans/2026-05-12-codex-openclaw-e2e-plan.md` | `new -> normalize -> board --write -> move -> reconcile -> run` works through agent execution gates |

## 5. Cross-Phase File Responsibility Map

### Likely Creates

- `packages/core/src/authoring/issue-factory.ts`: deterministic issue frontmatter/body creation for `kanban new`.
- `packages/core/src/authoring/normalize-issue.ts`: rough-note normalization without semantic invention.
- `packages/core/src/boards/obsidian-kanban-renderer.ts`: Obsidian Kanban markdown renderer.
- `packages/core/src/boards/dataview-index-renderer.ts`: Dataview dashboard renderer.
- `packages/core/src/boards/reconcile-board.ts`: board parser, diff model, conflict detection, and apply model.
- `packages/cli/src/commands/new.ts`: CLI surface for ticket creation.
- `packages/cli/src/commands/normalize.ts`: CLI surface for rough-note normalization.
- `packages/cli/src/commands/move.ts`: CLI surface for state-machine status changes.
- `packages/cli/src/commands/reconcile-board.ts`: CLI surface for board diff/apply.
- `packages/cli/tests/authoring.test.ts`: CLI integration tests for `new` and `normalize`.
- `packages/cli/tests/obsidian-board.test.ts`: CLI integration tests for board writing.
- `packages/cli/tests/move-reconcile.test.ts`: CLI integration tests for status movement and reconciliation.
- `docs/runbooks/obsidian-kanban-smoke.md`: human smoke-test runbook.

### Likely Modifies

- `packages/cli/src/index.ts`: register commands and help text.
- `packages/cli/src/vault.ts`: reduce CLI-owned parsing/rendering once core services own these contracts.
- `packages/core/src/index.ts`: export authoring and board/reconciliation services.
- `packages/core/src/store/registry.ts`: expose typed space/project path data needed by authoring and board write.
- `packages/core/src/store/markdown-store.ts`: reuse safe path resolution and issue traversal for command implementations.
- `packages/core/src/store/write-back.ts`: apply status and metadata changes through a narrow allowlist.
- `packages/core/src/boards/board-generator.ts`: keep or redirect existing renderer behavior without breaking current tests.
- `docs/kanban-runtime.md`: document new commands and runtime acceptance levels.
- `docs/deploy-checklist.md`: add Obsidian and reconciliation smoke gates.

## 6. Spec Gate

Before creating any child implementation plan:

- [ ] Review `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`.
- [ ] Resolve or explicitly defer the spec's open questions.
- [ ] Confirm `kanban new` write-by-default versus dry-run-only semantics.
- [ ] Confirm `normalize --write` path preservation versus registry-derived rename behavior.
- [ ] Confirm board card link format before renderer tests are written.
- [ ] Confirm placeholder-bearing issue readiness blocking mechanism.

Only after this gate is complete should Phase 1 planning begin.

## 7. Phase Gates

### Phase 1: `kanban new` and `kanban normalize`

**Goal:** A human can create a valid issue file with only a title and routing fields, or normalize a rough note into a schema-valid issue draft.

- [ ] Create the child plan for Phase 1 with TDD steps.
- [ ] Add failing tests for id allocation from registry `idPrefix` and existing issue files.
- [ ] Add failing tests for required frontmatter defaults.
- [ ] Add failing tests for deterministic rough-note normalization.
- [ ] Implement `kanban new` with dry-run by default unless the command contract explicitly chooses write-by-default.
- [ ] Implement `kanban normalize` with `--check`, `--write`, and conflict-safe behavior.
- [ ] Verify `TODO` issue creation never requires an LLM.

**Acceptance gate:**

```bash
pnpm --filter @kanban-task-engine/core test -- tests/sequence.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/authoring.test.ts
pnpm -r build
```

Runtime smoke:

```bash
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- new --space vibe-coding --project kanban-task-engine "Implement Obsidian board writer"
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- normalize issues/vibe-coding/kanban-task-engine/<created-file>.md --check
```

Expected runtime result:

- A new issue file exists under the registry-selected `issues/<space>/<project>/` path.
- The issue id uses the space id prefix and next available sequence.
- Required frontmatter is present.
- `normalize --check` reports no schema errors for the generated issue.

### Phase 2: `kanban board --write`

**Goal:** The CLI writes Obsidian Kanban and Dataview projection files that a human can open in Obsidian.

- [ ] Create the child plan for Phase 2 with Context7-confirmed plugin syntax.
- [ ] Add failing tests for `kanban-plugin: board` frontmatter.
- [ ] Add failing tests for status lanes `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`.
- [ ] Add failing tests for cards linking to issue files and carrying stable issue identifiers.
- [ ] Add failing tests for Dataview table/index output.
- [ ] Implement `kanban board --write --space <space>`.
- [ ] Implement `kanban board --write --all`.
- [ ] Preserve stdout behavior for read-only `kanban board`.

**Acceptance gate:**

```bash
pnpm --filter @kanban-task-engine/core test -- tests/board-generator.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/obsidian-board.test.ts
pnpm test:docs
```

Runtime smoke:

```bash
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- board --write --all
```

Expected runtime result:

- `boards/<space>.md` contains `kanban-plugin: board`.
- `boards/<space>.md` contains one lane per normalized status.
- Cards link to source issue files rather than duplicating issue bodies.
- `boards/<space>-epics.md` or the Dataview index can query frontmatter fields such as `status`, `priority`, `project`, `epic`, and `updated`.

### Phase 3: `kanban move` and `kanban reconcile-board`

**Goal:** CLI and Obsidian-originated movements can update issue status only through explicit validation.

- [ ] Create the child plan for Phase 3 with a conflict matrix.
- [ ] Add failing tests for legal state transitions.
- [ ] Add failing tests for illegal state transitions.
- [ ] Add failing tests for board movement diff detection.
- [ ] Add failing tests for stale board conflict detection.
- [ ] Implement `kanban move <issue-id> <status>`.
- [ ] Implement `kanban reconcile-board --dry-run`.
- [ ] Implement `kanban reconcile-board --apply` only after dry-run diff is deterministic.

**Acceptance gate:**

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/status.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/state-machine.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/move-reconcile.test.ts
pnpm -r test
```

Runtime smoke:

```bash
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- move VC-001 READY
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- reconcile-board --space vibe-coding --dry-run
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- reconcile-board --space vibe-coding --apply
```

Expected runtime result:

- Legal status changes update issue frontmatter and `updated`.
- Illegal status changes fail before write.
- Reconciliation reports exact issue id, old status, proposed status, and source board file.
- `--apply` refuses stale or ambiguous card movement.

### Phase 4: Obsidian Smoke

**Goal:** A person can use Obsidian Kanban and Dataview views over a generated vault without hand-editing machine-only files.

- [ ] Create the child plan for Phase 4 with file-level and GUI-level smoke paths.
- [ ] Generate a disposable vault with registry, issues, boards, and Dataview index.
- [ ] Confirm file-level Obsidian Kanban syntax and Dataview query syntax.
- [ ] Optionally use `computer-use` to open Obsidian and inspect the generated board/dashboard.
- [ ] Document manual smoke steps in `docs/runbooks/obsidian-kanban-smoke.md`.

**Acceptance gate:**

```bash
pnpm test:docs
pnpm docs:verify
```

Runtime smoke:

```bash
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- new --space vibe-coding --project kanban-task-engine "Smoke issue"
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- board --write --all
KANBAN_HOME=<disposable-vault> pnpm --filter @kanban-task-engine/cli start -- reconcile-board --space vibe-coding --dry-run
```

Expected runtime result:

- Obsidian Kanban plugin recognizes generated board files.
- Dataview can list issues from frontmatter fields.
- A human can identify the canonical issue note from a card.
- Board movement requires explicit reconciliation before issue frontmatter changes.

### Phase 5: Codex/OpenClaw Agent E2E

**Goal:** The LLM/agent runtime uses the completed Kanban control plane rather than compensating for missing authoring or board behavior.

- [ ] Create the child plan for Phase 5 after Phases 1-4 are green.
- [ ] Use a disposable or explicitly approved live-adjacent vault, not the engine repo, for issue state.
- [ ] Create an issue through `kanban new`.
- [ ] Move or normalize it to `READY` through deterministic CLI behavior.
- [ ] Run `kanban board --write`.
- [ ] Execute via `kanban run <id> --execute --agent codex` only after policy preflight passes.
- [ ] Confirm lifecycle convergence to `REVIEW` or `FAILED`.

**Acceptance gate:**

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm eval:hardening
pnpm eval:superpowers
```

Runtime smoke:

```bash
KANBAN_HOME=<approved-vault> pnpm --filter @kanban-task-engine/cli start -- new --space vibe-coding --project kanban-task-engine "Codex E2E smoke"
KANBAN_HOME=<approved-vault> pnpm --filter @kanban-task-engine/cli start -- move <issue-id> READY
KANBAN_HOME=<approved-vault> pnpm --filter @kanban-task-engine/cli start -- board --write --all
KANBAN_HOME=<approved-vault> pnpm --filter @kanban-task-engine/cli start -- run <issue-id> --execute --agent codex
```

Expected runtime result:

- The issue moves through the documented lifecycle.
- Agent execution writes run artifacts under the vault.
- No live issue state is written to the engine repo.
- No phase claims runtime completion from fixture-only tests.

## 8. Acceptance Level Labels

Every child phase report must use these labels:

| Label | Meaning |
| --- | --- |
| Code-level green | Unit/integration tests pass in repo fixtures. |
| Disposable vault green | Commands mutate a temporary vault correctly. |
| Live-adjacent vault green | Commands work against an approved real-layout vault without production mutation risk. |
| Obsidian file-shape green | Generated files match plugin-readable markdown/query syntax. |
| Obsidian GUI green | Obsidian itself displays and updates the generated views. |
| Agent E2E green | Codex/OpenClaw execution runs through the Kanban lifecycle. |

No response may collapse these levels into a single "done" claim.

## 9. Execution Rules

- Use an isolated worktree before implementation.
- Do not stage `.DS_Store`, `.pnpm-store/`, `.claude/`, `node_modules/`, generated vault artifacts, or Python `__pycache__`.
- Do not write live issue state into `~/Projects/kanban-task-engine`.
- Do not add an LLM dependency to `kanban new`, `kanban normalize`, `kanban board --write`, `kanban move`, or `kanban reconcile-board`.
- Do not make Obsidian board edits auto-run agents.
- Do not implement `reconcile-board --apply` before dry-run output is deterministic and tested.
- Do not move to Phase 5 until Phases 1-4 are verified at their required acceptance level.

## 10. Recommended Subagent Partition

Use this only after explicit user approval to dispatch agents.

| Worker | Write scope | Responsibility |
| --- | --- | --- |
| Worker A | `packages/core/src/authoring/**`, authoring tests | Issue factory, id allocation integration, rough-note normalization |
| Worker B | `packages/core/src/boards/**`, board tests | Obsidian Kanban renderer, Dataview renderer, board parser |
| Worker C | `packages/cli/src/commands/**`, CLI tests | CLI command surfaces and help text |
| Worker D | docs/runbooks and smoke scripts | Obsidian smoke runbook and disposable vault smoke harness |

Workers must not modify each other's write scopes without coordination. The parent agent reviews spec compliance and code quality between tasks.

## 11. Final Verification Set

Run this after each child phase unless the child phase narrows the command list further:

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm docs:verify
pnpm eval:hardening
pnpm eval:superpowers
git diff --check
```

Use `pnpm eval:hardening -- --strict-architecture` before claiming production runtime readiness.

## 12. Execution Handoff

Plan complete when this umbrella document and `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md` are reviewed. After the spec gate is resolved, choose one of two execution options:

1. **Subagent-Driven recommended:** dispatch fresh workers per child phase or disjoint subtask, then review before moving forward.
2. **Inline Execution:** execute child plans in this session using checkpointed TDD.

After spec review, start by creating the Phase 1 child plan. Do not start with Codex/OpenClaw E2E; it depends on a working LLM-free Kanban control plane.
