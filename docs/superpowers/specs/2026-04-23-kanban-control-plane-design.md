# Kanban Control Plane Design

Date: 2026-04-23
Status: Draft for review
Repository: `~/Projects/kanban-task-engine`

## 1. Summary

The kanban system uses Markdown issue documents as the shared operational control plane. The same issue schema is used in Home and Work environments, but the automation policy and external adapters differ by environment.

Home uses OpenClaw automation and may allow automated issue transitions, execution, indexing, rendering, and checkpoints. Work uses the same Markdown schema and engine, but avoids OpenClaw and bidirectional external content sync. Work exports to Atlassian/Jira through a one-way adapter and may write selected export metadata back into Markdown when policy permits.

The final layout separates three concerns:

```text
~/.openclaw/workspace-kanban/
  Kanban operator workspace for Home automation.

~/.openclaw/workspace-kanban/kanban/
  Home Markdown issue vault and control plane.
  Standalone git repository, not a submodule.

~/Projects/kanban-task-engine/
  Shared engine, schema, canonical model, modules, adapters, tests, and default recipes.
```

## 2. Goals

- Keep Markdown issue files as the only human-readable source of truth.
- Let both humans and automation update the same Markdown control plane when policy permits.
- Keep Home and Work compatible through a shared schema and engine.
- Limit Work external integration to Atlassian/Jira export.
- Make automation composable through small modules and environment recipes.
- Keep issue state out of the engine code repository.
- Keep the Home issue vault close to its OpenClaw operator workspace for easy relative-path access.
- Manage the Home issue vault as a standalone git repository, not a submodule.

## 3. Non-Goals

- Do not store live issue state in `~/Projects/kanban-task-engine/issues`.
- Do not use Jira as the document source of truth.
- Do not build bidirectional Jira sync.
- Do not make card movement automatically imply execution in every mode.
- Do not share the Home vault with Work.
- Do not use Firebase, iCloud, or mobile sync in Work mode.
- Do not make `workspace-kanban/kanban` a git submodule of `workspace-kanban`.

## 4. Core Principles

1. Markdown is the operational source of truth.
2. Canonical JSON is an internal contract, not a human editing surface.
3. The canonical model is Jira-compatible by design.
4. Home and Work use the same schema and parser.
5. Home and Work differ by adapters, policies, and recipes.
6. Automation is built from small modules that can be enabled, disabled, and reordered.
7. Issue transition and execution are separate concepts.

## 5. Terminology

Issue:
The primary work item. This is the preferred term because the canonical model references Jira semantics.

Task:
Either an issue type or an implementation checklist item inside an issue.

Board:
A view or aggregation over issues.

Project:
A Jira project, local code project, or logical project folder under a workspace/space.

Space:
A high-level operating area such as `openclaw`, `vibe-coding`, `stocks`, `web`, `personal`, or `career`.

Vault:
A Markdown directory tree containing issue documents, boards, templates, and local control-plane state.

Operator workspace:
The OpenClaw workspace that runs automation against a vault.

## 6. Directory Layout

### 6.1 Home Operator Workspace

```text
~/.openclaw/workspace-kanban/
├── AGENTS.md
├── SOUL.md
├── USER.md
├── MEMORY.md
├── memory/
├── HEARTBEAT.md
├── config/
│   ├── active-recipe.yaml
│   ├── module-overrides.yaml
│   └── kanban-home.yaml
├── runs/
│   └── YYYY-MM-DD/
└── kanban/
    └── standalone issue vault
```

`workspace-kanban` owns automation context, memory, heartbeat behavior, execution logs, and active local configuration. It does not directly own the Markdown issue schema or engine implementation.

### 6.2 Home Issue Vault

```text
~/.openclaw/workspace-kanban/kanban/
├── .git/
├── README.md
├── KANBAN.md
├── registry.yaml
├── issues/
│   ├── openclaw/
│   ├── vibe-coding/
│   │   ├── ai-cli-orch-wrapper/
│   │   ├── kanban-task-engine/
│   │   ├── cc-openclaw-harness/
│   │   └── flow-weaver/
│   ├── stocks/
│   ├── web/
│   ├── personal/
│   └── career/
├── boards/
│   ├── openclaw.md
│   ├── vibe-coding.md
│   ├── stocks.md
│   ├── web.md
│   ├── personal.md
│   └── career.md
├── templates/
├── events/
├── canonical/
├── exports/
├── archive/
└── runtime/
```

