# Kanban Authoring New Normalize Spec

날짜: 2026-05-12
상태: Proposed
저장소: `~/Projects/kanban-task-engine`
Phase: 1 of `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`

## 1. 목적

이 문서는 Phase 1 범위인 `kanban new`와 `kanban normalize`의 정본 계약을 정의한다. 목표는 LLM 없이도 사람이 CLI와 Markdown editor만으로 새 ticket을 만들고, rough note를 schema-valid issue draft로 승격할 수 있게 하는 것이다.

이 spec은 implementation plan보다 먼저 존재해야 하며, plan은 이 문서의 command contract, path safety, normalization, test strategy, documentation, deploy readiness 조건을 구현 단위로 풀어야 한다.

## 2. 상위 문서

- `docs/superpowers/specs/2026-05-12-obsidian-cli-control-plane-spec.md`
- `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`
- `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`
- `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- `docs/kanban-runtime.md`
- `docs/deploy-checklist.md`

## 3. 하네스와 스킬 적용

| Area | Harness | Required use |
| --- | --- | --- |
| Architecture | `architecture`, `system-design` | Decide where authoring belongs, how source-of-truth and vault path safety work, and which alternatives are rejected. |
| Testing | `testing-strategy`, `superpowers:test-driven-development` | Define unit, integration, CLI, disposable-vault, and docs tests before implementation. |
| Documentation | `documentation` | Update runtime docs and command examples as part of the implementation plan. |
| Deploy readiness | `deploy-checklist` | Add pre-merge and runtime-smoke gates for new authoring commands. |
| Tech debt | `tech-debt` | Avoid duplicating CLI-local parsing and path logic; keep authoring logic in core services. |
| External docs | `context7` | Use for current test runner/package behavior when implementation touches package APIs. Vitest one-shot runs must use `vitest run` or equivalent. |
| Planning | `superpowers:writing-plans` | Produce the child implementation plan after this spec is reviewed. |
| Execution | `superpowers:subagent-driven-development` | Use after the plan is reviewed and accepted. |

## 4. Problem Statement

현재 CLI에는 `run`, `next`, `approve`, `abort`, `retry`, `recover-run`, `sync`, `board`만 있다. 사람이 새 ticket을 만들려면 ID, file path, frontmatter, required sections를 직접 작성해야 한다. 또한 rough note를 formal issue로 보정하는 deterministic path가 없어, LLM authoring assistant가 없으면 issue 생성 UX가 불완전하다.

Phase 1은 다음 두 명령만 다룬다.

- `kanban new`: 새 issue/ticket 생성.
- `kanban normalize`: rough Markdown note를 formal issue draft로 보정.

Board projection, status move, board reconciliation, Obsidian GUI smoke, Codex/OpenClaw E2E는 후속 phase다.

## 5. Goals

1. `kanban new`는 registry를 기준으로 issue id를 자동 채번하고 canonical path에 issue file을 생성한다.
2. `kanban normalize`는 rough note를 deterministic하게 formal issue shape로 변환한다.
3. 두 명령 모두 LLM 없이 동작한다.
4. core package가 authoring logic을 소유하고 CLI는 thin facade로 남는다.
5. 모든 write는 vault path containment, no-overwrite, registry validation을 통과해야 한다.
6. generated issue는 schema-valid Markdown shape를 갖는다.
7. placeholder가 남은 issue는 formal draft일 수는 있지만 machine execution readiness로 오인되지 않는다.
8. runtime docs와 deploy checklist가 새 command와 smoke gate를 반영한다.

## 6. Non-Goals

- Obsidian board generation.
- `kanban move`.
- `kanban reconcile-board`.
- Agent execution.
- Custom Obsidian plugin.
- LLM-assisted filling of missing semantic fields.
- Deleting, archiving, or moving original rough notes outside the explicit Phase 1 contract.
- Jira/Firebase/OpenClaw adapter behavior changes.

## 7. Architecture Decision Record

### ADR-001: Core owns authoring, CLI is a facade

**Status:** Proposed
**Date:** 2026-05-12
**Deciders:** User, Codex

#### Context

`packages/cli/src/vault.ts` already contains CLI-local registry traversal and board rendering. Adding authoring logic there would make future `board`, `move`, and `reconcile-board` behavior harder to keep consistent.

#### Decision

Create authoring services under `packages/core/src/authoring/` and expose them from `packages/core/src/index.ts`. CLI commands call core functions and handle argument parsing/output only.

#### Options Considered

| Option | Complexity | Data safety | Maintainability | Decision |
| --- | --- | --- | --- | --- |
| CLI-local implementation | Low initially | Medium | Low | Rejected |
| Core authoring service | Medium | High | High | Accepted |
| Schema package implementation | Medium | Medium | Medium | Rejected because schema must not do filesystem work |

#### Consequences

- Phase 1 adds focused core modules and tests.
- CLI command tests verify integration, not all business logic.
- Future Obsidian and reconciliation phases can reuse the same path and issue factory logic.

### ADR-002: `kanban new` is write-by-default with explicit dry-run

**Status:** Proposed
**Date:** 2026-05-12

#### Context

The command name `new` implies creation. A preview-only default would force the human to copy Markdown manually and would keep ID/frontmatter burden on the user.

#### Decision

`kanban new` writes a new issue file by default. `--dry-run` prints target path and Markdown without writing.

#### Consequences

- Must fail before write on invalid registry, target, title, id prefix, or existing file.
- Must use atomic/no-overwrite write semantics.
- Runtime smoke can prove actual issue file creation.

### ADR-003: Normalize never invents missing meaning

**Status:** Proposed
**Date:** 2026-05-12

#### Context

Rough notes often omit acceptance criteria or execution hints. An LLM might infer these, but Phase 1 must work without an LLM and must not fabricate work requirements.

#### Decision

`kanban normalize` preserves known content, maps obvious structural fields, and inserts explicit placeholders for missing semantic sections.

#### Consequences

- Placeholder-bearing issues are formal drafts, not execution-ready tasks.
- Readiness checks must be able to detect placeholders.
- Human authoring remains explicit.

### ADR-004: Normalize preserves external rough notes

**Status:** Proposed
**Date:** 2026-05-12

#### Context

Rough notes may live outside canonical issue roots. Moving or replacing them by default risks data loss and surprising Obsidian users.

#### Decision

`kanban normalize --write` behaves as follows:

- If the source file is already under exactly one registry issue or epic root, has a valid issue id, matches the owning root's `idPrefix`, matches the container project implied by the root, and no duplicate scan entry owns the same id, rewrite in place.
- If the source file is inside the vault but outside registry issue/epic roots, or has no id, require `--space` and optional `--project`, create a new canonical issue file under the registry path, and leave the source file unchanged.
- If the source file is outside the vault, reject it. Phase 1 does not import external files.
- Phase 1 does not implement `--replace-source`, deletion, or archival of the rough note.

#### Consequences

- No destructive source mutation outside issue roots.
- Output must clearly print source path and target path.
- Duplicate content risk is accepted for Phase 1 and mitigated by explicit output.

### ADR-005: Authoring commands that resolve vault state require an explicit vault

**Status:** Proposed
**Date:** 2026-05-12

#### Context

Existing CLI context may fall back to the default Home vault when `KANBAN_HOME` is absent. That is acceptable for read-only discovery commands, but Phase 1 authoring commands compute registry-relative paths, scan issue ids, and may write files.

#### Decision

`kanban new` and `kanban normalize` must reject implicit vault fallback. They require either explicit `KANBAN_HOME` or an explicit CLI vault option if that option exists in the implementation. `normalize --check` is read-only, but Phase 1 still requires explicit vault context because it validates source containment and target behavior against the registry.

#### Consequences

- Accidental writes to `~/.openclaw/workspace-kanban/kanban` are blocked.
- Accidental reads/target calculations against the implicit live Home vault are blocked for authoring flows.
- Tests must cover missing explicit vault for `new`, `normalize --write`, and registry-aware `normalize --check`.

### ADR-006: New issue creation uses exclusive create semantics

**Status:** Proposed
**Date:** 2026-05-12

#### Context

The existing atomic write helper is appropriate for updating known files, but temp-file rename can overwrite a target and is not sufficient for create-only ticket generation.

#### Decision

Any command that creates a new issue file must use exclusive create semantics equivalent to `open(path, 'wx')`. Existing-file rewrites are allowed only for validated in-place normalize operations.

#### Consequences

- `EEXIST` during `new` or canonical-target normalize must trigger a rescan-and-retry or fail safely.
- `new` must not use overwrite-capable atomic rename for the final target.
- In-place normalize may use existing atomic rewrite only after ownership checks pass.

## 8. Command Contract

### 8.1 `kanban new`

Usage:

```bash
kanban new --space <space> [--project <project>] [options] "<title>"
```

Options:

```text
--type <task|bug|chore|docs|epic>
--priority <P0|P1|P2|P3>
--executor <human|codex|claude-code>
--epic <issue-id>
--label <label>
--assignee <name>
--working-dir <path>
--merge-into <branch>
--dry-run
--json
```

Defaults:

```yaml
id: <allocated from registry idPrefix>
title: <title argument>
type: task
status: TODO
priority: P2
executor: human
project: <project argument for container spaces, "" for single spaces and epics>
created: <current ISO timestamp>
updated: <current ISO timestamp>
assignee: ""
labels: []
depends_on: []
```

Rules:

- `--space` is required.
- `--project` is required when registry space type is `container` and `--type` is not `epic`.
- `--project` is rejected when `--type epic`; epics are space-scoped and always write under the registry epic root.
- `--project` is invalid when not listed in the target container space.
- `--type epic` writes under the registry epic root and forces `executor: human`.
- non-epic issues write under the target issue/project root.
- title must contain at least one non-whitespace character.
- generated file name is `<id>-<slugified-title>.md`.
- slug uses lowercase ASCII where possible, hyphen separators, and fallback `issue` when the title has no slug-safe characters.
- stdout prints the issue id and vault-relative path.
- `--json` prints machine-readable `{ "id": "...", "path": "...", "created": true }`.
- `--json --dry-run` prints only JSON and includes `{ "created": false, "markdown": "...", "warnings": [] }`.
- `--dry-run` prints the same id/path plus Markdown preview and writes nothing.
- repeated `--label` values are preserved in order after trimming empty labels.
- `--epic` must be a segment-safe issue id; existence/type validation is deferred to a later cross-issue validation phase unless the issue is already loaded for ID scanning.
- `--working-dir` is stored only after rejecting NUL and newline characters.
- `--merge-into` is stored only after rejecting empty values, whitespace-only values, NUL, newline, and values starting with `-`.

Failure cases:

- missing explicit `KANBAN_HOME` or explicit vault root for `new` and `normalize`,
- missing `registry.yaml`,
- unknown space,
- missing/unknown project for container space,
- `--project` supplied for an epic,
- unsafe target path,
- invalid title,
- invalid option value,
- duplicate id detected while scanning,
- target file already exists.

### 8.2 `kanban normalize`

Usage:

```bash
kanban normalize <path> --check
kanban normalize <path> --write [--space <space>] [--project <project>]
```

Modes:

- `--check`: parse rough note, print proposed warnings and target behavior, write nothing.
- `--write`: write a normalized issue according to path rules.
- Exactly one of `--check` or `--write` is required.
- `--json` is supported for both modes and prints only JSON with `wrote`, `inPlace`, `targetPath`, `warnings`, `hasPlaceholders`, and `executionReady`.

Input mapping:

| Source | Target |
| --- | --- |
| frontmatter `id` | preserve after validation |
| missing `id` | allocate using registry when writing canonical target |
| frontmatter `title` | preserve |
| first `# Heading` | title if frontmatter title is absent |
| filename stem | title fallback |
| valid frontmatter `type` | preserve |
| invalid/missing `type` | default `task` and warn |
| valid frontmatter `status` | preserve if allowed and placeholders are absent |
| invalid/missing `status` | default `TODO` and warn |
| valid frontmatter `priority` | preserve |
| invalid/missing `priority` | default `P2` and warn |
| valid frontmatter `executor` | preserve |
| missing `executor` | default `human` |
| unstructured body | place under `컨텍스트` without rewriting meaning |
| exact known sections | preserve section content |
| missing semantic sections | insert explicit placeholder and warn |

