# Kanban Contract Hardening Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec covers the P0 contract work that must happen before the CLI or execution harness grows: canonical model ownership, status rules, parser/state alignment, and recipe/runtime naming.

The goal is to remove ambiguity between `schema`, `core`, docs, tests, and adapters.

## 2. Current Evidence

Observed in the current repo:

- `packages/core/src/types.ts` exports `CanonicalTaskModel`.
- `packages/schema/src/issue-schema.ts` also exports `CanonicalIssueModel`.
- `packages/core/src/store/mapper.ts` imports `validateCanonicalIssue` from `@kanban-task-engine/schema`.
- `packages/schema/src/issue-schema.ts` owns Markdown parsing and required section rules.
- `packages/core/src/state-machine.ts` applies global transitions without checking Epic type.
- `packages/core/src/recipes/recipe-loader.ts` parses recipe YAML but does not assemble module instances.

## 3. Decisions

### 3.1 Canonical Model Owner

`@kanban-task-engine/core` owns the canonical runtime model.

Rationale:

- Current adapters already import `CanonicalTaskModel` from core.
- The canonical shape is runtime-facing and adapter-facing, not only Markdown-schema-facing.
- The schema package should remain lower-level and independent.

`@kanban-task-engine/schema` owns:

- `IssueFrontmatter`
- `ParsedIssueMarkdown`
- `IssueStatus`
- `IssueTransition`
- Markdown parser helpers
- Markdown fixtures

It must not export a competing canonical task shape.

### 3.2 Canonical Validation

Canonical validation moves to core.

Required helper:

```ts
export function validateCanonicalTask(input: unknown): ValidationResult<CanonicalTaskModel>;
```

The validation result type may be copied into core or imported from a small schema-neutral utility. The schema package must not import core.

### 3.3 Type Mapping

Markdown issue types remain:

```text
epic | task | bug | chore | docs
```

Canonical Jira-compatible issue types remain:

```text
Epic | Task | Bug | Sub-task | Story
```

Mapping rules:

```text
epic -> Epic
bug   -> Bug
task  -> Task
chore -> Task
docs  -> Task
```

`Story` and `Sub-task` are allowed canonical values for external adapters but are not first-class Markdown issue types in the current MVP.

### 3.4 Priority Mapping

Markdown priority remains:

```text
P0 | P1 | P2 | P3
```

Canonical priority remains:

```text
Blocker | Critical | High | Medium | Low | Trivial
```

Mapping rules:

```text
P0 -> Blocker
P1 -> High
P2 -> Medium
P3 -> Low
```

Reverse mapping:

```text
Blocker | Critical -> P0
High               -> P1
Medium             -> P2
Low | Trivial      -> P3
```

## 4. State and Epic Contract

Normalized statuses remain:

```text
TODO | READY | RUNNING | REVIEW | DONE | FAILED
```

Non-Epic issue transitions:

```text
TODO   -> READY
TODO   -> FAILED
READY  -> RUNNING
READY  -> TODO
RUNNING -> REVIEW
RUNNING -> FAILED
REVIEW -> DONE
REVIEW -> READY
REVIEW -> RUNNING
REVIEW -> FAILED
FAILED -> READY
```

Epic transitions for the MVP:

```text
TODO -> DONE
```

Epic restrictions:

- Epic issues cannot transition to `READY`.
- Epic issues cannot transition to `RUNNING`.
- Epic issues cannot transition to `REVIEW`.
- Epic issues cannot transition to `FAILED`.
- Epic issues cannot be execution targets.
- Epic `executor` is `human`.
- Epic `automation` is ignored by runtime modules.

## 5. Parser and Section Contract

Non-Epic required sections:

```text
목적
컨텍스트
Acceptance Criteria
실행 힌트
```

Epic required sections:

```text
목표
범위
성공 지표
하위 티켓
```

Optional section:

```text
로그
```

`로그` is append-only. Parser validation must not require it.

## 6. Recipe Runtime Contract

Recipe YAML has two separate phases:

1. Parse recipe shape.
2. Assemble module instances from module names.

Required assembly API:

```ts
export interface ModuleFactoryDependencies {
  store?: TaskStore;
  stateMachine?: StateMachine;
  eventWriter?: EventWriter;
  gitRunner?: GitRunner;
}

export interface EventWriter {
  append(event: Record<string, unknown>): Promise<void>;
}

export interface GitRunner {
  run(args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
}

export type ModuleFactory = (dependencies: ModuleFactoryDependencies) => AutomationModule;

export class ModuleRegistry {
  register(name: string, factory: ModuleFactory): void;
  resolve(name: string, dependencies: ModuleFactoryDependencies): AutomationModule;
  assemble(recipe: AutomationRecipe, dependencies: ModuleFactoryDependencies): AutomationModule[];
}
```

Built-in module names:

```text
manual-command-trigger
state-transition
audit-log
git-checkpoint
```

Recipe names that are not implemented must fail during assembly with:

```text
Unknown recipe module: <name>
```

## 7. Out of Scope

- User-facing CLI commands.
- Worktree creation.
- Real Claude/OpenClaw execution.
- Jira/GitHub/Firebase adapter behavior changes beyond type compilation fallout.
- New package splitting.

## 8. Acceptance Criteria

- `CanonicalIssueModel` is removed as a production export from schema.
- `validateCanonicalTask()` exists in core and is used by Markdown-to-canonical mapping.
- `packages/schema` has no import from `packages/core`.
- `StateMachine.transition()` rejects Epic transitions to `READY`, `RUNNING`, `REVIEW`, or `FAILED`.
- Tests cover non-Epic section requirements and Epic section requirements.
- Tests cover Epic transition rejection.
- Tests cover non-Epic `REVIEW -> READY` so abort/retry can return reviewed work to the ready queue.
- Recipe module assembly exists and rejects unknown module names before execution.
- Full workspace verification passes:

```bash
pnpm test
pnpm build
```

## 9. Implementation Notes

Recommended files:

- Modify `packages/schema/src/issue-schema.ts`.
- Modify `packages/schema/src/index.ts`.
- Create `packages/core/src/validation/canonical-task.ts`.
- Modify `packages/core/src/store/mapper.ts`.
- Modify `packages/core/src/state-machine.ts`.
- Create `packages/core/src/recipes/module-registry.ts`.
- Update tests under `packages/schema/tests/` and `packages/core/tests/`.

This spec should be implemented before vault/store path changes so later work can rely on stable task semantics.
