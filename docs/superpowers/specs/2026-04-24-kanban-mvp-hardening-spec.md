# Kanban MVP Hardening Spec

Date: 2026-04-24
Status: Index / umbrella spec
Repository: `~/Projects/kanban-task-engine`
Refines: `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`

## 1. Purpose

This spec indexes the GPT-5.5 Pro review into implementation-sized work units for `kanban-task-engine`.

It is not the complete implementation spec by itself. The detailed specs are:

- `docs/superpowers/specs/2026-04-24-kanban-contract-hardening-spec.md`
- `docs/superpowers/specs/2026-04-24-kanban-vault-store-spec.md`
- `docs/superpowers/specs/2026-04-24-kanban-cli-mvp-spec.md`
- `docs/superpowers/specs/2026-04-24-kanban-execution-harness-spec.md`
- `docs/superpowers/specs/2026-04-24-kanban-board-docs-spec.md`
- `docs/superpowers/specs/2026-04-24-kanban-adapter-hardening-spec.md`

The product direction remains:

```text
Markdown issue vault
  -> parsed issue document
  -> CanonicalTaskModel
  -> policy/state/runtime
  -> CLI/execution/adapters
```

The next milestone is not a broader kanban app. It is a working local control plane:

```text
create/inspect a vault
validate issues
render boards
explicitly run one READY issue
record REVIEW or FAILED
approve into DONE
leave audit artifacts
```

## 2. Review Verdict

The review is directionally correct and mostly actionable, but several points need re-baselining against the current code.

Already present and should be preserved:

- Markdown as the human-readable source of truth.
- Six normalized statuses: `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`.
- A `schema` package with constrained Markdown frontmatter and section parsing.
- A `core` package with `CanonicalTaskModel`, state machine, policy engine, runtime modules, board generation, and Markdown store.
- Adapter packages for CLI execution, Claude Code, OpenClaw, Jira, GitHub, and Firebase.
- Existing design/plan documents under `docs/superpowers/`.

Still needs hardening before expanding scope:

- Canonical model ownership is split between `packages/core/src/types.ts` and `packages/schema/src/issue-schema.ts`.
- `TaskRef` semantics are underspecified in code, especially `external_key` vs `external_id`.
- `MarkdownStore` does not yet use `WorkspaceResolver` for issue path resolution and only scans a shallow `issues/` directory.
- `findByExternalKey()` currently resolves by the namespace key, while many flows need lookup by actual issue id.
- Epic transition rules are specified in docs but not enforced by `StateMachine`.
- Recipe YAML is parsed, but there is no registry that resolves module names to actual `AutomationModule` instances.
- `adapter-openclaw` defines its own `ExecutionAdapter` contract instead of implementing the core contract.
- There is no user-facing `kanban` CLI package yet.

## 3. Scope Rules

The work is split by contract boundaries, not by aspirational feature area.

In scope for the next implementation sequence:

- Model/schema contract stabilization.
- Vault identity and path resolution.
- State/spec validation alignment.
- Inspection and board-rendering CLI MVP.
- Recipe-to-module wiring.
- Local execution harness with a fake executor test path first.
- Approval lifecycle after the run path is stable.
- README/docs cleanup after behavior is real.

Deferred:

- Web UI.
- Bidirectional Jira sync.
- GitHub Project V2 hardening beyond contract tests.
- Firebase realtime hardening beyond contract tests.
- Splitting new `vault` or `executor-*` packages before the CLI proves the boundary.
- Full OpenClaw execution as the primary MVP path.

## 4. Work Units

### KTE-M0-01: Canonical Contract Single Source

Priority: P0

Goal:
Make `CanonicalTaskModel` and canonical validation have one authoritative owner.

Decision:
Keep the canonical runtime model in `@kanban-task-engine/core` because all current adapters import `CanonicalTaskModel` from core. Keep `@kanban-task-engine/schema` focused on Markdown issue frontmatter, parsed issue sections, statuses, and parser validation.

Required contract:

- `packages/core/src/types.ts` remains the only exported `CanonicalTaskModel` definition.
- `packages/schema/src/issue-schema.ts` must not export a competing canonical model shape.
- Canonical validation moves to core or is expressed as a core-owned helper.
- `schema` may export `IssueFrontmatter`, `ParsedIssueMarkdown`, `IssueStatus`, `IssueTransition`, parser helpers, and fixture helpers.
- `core` owns Jira-compatible canonical values such as `Epic`, `Task`, `Bug`, `Blocker`, `High`, `Medium`, and adapter-facing `TaskRef`.

Acceptance criteria:

- A repo-wide search for `CanonicalIssueModel` has no production export.
- `packages/schema` builds without importing from `packages/core`.
- `packages/core` converts parsed Markdown into `CanonicalTaskModel` and validates that result through a core-owned helper.
- `pnpm test` and `pnpm build` pass across the whole workspace.

### KTE-M0-02: Task Identity and Vault Path Contract

Priority: P0

Goal:
Make issue lookup and file writes deterministic across local Markdown, GitHub, Jira, and Firebase sources.

Required `TaskRef` semantics:

```text
task_ref.provider      local | github | jira | firebase
task_ref.external_key  namespace within the provider
                       local: space or vault namespace
                       github: owner/repo
                       jira: project key
                       firebase: workspace or collection namespace
task_ref.external_id   actual issue id
                       local: VC-001
                       github: #123
                       jira: PROJ-42
                       firebase: document id
```

Required store API:

- `findByTaskRef(ref: TaskRef): Promise<CanonicalTaskModel | null>`
- `findByIssueId(issueId: string): Promise<CanonicalTaskModel | null>`
- `resolveIssuePath(ref: TaskRef): Promise<string>`
- Existing `findByExternalKey(provider, externalKey)` is deprecated and removed after internal callers migrate.

Required path behavior:

- Local Markdown lookup uses `external_id` for file identity.
- A local issue file name starts with `${external_id}`.
- `MarkdownStore` receives a `WorkspaceResolver` or registry-derived resolver instead of composing `workspace/issues` from `task.automation.workspace`.
- The store scans recursive paths under configured issue roots, including container-space project directories and `_epics/`.
- Writes are constrained to the resolved vault issue roots and must reject path traversal.

Acceptance criteria:

- `SyncCoordinator.syncFromProvider()` does not search local issues by provider namespace alone.
- `MarkdownStore.writeBack()` updates the file for the task's `external_id`, not the namespace key.
- Tests cover `issues/vibe-coding/kanban-task-engine/VC-001-title.md`, `issues/openclaw/OC-001-title.md`, and `issues/vibe-coding/_epics/VC-005-title.md`.
- Saving a task cannot write outside the configured vault root.

### KTE-M0-03: Spec, Validator, and State Machine Reconciliation

Priority: P0

Goal:
Make documented issue rules enforceable by parser and state transitions.

Required behavior:

- Non-epic issues require sections `목적`, `컨텍스트`, `Acceptance Criteria`, and `실행 힌트`.
- Epic issues require sections `목표`, `범위`, `성공 지표`, and `하위 티켓`.
- `로그` remains optional and append-only.
- Epics are not execution targets.
- Epic status transitions are restricted to `TODO -> DONE` in the MVP; reopening or editorial correction workflows are out of scope until they are separately specified.
- Epics cannot transition into `READY`, `RUNNING`, `REVIEW`, or `FAILED`.
- `READY -> RUNNING` is only an execution transition and must not be triggered by board rendering or plain validation.

Acceptance criteria:

- `StateMachine.transition()` rejects an Epic transition to `READY`, `RUNNING`, `REVIEW`, or `FAILED`.
- Parser tests prove type-specific required sections.
- Policy or validator tests prove a valid non-epic issue can move `TODO -> READY`, but an Epic cannot.
- Docs and tests use the same field names: `type`, `epic`, `created`, `updated`, `working_dir`, `merge_into`, `run_count`, `depends_on`, `completed`.

### KTE-M1-01: Inspection and Board CLI MVP

Priority: P1

Goal:
Create the first user-facing `kanban` CLI without execution, status-transition, merge, or external-adapter side effects.