Required placeholder:

```markdown
<!-- kanban:placeholder reason="missing-section-content" -->
- 작성 필요
```

Rules:

- `normalize` must not call an LLM.
- `normalize --check` must return non-zero only for unsafe/unparseable input, not for ordinary missing-section warnings.
- `normalize --write` must preserve unknown non-deprecated frontmatter keys unless they conflict with required canonical fields.
- `normalize` must merge from raw YAML maps so unknown non-deprecated keys are preserved; typed schema parsing alone is not sufficient.
- Deprecated fields rejected by schema remain errors.
- The normalized result must pass `parseIssueMarkdown` as a formal draft.
- A new helper must expose whether placeholders remain so later readiness gates can reject machine execution.
- If placeholders remain, `status: READY`, `RUNNING`, `REVIEW`, or `DONE` must not be preserved; Phase 1 normalizes the issue to `TODO`, emits a warning, and returns `executionReady: false`.
- `executionReady` means machine-execution readiness. It is `true` only when placeholders are absent, the issue is not an epic, status is `READY`, and executor is a machine executor (`codex` or `claude-code`). It is `false` for `executor: human`.

Path behavior:

- Source under exactly one registry issue/epic root with valid ownership: rewrite in place.
- Source inside the vault but outside registry issue/epic roots, or source missing a raw frontmatter id even when its filename looks like an issue id: create canonical target file under registry path; source remains unchanged.
- Source outside the vault: reject.
- For canonical target creation, `--space` is required.
- For container target creation, `--project` is required unless type is `epic`.
- For canonical target creation with `type: epic`, `--project` is rejected.