The vault is a standalone git repository. `workspace-kanban/.gitignore` ignores `/kanban/` so the parent workspace does not track the vault as a submodule or nested working tree.

Home vaults do not define core schema extensions. The shared schema lives in the engine repository. Vault-local files may provide display hints, local labels, or non-breaking validation preferences, but they must not change required fields, status semantics, canonical JSON shape, or adapter contracts.

### 6.3 Engine Repository

```text
~/Projects/kanban-task-engine/
├── packages/
│   ├── core/
│   ├── schema/
│   ├── adapter-openclaw/
│   ├── adapter-claude-code/
│   ├── adapter-jira/
│   └── adapter-cli/
├── recipes/
│   ├── home-assisted.yaml
│   ├── home-full-auto.yaml
│   ├── work-jira-export.yaml
│   └── validate-only.yaml
├── templates/
├── docs/
├── config/
└── scripts/
```

The engine repository stores reusable code, shared schema, default templates, default recipes, tests, and migration utilities. It does not store live issue state.

### 6.4 Work Vault

Work uses a separate local vault on the work machine. The exact path is environment-specific.

```text
<work-local-vault>/
├── issues/
├── boards/
├── templates/
├── canonical/
├── exports/
└── runtime/
```

Work uses the same schema and engine, but its policy disables OpenClaw execution and external sync except Atlassian/Jira export.

## 7. Git Policy

### 7.1 Engine Repository

Tracked:

- Engine source code
- Shared schema
- Tests
- Default recipes
- Default templates
- Documentation
- Migration scripts

Ignored:

- Live issue state
- Runtime queues
- Generated canonical output
- Local secrets

### 7.2 Home Operator Workspace

Tracked:

- Workspace identity and instructions
- Automation memory and daily notes when appropriate
- Local operator configuration that is safe to keep

Ignored:

- `/kanban/`
- Runtime logs that should not enter long-term memory
- Local credentials or tokens

### 7.3 Home Issue Vault

Tracked:

- `issues/**/*.md`
- `boards/**/*.md`
- `templates/**/*.md`
- `README.md`
- `KANBAN.md`
- `registry.yaml`
- non-secret policy metadata if placed in the vault

Ignored:

- `runtime/`
- `canonical/generated/`
- `exports/tmp/`
- lock files
- caches

Events:

- Home may track `events/*.jsonl` for auditability.
- Events should be rotated by month or by size.
- Work should ignore events by default unless the local policy explicitly permits them.

## 8. Markdown Issue Schema

The Markdown issue document is the control-plane document. It is edited by humans, OpenClaw, or other automation depending on policy.

Example:

```markdown
---
id: issue-auth-refresh-001
title: 토큰 갱신 플로우 개선
issueType: story
project: auth-platform
parent: board-auth-platform
status: READY
priority: high
labels:
  - auth
  - backend
executor: claude-code
syncTarget: jira
jiraProject: AUTH
jiraKey:
createdAt: 2026-04-20
updatedAt: 2026-04-20
automation:
  trigger: manual
  allowedActions:
    - transitionIssue
    - startExecution
    - writeExecutionLog
---

## Goal

만료 직전 access token 자동 갱신 처리.

## Acceptance Criteria

- refresh token이 유효하면 access token 재발급
- 만료 또는 위조 refresh token은 401 반환
- 기존 로그인 플로우 회귀 없음

## Implementation Tasks

- [ ] refresh token 검증 로직 추가
- [ ] 재발급 API 테스트 작성
- [ ] 예외 응답 스키마 정리

## Notes

...

## Execution Log

...
```

Required frontmatter fields:

- `id`
- `title`
- `issueType`
- `project`
- `status`
- `priority`
- `createdAt`
- `updatedAt`

Optional frontmatter fields:

- `parent`
- `labels`
- `executor`
- `syncTarget`
- `jiraProject`
- `jiraKey`
- `automation`

Required Markdown sections:

- `Goal`
- `Acceptance Criteria`
- `Implementation Tasks`
- `Notes`

Optional Markdown sections:

- `Execution Log`
- `Links`
- `Decisions`
- `Review Notes`