Initial package:

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
```

Commands:

- `kanban doctor`
- `kanban doctor --json`
- `kanban validate`
- `kanban validate <issue-id>`
- `kanban render-board`
- `kanban render-board --check`

Required behavior:

- CLI resolves the vault from `--vault`, then `KANBAN_HOME`, then the documented Home vault default.
- `doctor` checks Node, pnpm, git, vault path, registry shape, issue roots, board roots, events/runtime directories, and optional Claude availability.
- `validate` parses issues through the same schema/core path as `MarkdownStore`.
- `render-board --check` exits nonzero when generated board output is stale.
- No command in this work unit starts an executor, changes issue status, merges branches, or invokes external adapters. `render-board` may write generated board files unless `--check` is used.

Acceptance criteria:

- `pnpm --filter @kanban-task-engine/cli test` covers command parsing and context resolution.
- `kanban --help` lists only inspection and board-rendering commands for this phase.
- `kanban validate` reports parse errors with file paths and does not throw raw YAML parser stacks.
- `kanban render-board --check` is deterministic in a fixture vault.

### KTE-M1-02: Recipe Module Registry

Priority: P1

Goal:
Turn recipe module names into concrete runtime modules with policy checks.

Required behavior:

- A registry maps a module name to a factory.
- Built-in modules include existing core modules: `manual-command-trigger`, `state-transition`, `audit-log`, and `git-checkpoint`.
- Read-only recipe names such as `parser` or `board-renderer` must either map to real modules or be removed from default recipes.
- Unknown recipe modules fail during assembly, not halfway through execution.
- Module factories receive explicit dependencies instead of reading global state.

Acceptance criteria:

- Loading `recipes/validate-only.yaml` assembles runnable modules or fails with a clear unknown-module error.
- Loading `recipes/home-assisted.yaml` fails clearly until executor modules are intentionally registered.
- Tests prove side-effect policies still block disallowed module execution after registry assembly.
- Recipes and module names are documented in one CLI-visible source.

### KTE-M2-01: Execution Harness Run MVP

Priority: P1

Goal:
Implement `kanban run <issue-id>` for local Markdown issues with lock, artifact, and fake-executor coverage before real Claude execution.

Required components:

- `LockManager`
- `WorktreeManager`
- `PromptAssembler`
- `CommandRunner` interface
- `FakeExecutor` for tests
- `ClaudeCodeExecutor` adapter after fake path is green
- `RunArtifactWriter`
- `IssueLogAppender`
- `StateTransitionService`

Required behavior:

- `kanban run <issue-id> --dry-run` resolves the issue, validates it, checks it is non-epic `READY`, prints the planned worktree/prompt/artifact paths, and writes nothing.
- `kanban run <issue-id>` acquires a lock, transitions `READY -> RUNNING`, creates artifacts under `runs/<date>/<issue-id>/`, invokes the executor, appends `로그`, writes an event, and transitions to `REVIEW` on success or `FAILED` on failure.
- Failed executor output is recorded without exposing credentials.
- Lock release happens on success, failure, and handled exceptions.

Acceptance criteria:

- E2E fixture test: fake success moves `READY -> REVIEW`.
- E2E fixture test: fake failure moves `READY -> FAILED`.
- E2E fixture test: non-READY issue is rejected before lock/worktree creation.
- E2E fixture test: Epic issue is rejected.
- Artifacts include prompt, stdout, stderr, metadata JSON, and final status.

### KTE-M2-02: Approval Lifecycle

Priority: P1

Goal:
Implement the human approval and recovery commands after run behavior is stable.

Commands:

- `kanban approve <issue-id>`
- `kanban abort <issue-id>`
- `kanban retry <issue-id>`

Required behavior:

- `approve` only accepts `REVIEW`.
- `approve` performs an ff-only merge by default when a worktree branch exists.
- `approve` writes `completed`, appends `로그`, records an event, transitions `REVIEW -> DONE`, and cleans up the worktree if cleanup policy allows.
- `abort` moves `REVIEW` or `FAILED` back to `READY` without destructive cleanup by default.
- `retry` moves `REVIEW` or `FAILED` back to `READY`; destructive cleanup of prior run/worktree state requires a clear command flag.

Acceptance criteria:

- Tests cover approved success, non-ff merge rejection, abort from `FAILED`, retry cleanup guard, and missing worktree metadata.
- `DONE` issues cannot be approved again.
- All commands emit machine-readable JSON with `--json`.

### KTE-M3-01: Registry-Aware Board and Epic Index

Priority: P2

Goal:
Move board generation from flat issue lists to registry-aware space/project aggregation.

Required behavior:

- Read `registry.yaml`.
- Generate one board per space.
- Generate one Epic index per space.
- Exclude Epics from Kanban board cards.
- Include broken link and stale board checks.
- Count issues by status and Epic.

Acceptance criteria:

- Fixture vault includes at least one single space and one container space.
- Board output links use relative paths from the board file.
- Epic index shows child counts by status.
- `render-board --check` fails when generated output differs.

### KTE-M3-02: Documentation and Example Vault Cleanup

Priority: P2

Goal:
Make the repo explain the real project shape without implying a generic web kanban app or unsupported runtime behavior.

Required docs:

- Root `README.md`
- `docs/getting-started.md`
- `docs/architecture.md`
- `docs/schema.md`
- `docs/vault-layout.md`
- `docs/cli.md`
- `docs/execution-harness.md`
- `docs/adapters/*.md` only for adapters that have tested behavior
- `examples/minimal-vault/`

Required README sections:

- What this is.
- What this is not.
- Five-minute local inspection quick start.
- Core concepts.
- Current implementation status.
- Roadmap.

Acceptance criteria:

- README explicitly says this is not a Trello clone, not a general web kanban UI, and not Jira bidirectional sync.
- Quick start only lists commands that exist.
- Docs do not claim `kanban run` exists until KTE-M2-01 is implemented.
- Existing stale implementation plans are marked as historical or superseded when this spec replaces their scope.

### KTE-M4-01: External Adapter Contract Hardening

Priority: P2, after local CLI/harness is usable

Goal:
Make external adapters implement core contracts consistently.

Required behavior:

- `adapter-openclaw` implements the core `ExecutionAdapter` shape or exposes an explicit wrapper that does.
- OpenClaw request metadata uses `task_ref.external_id` as ticket id and `task_ref.external_key` as namespace.
- `WorkStateProvider.fetchTask()` and `pushStatus()` accept an explicit task reference or unambiguous id contract.
- GitHub/Jira/Firebase mappers preserve the same `TaskRef` semantics defined in KTE-M0-02.

Acceptance criteria:

- Contract tests run the same adapter conformance suite against CLI, Claude Code, OpenClaw, Jira/GitHub status mappers, and Firebase mapper where applicable.
- No adapter redefines a conflicting interface with the same name as a core interface.
- Full workspace build catches contract drift.

## 5. Recommended Execution Order

```text
M0 Contract hardening
  1. KTE-M0-01 Canonical Contract Single Source
  2. KTE-M0-02 Task Identity and Vault Path Contract
  3. KTE-M0-03 Spec, Validator, and State Machine Reconciliation

M1 Inspection and board local CLI
  4. KTE-M1-01 Inspection and Board CLI MVP
  5. KTE-M1-02 Recipe Module Registry

M2 Local execution
  6. KTE-M2-01 Execution Harness Run MVP
  7. KTE-M2-02 Approval Lifecycle

M3 Productization
  8. KTE-M3-01 Registry-Aware Board and Epic Index
  9. KTE-M3-02 Documentation and Example Vault Cleanup

M4 Adapter hardening
  10. KTE-M4-01 External Adapter Contract Hardening
```

## 6. Validation Policy

Every implementation unit that touches `schema`, `core`, or shared adapter contracts must run:

```bash
pnpm test
pnpm build
```

Package-local tests are not sufficient for contract changes because status/model drift can break downstream adapters.

Every CLI or harness unit must include:

- Unit tests for pure parsing/resolution logic.
- Fixture-vault tests for file behavior.
- At least one failure-path test.
- A command help or CLI invocation smoke test.

## 7. Non-Regression Rules

- Markdown remains the source of truth.
- Canonical JSON remains internal/generated state.
- Card movement is not execution.
- `READY -> RUNNING` requires an explicit run command or a recipe policy that is explicitly enabled.
- Work mode remains Jira-export-oriented and does not gain OpenClaw automation in this milestone.
- Live issue state must not be stored in the engine repository.