In-place ownership requires all of:

- source path is inside exactly one canonical registry root,
- id is segment-safe and matches the owning space `idPrefix`,
- container issue frontmatter `project` matches the registry project root,
- epic issue frontmatter has `type: epic`, `executor: human`, and project is `""`,
- duplicate scan finds no other file with the same id,
- the same source file is the only owner of that id.

Failure cases:

- source path escapes vault,
- source file does not exist,
- source file is not Markdown,
- existing id is unsafe or registry-prefix mismatched,
- target registry path cannot be resolved safely,
- target file already exists,
- duplicate issue id detected,
- both `--check` and `--write` provided,
- neither `--check` nor `--write` provided.

## 9. Data Model and Service Contracts

### 9.1 Core module layout

Create:

```text
packages/core/src/authoring/issue-factory.ts
packages/core/src/authoring/normalize-issue.ts
packages/core/src/authoring/issue-writer.ts
packages/core/src/authoring/index.ts
```

Responsibilities:

| Module | Responsibility |
| --- | --- |
| `issue-factory.ts` | Build canonical frontmatter/body for new issues and formal drafts. |
| `normalize-issue.ts` | Convert rough Markdown into normalized issue Markdown plus warnings. |
| `issue-writer.ts` | Resolve registry target paths, scan existing ids, no-overwrite writes. |
| `index.ts` | Public exports for CLI and later phases. |