The parser only supports the constrained template. Free-form documents are allowed elsewhere in the vault, but they are not parsed as issues unless they match the schema.

## 9. Status Model

The shared status model is:

```text
TODO
READY
RUNNING
REVIEW
DONE
FAILED
```

Semantics:

- `TODO`: not ready for execution.
- `READY`: sufficiently specified and eligible for execution.
- `RUNNING`: execution is active.
- `REVIEW`: execution produced output and needs review.
- `DONE`: accepted and complete.
- `FAILED`: execution failed or needs retry/triage.

Jira mapping is adapter-specific:

```text
TODO    -> Backlog or To Do
READY   -> Ready or Selected for Development
RUNNING -> In Progress
REVIEW  -> In Review
DONE    -> Done
FAILED  -> Blocked, Failed, or a custom status
```

## 10. Canonical JSON

Canonical JSON remains useful, but it is not the source of truth.

Role:

- Parser output
- Schema validation target
- Adapter input
- Audit/debug artifact
- Stable internal contract

Non-role:

- Human editing surface
- Primary GUI representation
- Long-term document source of truth

Pipeline:

```text
Markdown issue
  -> Markdown/frontmatter/template validation
  -> parser
  -> canonical JSON
  -> canonical schema validation
  -> adapter or automation module
```

The canonical model is Jira-compatible, so naming and field structure should preserve Jira concepts where useful.

## 11. Automation Model

Automation is a set of small modules assembled into recipes.

Candidate modules:

- `parser`
- `validator`
- `state-transition`
- `watcher`
- `manual-command-trigger`
- `board-sync`
- `openclaw-executor`
- `claude-code-executor`
- `jira-exporter`
- `jira-key-sync`
- `mempalace-indexer`
- `qmd-renderer`
- `git-checkpoint`
- `audit-log`

Each module must have:

- Clear input contract
- Clear output contract
- Explicit side effects
- Policy checks before writes or external actions
- Structured error output
- Test coverage for its contract

Recipes define which modules run, in what order, under which policy.

Example Home assisted recipe:

```yaml
mode: home-assisted
vaultPath: ~/.openclaw/workspace-kanban/kanban
modules:
  - watcher
  - parser
  - validator
  - manual-command-trigger
  - state-transition
  - claude-code-executor
  - audit-log
  - git-checkpoint
policy:
  automationCanMoveIssues: true
  automationCanStartExecution: true
  executionRequiresExplicitCommand: true
```

Example Work Jira export recipe:

```yaml
mode: work-jira-export
modules:
  - parser
  - validator
  - jira-exporter
  - jira-key-sync
policy:
  automationCanMoveIssues: false
  automationCanStartExecution: false
  externalSync: atlassian-only
  writeBack:
    allowedFields:
      - jiraKey
      - exportedAt
      - jiraStatus
```

## 12. Trigger Model

Issue status movement and execution are separate.

Recommended Home flow:

```text
1. Issue is created.
2. Issue reaches READY.
3. A human or allowed automation issues an explicit Run command.
4. Automation changes READY -> RUNNING.
5. Executor starts OpenClaw or Claude Code.
6. Result is written to Execution Log.
7. Automation changes RUNNING -> REVIEW or FAILED.
8. Human or policy-approved automation changes REVIEW -> DONE.
```

This avoids the earlier overly strong rule where moving a card to a work column immediately started execution.

Modes may later allow stronger behavior, such as "auto-run READY issues for selected spaces", but that must be expressed as a recipe/policy change rather than hardcoded into the engine.

## 13. Home Mode

Home uses:

- Obsidian as visual UI and editing surface
- OpenClaw as orchestrator
- Claude Code as an execution backend when selected
- mempalace for indexing
- qmd for rendering
- optional git/iCloud/mobile sync where safe

Home allows:

- OpenClaw issue transitions when policy permits
- OpenClaw execution triggers when policy permits
- Claude Code session creation when explicitly commanded or recipe-approved
- Git checkpoints of vault state
- Event audit logs

Home forbids by default:

- Silent execution from mere card movement
- External write-back without policy
- Editing canonical JSON as SoT

## 14. Work Mode

Work uses:

- Local Markdown vault
- Same schema and parser
- Local Obsidian if allowed
- Jira adapter through Atlassian-approved tooling

Work allows:

- Markdown to Jira one-way export
- Controlled local metadata write-back to Markdown if policy allows
- Local validation

Work forbids:

- OpenClaw execution
- Firebase
- Mobile real-time sync
- iCloud/Git sync unless explicitly permitted by company policy
- Jira-to-Markdown bidirectional content sync
- Jira as document SoT

Work separation:

```text
Document SoT: Markdown
Operational SoR: Jira
```

Allowed Work write-back is limited to local Markdown metadata fields that record export results, such as `jiraKey`, `jiraStatus`, and `exportedAt`. Jira must not rewrite Goal, Acceptance Criteria, Implementation Tasks, Notes, or other document body sections.

## 15. Registry

The vault registry maps spaces and projects.

Example:

```yaml
spaces:
  openclaw:
    type: single
    issues: issues/openclaw
    board: boards/openclaw.md
  vibe-coding:
    type: container
    issues: issues/vibe-coding
    board: boards/vibe-coding.md
    projects:
      ai-cli-orch-wrapper:
        path: issues/vibe-coding/ai-cli-orch-wrapper
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
      cc-openclaw-harness:
        path: issues/vibe-coding/cc-openclaw-harness
      flow-weaver:
        path: issues/vibe-coding/flow-weaver
  stocks:
    type: single
    issues: issues/stocks
    board: boards/stocks.md
  web:
    type: single
    issues: issues/web
    board: boards/web.md
  personal:
    type: single
    issues: issues/personal
    board: boards/personal.md
  career:
    type: single
    issues: issues/career
    board: boards/career.md
```

## 16. Migration Strategy

Current state:

- `~/.openclaw/kanban` exists and contains `KANBAN.md`, `registry.yaml`, and `spaces/`.
- `~/Projects/kanban-task-engine/config/workspaces.json` still points at `~/Projects/kanban-task-engine/issues`.
- `~/Projects/kanban-task-engine/issues` exists only as a placeholder.
- Existing v2 docs describe a now-outdated layout with live state inside the engine repo.

Target state:

- Create `~/.openclaw/workspace-kanban`.
- Move or copy current `~/.openclaw/kanban` into `~/.openclaw/workspace-kanban/kanban`.
- Initialize `workspace-kanban/kanban` as standalone git repository.
- Ignore `/kanban/` from `workspace-kanban`.
- Preserve compatibility for existing `~/.openclaw/kanban` references during migration by creating a temporary symlink or by updating all known references before moving the directory.
- Update engine defaults to use `KANBAN_HOME` and default to `~/.openclaw/workspace-kanban/kanban`.
- Retire engine-repo `issues/` as live state.
- Preserve old design notes as historical docs, but supersede them with this spec.

## 17. Implementation Slices

Each slice should become its own implementation plan and verification loop.

### Slice 0: Repository and Safety Baseline

Purpose:
Record current repo states, protect unrelated changes, and establish safe migration checkpoints.

Scope:

- Inspect `~/.openclaw`, `workspace-vibe-coding`, and `kanban-task-engine` git states.
- Identify existing untracked design files.
- Decide whether to commit, archive, or leave existing untracked files.
- Create snapshots before moving state.

Exit criteria:

- There is a written list of dirty/untracked files.
- No unrelated user changes are overwritten.
- Migration can be rolled back manually.

### Slice 1: Create `workspace-kanban`

Purpose:
Create the operator workspace shell.

Scope:

- Create `~/.openclaw/workspace-kanban`.
- Add `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, and `memory/`.
- Add `config/active-recipe.yaml`, `config/module-overrides.yaml`, and `config/kanban-home.yaml`.
- Add `.gitignore` that ignores `/kanban/` and runtime artifacts.
- Initialize `workspace-kanban` using the same standalone workspace repository pattern as the other OpenClaw workspaces. The parent `.openclaw` repository may track it as a workspace entry or submodule pointer according to existing OpenClaw conventions, but must not track `workspace-kanban/kanban`.

Exit criteria:

- OpenClaw can enter `workspace-kanban` and know it is the kanban operator.
- `kanban/` is ignored by the operator workspace repo.
- The parent `.openclaw` repository does not recursively track `workspace-kanban/kanban`.

### Slice 2: Move Home Vault

Purpose:
Move the Home issue control plane into the operator workspace.

Scope:

- Move `~/.openclaw/kanban` to `~/.openclaw/workspace-kanban/kanban`.
- Initialize `workspace-kanban/kanban` as standalone git repo.
- Create the target directory skeleton.
- Preserve existing `KANBAN.md`, `registry.yaml`, and `spaces/` content.
- Keep existing `spaces/` as legacy read-only migration input.
- Create `boards/` as the new generated view directory.
- Do not delete or rename `spaces/` until board generation and compatibility are implemented.

Exit criteria:

- `git -C ~/.openclaw/workspace-kanban/kanban rev-parse --show-toplevel` resolves to the vault.
- `workspace-kanban` parent git does not track the nested vault.
- Obsidian can open `workspace-kanban/kanban` as the Home vault.
- Existing references to `~/.openclaw/kanban` either still work through a temporary symlink or have been updated.

### Slice 3: Schema Package

Purpose:
Extract and formalize the shared issue schema.

Scope:

- Add `packages/schema`.
- Define Markdown frontmatter schema.
- Define canonical JSON schema.
- Define status model.
- Define Jira-compatible field names and mappings.
- Add schema tests and fixture documents.

Exit criteria:

- Valid issue fixtures pass validation.
- Invalid issue fixtures fail with clear messages.
- Home and Work can share the same schema package.

### Slice 4: Engine Path Configuration

Purpose:
Stop assuming live state is inside the engine repository.

Scope:

- Introduce `KANBAN_HOME`.
- Default Home path to `~/.openclaw/workspace-kanban/kanban`.
- Update `config/workspaces.json` or replace it with environment-aware config.
- Update `path-validator.ts`.
- Keep path traversal protections.
- Add tests for Home path, Work path, and rejected paths.

Exit criteria:

- Engine reads issues from configured vault path.
- Engine no longer defaults to `~/Projects/kanban-task-engine/issues`.
- Path validation still blocks traversal.

### Slice 5: Markdown Parser and Canonical Contract

Purpose:
Make Markdown issue files the input and canonical JSON the internal contract.

Scope:

- Parse frontmatter and required sections.
- Convert to canonical JSON.
- Preserve body sections where needed.
- Reject unsupported or malformed Markdown issue documents.
- Add fixture-based tests.

Exit criteria:

- Markdown -> canonical conversion is deterministic.
- Required sections are enforced.
- Canonical output is Jira-compatible.

### Slice 6: Registry and Workspace Resolver

Purpose:
Resolve spaces, projects, boards, and issue paths from `registry.yaml`.

Scope:

- Parse vault registry.
- Support single-space and container-space layouts.
- Support `vibe-coding/<project>` issue paths.
- Add tests for all current spaces.

Exit criteria:

- All Home spaces resolve correctly.
- Project container paths resolve correctly.
- Missing projects produce actionable errors.

### Slice 7: Module Runtime Contracts

Purpose:
Define the composable automation module interface.

Scope:

- Define module input/output shape.
- Define module side-effect declarations.
- Define policy gates.
- Define structured errors.
- Add module runner tests.

Exit criteria:

- A module can be composed into a recipe.
- A module cannot perform a disallowed side effect without policy approval.
- Module failures are logged in a consistent format.

### Slice 8: Recipe and Policy Loader

Purpose:
Load default recipes from the engine repo and active overrides from the operator workspace.

Scope:

- Add default recipes under `~/Projects/kanban-task-engine/recipes`.
- Load active recipe from `workspace-kanban/config/active-recipe.yaml`.
- Apply overrides from `module-overrides.yaml`.
- Validate recipe schema.

Exit criteria:

- `home-assisted`, `home-full-auto`, `work-jira-export`, and `validate-only` recipes validate.
- Operator workspace can select an active recipe without editing engine code.

### Slice 9: Home Execution Modules

Purpose:
Enable Home automation without hardcoding one workflow.

Scope:

- Implement watcher.
- Implement manual command trigger.
- Implement state transition module.
- Implement OpenClaw executor.
- Implement Claude Code executor.
- Implement audit log.
- Implement git checkpoint.

Exit criteria:

- A READY issue can be explicitly run.
- Automation moves it to RUNNING.
- Execution result updates Execution Log.
- Issue moves to REVIEW or FAILED.
- Events are logged.

### Slice 10: Board Generation and Obsidian Integration

Purpose:
Keep Obsidian useful without making it the engine.

Scope:

- Generate board Markdown from issues.
- Read existing `spaces/` files as legacy migration input only.
- Generate new board Markdown under `boards/`.
- Keep generated board files clearly marked as generated.
- Avoid treating generated board files as SoT unless explicitly designed later.
- Support Dataview/Kanban-friendly output.

Exit criteria:

- Boards reflect issue status.
- Issue documents remain the SoT.
- Generated files are clearly marked if generated.
- `spaces/` is not deleted until an explicit cleanup slice verifies no references remain.

### Slice 11: Work/Jira Adapter

Purpose:
Support the Work mode with Atlassian-only external integration.

Scope:

- Implement Jira export from canonical JSON.
- Implement Jira create/update.
- Implement optional `jiraKey` and export metadata write-back.
- Prevent bidirectional content sync.
- Add dry-run mode.

Exit criteria:

- Markdown issue can be exported to Jira payload.
- Jira metadata can be written back to explicitly allowed Markdown frontmatter fields if policy allows.
- Work recipe does not invoke OpenClaw or Claude Code.

### Slice 12: Migration Cleanup

Purpose:
Remove outdated assumptions after the new path works.

Scope:

- Update old docs or mark them superseded.
- Remove or deprecate `~/Projects/kanban-task-engine/issues` as live state.
- Update README and developer instructions.
- Add migration notes.

Exit criteria:

- New contributors can find the correct vault, operator workspace, and engine repo.
- Old engine-repo state path is not used by default.

## 18. Testing Strategy

Unit tests:

- Schema validation
- Markdown parsing
- Canonical conversion
- Status transitions
- Registry resolution
- Path validation
- Recipe validation
- Module policy gates

Integration tests:

- Parse a real vault fixture.
- Run validate-only recipe.
- Run Home assisted recipe in dry-run.
- Generate boards from fixtures.
- Export Jira payload in dry-run.

Manual verification:

- Open Home vault in Obsidian.
- Move/edit a sample issue.
- Run validation.
- Run explicit execution in dry-run first.
- Confirm git status in operator workspace and vault are separate.

## 19. Risks and Mitigations

Risk: Parent workspace accidentally tracks the nested vault.
Mitigation: Ignore `/kanban/` in `workspace-kanban/.gitignore` before creating or moving the vault.

Risk: Automation silently starts execution from a card move.
Mitigation: Keep execution behind explicit command by default. Stronger automation must be opt-in recipe behavior.

Risk: Work policy accidentally enables Home automation modules.
Mitigation: Validate recipes and enforce adapter allowlists.

Risk: Generated canonical JSON is mistaken for SoT.
Mitigation: Place generated output under ignored paths and document Markdown as SoT.

Risk: Events grow without bound.
Mitigation: Rotate events monthly or by size.

Risk: Existing old design docs conflict with the new spec.
Mitigation: Mark the new spec as superseding the older engine-repo `issues/` design.

Risk: Moving `~/.openclaw/kanban` breaks existing references.
Mitigation: Maintain a temporary compatibility symlink or update all known references before the move.

## 20. Acceptance Criteria

The architecture is accepted when:

- The Home vault location is `~/.openclaw/workspace-kanban/kanban`.
- The Home vault is a standalone git repo.
- `workspace-kanban` ignores the nested vault.
- Live issue state is not stored in the engine repo.
- The engine defaults to configurable vault paths.
- Markdown issue documents are the SoT.
- Canonical JSON is generated/internal.
- Home and Work share schema and engine packages.
- Home and Work use different recipes and adapters.
- Work integration is Atlassian/Jira-only.
- Implementation can proceed slice by slice from this document.

## 21. Open Decisions

1. Whether Home tracks `events/*.jsonl` by default or only in debug mode.
2. Whether `canonical/` should ever be committed for audit snapshots, or always ignored as generated state.
3. Whether first implementation should update engine path configuration before moving the vault, or move with a temporary compatibility symlink.

## 22. Recommended First Implementation Plan

Start with slices 0 through 4:

1. Repository and safety baseline
2. Create `workspace-kanban`
3. Move Home vault
4. Add shared schema package skeleton
5. Update engine path configuration

This gives the system the correct physical boundaries before deeper automation work begins.