`issue-writer.ts` must expose or use a registry-safe path resolver for registry values that contain `/`:

```ts
export function splitSafeRelativePath(relativePath: string): string[];
export async function resolveRegistryPath(vaultRoot: string, relativePath: string): Promise<string>;
```

Resolver requirements:

- reject absolute paths,
- reject empty, `.`, `..`, NUL, `/`-empty, or `\` components,
- split registry relative paths into safe components before calling segment-safe resolution,
- check nearest existing parent with realpath containment under `vaultRoot`,
- reject symlink escape through any existing parent,
- use exclusive create semantics for new issue targets.

### 9.2 Public core types

The implementation plan may refine exact names, but must provide these concepts:

```ts
export interface CreateIssueInput {
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  type?: 'task' | 'bug' | 'chore' | 'docs' | 'epic';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  executor?: 'human' | 'codex' | 'claude-code';
  labels?: string[];
  assignee?: string;
  epic?: string;
  workingDir?: string;
  mergeInto?: string;
  now?: Date;
  dryRun?: boolean;
}

export interface CreateIssueResult {
  id: string;
  relativePath: string;
  absolutePath: string;
  markdown: string;
  created: boolean;
  warnings: string[];
}

export interface NormalizeIssueInput {
  vaultRoot: string;
  sourcePath: string;
  space?: string;
  project?: string;
  write: boolean;
  now?: Date;
}

export interface NormalizeIssueResult {
  id: string;
  sourcePath: string;
  targetPath: string;
  markdown: string;
  wrote: boolean;
  inPlace: boolean;
  warnings: string[];
  hasPlaceholders: boolean;
  executionReady: boolean;
}
```

### 9.3 Registry and ID scanning

ID scanning must include:

- non-epic issue roots for the target space,
- epic root for the target space,
- all configured project roots for container spaces,
- frontmatter id where parseable,
- filename prefix fallback only when frontmatter cannot be read,
- duplicate id detection.
- malformed YAML with a reliable filename id reserves that id.
- malformed YAML without a reliable filename id in the target scan scope fails write operations.

Parse warnings must be surfaced, but unrelated malformed files must not silently cause id reuse.

## 10. Testing Strategy

Use `testing-strategy` to keep fast tests broad and runtime smoke narrow.

| Layer | Coverage |
| --- | --- |
| Unit | slug generation, issue factory defaults, placeholder detection, normalize mapping, id scanning |
| Integration | temporary vault registry traversal, no-overwrite writes, normalize path behavior |
| CLI | command parser, stdout/stderr, exit codes, JSON output, dry-run behavior |
| Docs | runtime guide examples and deploy checklist links |
| Runtime smoke | actual `KANBAN_HOME=<tmp-vault>` command sequence |

The built CLI must be executable by Node after `pnpm -r build`; Phase 1 may not rely on `tsx` source execution as the only runtime proof.

Targeted Vitest runs must use one-shot commands:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/issue-factory.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/authoring.test.ts
```

Full phase verification:

```bash
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-path.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/issue-factory.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/create-issue.test.ts
pnpm --filter @kanban-task-engine/core exec vitest run tests/normalize-issue.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/authoring.test.ts
pnpm -r build
node packages/cli/dist/bin.js --help
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
pnpm -r test
pnpm test:docs
pnpm docs:verify
git diff --check
```

Runtime smoke must be copy-pasteable and must not rely on a missing package script:

```bash
VAULT="$(mktemp -d)"
trap 'rm -rf "$VAULT"' EXIT
mkdir -p "$VAULT/issues/vibe-coding/kanban-task-engine" "$VAULT/issues/vibe-coding/_epics" "$VAULT/boards"
cat > "$VAULT/registry.yaml" <<'YAML'
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
pnpm -r build
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine --json "Authoring smoke"
mkdir -p "$VAULT/inbox"
printf '# Rough smoke\n\nNeeds formalization.\n' > "$VAULT/inbox/rough.md"
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js normalize "$VAULT/inbox/rough.md" --write --space vibe-coding --project kanban-task-engine --json
KANBAN_HOME="$VAULT" node packages/cli/dist/bin.js normalize "$VAULT/issues/vibe-coding/kanban-task-engine/VC-001-authoring-smoke.md" --check --json
pnpm --filter @kanban-task-engine/core exec vitest run tests/authoring-runtime-smoke.test.ts
```

Expected smoke result:

- `new` creates exactly one issue file.
- generated id uses the registry prefix.
- generated Markdown passes `parseIssueMarkdown`, registry-aware frontmatter validation, and canonical mapping assertions.
- rough-note `normalize --write` creates a canonical issue target and leaves the source note unchanged.
- `normalize --check` reports no fatal errors for the generated issue.

## 11. Documentation Requirements

Update during implementation:

- `docs/kanban-runtime.md`: add `kanban new` and `kanban normalize` operator examples, dry-run behavior, and source-of-truth notes.
- `docs/kanban-runtime.md`: add copy-pasteable procedures for creating a ticket, normalizing a rough note, using dry-run first, and cleaning up disposable vault smoke files.
- `docs/deploy-checklist.md`: add authoring command smoke, temporary vault test, and no-live-state-in-engine check.
- Phase implementation plan: include exact commands, expected output, and rollback/cleanup steps for disposable vaults.

Do not duplicate long schema text in multiple docs; link to this spec and the runtime guide.

## 12. Deploy Checklist Additions

Before merge:

- [ ] `new` and `normalize` tests pass.
- [ ] Full repo build/test passes.
- [ ] Docs verification passes.
- [ ] Disposable vault smoke passes.
- [ ] No live issue state is written under the engine repo.
- [ ] No `.DS_Store`, `.pnpm-store`, `.claude`, `node_modules`, generated vault artifacts, or `__pycache__` files are staged.

Rollback trigger:

- `kanban new` writes outside the intended vault path.
- ID allocation can reuse an existing id.
- `normalize --write` mutates a source note outside issue roots.
- Parser accepts placeholder-bearing issues as machine-ready without a readiness warning.

Rollback procedure:

- Revert the release branch or PR that exposed the command.
- Disable any wrapper alias that routes operators to the new command.
- Remove disposable smoke vaults created during verification.
- If an approved live-adjacent vault was polluted, restore affected issue files from that vault's git history and preserve the bad files as evidence outside the vault.
- Re-run `pnpm -r build`, `pnpm -r test`, `pnpm test:docs`, `pnpm docs:verify`, and the disposable vault smoke before re-enabling the command.

## 13. Tech Debt Risk Register

| Debt | Category | Impact | Risk | Effort | Priority | Mitigation |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| CLI-local authoring logic duplicates core traversal | Code/architecture | 5 | 5 | 3 | 30 | Put authoring services in core and keep CLI thin. |
| Placeholder semantics hidden in Markdown comments only | Test/runtime | 4 | 4 | 2 | 32 | Add explicit `hasPlaceholders` helper and tests. |
| Rough note normalization accidentally overwrites user notes | Data safety | 5 | 5 | 2 | 40 | Preserve external source notes; require in-place only for registry issue roots. |
| ID scanning ignores malformed files and reuses ids | Data integrity | 5 | 5 | 3 | 30 | Fail on duplicate ids and surface parse warnings in results. |
| Docs drift from CLI behavior | Documentation | 3 | 4 | 2 | 28 | Update runtime docs and docs verification examples in the same phase. |

## 14. Acceptance Criteria

Phase 1 may claim only code-level and disposable-vault runtime readiness. It must not claim Obsidian GUI readiness, live `workspace-kanban` readiness, or Codex/OpenClaw agent E2E readiness.

Phase 1 is complete only when all are true:

- `kanban new` creates a valid issue file in a disposable vault.
- `kanban new --dry-run` writes nothing.
- `kanban new --json` returns machine-readable id/path/created data.
- ID allocation scans existing issues and epics and rejects duplicates.
- `kanban normalize --check` reports deterministic proposed output without writing.
- `kanban normalize --write` rewrites in place only for registry issue-root files with valid ids.
- `kanban normalize --write` creates a canonical target and preserves source for rough notes outside issue roots.
- Placeholder-bearing normalized issues are detectable as not execution-ready.
- READY/RUNNING/REVIEW/DONE rough notes with placeholders normalize to `TODO` or fail before write; they never remain execution candidates.
- Malformed YAML with filename id reserves that id; malformed files without reliable ids fail write operations in the target scan scope.
- Unknown non-deprecated frontmatter keys survive normalization.
- Runtime docs and deploy checklist mention Phase 1 commands and smoke gates.
- Verification commands in Section 10 pass freshly.

## 15. Review Requirements

Before implementation plan creation:

- Review this spec with at least three independent agents.
- One review must focus on architecture/data safety.
- One review must focus on testing/runtime acceptance.
- One review must focus on CLI UX, documentation, deploy checklist, and tech debt.
- Incorporate or explicitly reject every P0/P1 finding before writing the implementation plan.
