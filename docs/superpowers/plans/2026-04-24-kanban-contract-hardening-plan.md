# Kanban Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the schema/core/runtime contracts so canonical model ownership, Markdown parsing, state transitions, mapping rules, and recipe module assembly are explicit and verified before CLI or execution harness work expands.

**Architecture:** Keep Markdown syntax and low-level issue parsing in `@kanban-task-engine/schema`, and move runtime canonical task validation into `@kanban-task-engine/core`. Core owns canonical mapping, state-machine rules, and recipe module assembly through explicit dependency interfaces. Adapters should only change when TypeScript compilation exposes contract fallout.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, gray-matter, yaml, existing core runtime module APIs.

---

## File Structure

- Modify: `packages/schema/src/issue-schema.ts` - remove production `CanonicalIssueModel` and `validateCanonicalIssue` exports; keep `ValidationResult`, Markdown frontmatter validation, section validation, and parser helpers.
- Modify: `packages/schema/src/index.ts` - ensure schema exports only schema-owned types and helpers.
- Modify: `packages/schema/tests/issue-schema.test.ts` - remove canonical validation tests; add explicit non-Epic, Epic, and optional `로그` parser contract coverage.
- Create: `packages/core/src/validation/canonical-task.ts` - core-owned `validateCanonicalTask(input: unknown): ValidationResult<CanonicalTaskModel>` implementation.
- Create: `packages/core/tests/canonical-task.test.ts` - core-owned canonical validation tests.
- Modify: `packages/core/src/store/mapper.ts` - import `validateCanonicalTask` from core, not schema; keep Markdown parser import from schema; keep type and priority mapping logic local.
- Modify: `packages/core/tests/mapper.test.ts` - add full type mapping, priority mapping, reverse mapping, and `markdownIssueToCanonical()` validation coverage.
- Modify: `packages/core/src/index.ts` - export `validateCanonicalTask` and recipe registry APIs.
- Modify: `packages/core/src/state-machine.ts` - enforce Epic transition contract in `transition()` while preserving global non-Epic transitions.
- Modify: `packages/core/tests/state-machine.test.ts` - add non-Epic `REVIEW -> READY` and Epic rejection tests.
- Create: `packages/core/src/recipes/module-registry.ts` - `ModuleFactoryDependencies`, `EventWriter`, `GitRunner`, `ModuleFactory`, `ModuleRegistry`, and built-in registry creation.
- Modify: `packages/core/src/recipes/recipe-loader.ts` - keep YAML parsing only; do not assemble module instances here.
- Modify: `packages/core/tests/recipe-loader.test.ts` - keep parse-shape tests and update module names to built-ins.
- Create: `packages/core/tests/module-registry.test.ts` - assembly success, explicit dependency injection, and unknown module rejection tests.
- Modify in Task 5: `packages/core/src/modules/audit-log-module.ts` - expose a factory path that can consume `EventWriter` while preserving the existing file-backed module behavior.
- Modify in Task 5: `packages/core/src/modules/git-checkpoint-module.ts` - expose a factory path that can consume `GitRunner` while preserving the existing command-runner behavior.
- Modify only in Task 7 after a named `pnpm test` or `pnpm build` failure: adapter package files named by the failing diagnostic, starting with `packages/adapter-firebase/src/firebase-mapper.ts`, `packages/adapter-github/src/status-mapping.ts`, `packages/adapter-cli/src/prompt-builder.ts`, or `packages/adapter-openclaw/src/openclaw-adapter.ts`.

## Preconditions

- Work from an isolated worktree. For the current planning branch, use `~/.config/superpowers/worktrees/kanban-task-engine/docs-gpt55-review-specs`.
- Do not edit this plan while executing it except to check completed boxes.
- Run `git status --short` before each task. If files outside the task's listed scope are already modified by another agent, do not revert them; inspect only when they affect the task.
- Use `pnpm --filter @kanban-task-engine/schema test`, `pnpm --filter @kanban-task-engine/core test`, `pnpm test`, and `pnpm build` as written below.
- Commit after each task. If verification fails, fix only the files listed in that task or stop and record the blocker.

### Task 1: Lock Schema Parser Contract and Remove Schema Canonical Tests

**Files:**
- Modify: `packages/schema/tests/issue-schema.test.ts`
- Modify later in this task: `packages/schema/src/issue-schema.ts`
- Modify later in this task: `packages/schema/src/index.ts`

- [ ] **Step 1: Write failing parser ownership tests**

Edit `packages/schema/tests/issue-schema.test.ts`.

Remove `validateCanonicalIssue` from the import list. Add the following tests under `describe('parseIssueMarkdown', ...)`:

```typescript
  it('rejects a non-epic issue missing 실행 힌트 section', () => {
    const markdown = `---
id: VC-200
title: Missing execution hints
type: task
status: TODO
executor: claude-code
project: kanban-task-engine
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P1
---

## 목적
Ship the task.

## 컨텍스트
The worker needs context.

## Acceptance Criteria
- The task is complete.
`;

    const result = parseIssueMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Missing required section: 실행 힌트');
  });

  it('rejects an epic issue missing 하위 티켓 section', () => {
    const markdown = `---
id: VC-201
title: Missing child tickets
type: epic
status: TODO
executor: human
project: ""
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P0
---

## 목표
Coordinate the initiative.

## 범위
Only MVP hardening.

## 성공 지표
- Contracts are enforced.
`;

    const result = parseIssueMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Missing required section: 하위 티켓');
  });

  it('accepts optional 로그 section without requiring it', () => {
    const withoutLog = parseIssueMarkdown(VALID_ISSUE_MARKDOWN);
    expect(withoutLog.ok).toBe(true);

    const withLog = parseIssueMarkdown(`${VALID_ISSUE_MARKDOWN}

## 로그
2026-04-24T00:00:00.000Z created by test.
`);
    expect(withLog.ok).toBe(true);
    if (!withLog.ok) return;
    expect(withLog.value.sections['로그']).toContain('created by test');
  });
```

Delete the whole `describe('validateCanonicalIssue', ...)` block from `packages/schema/tests/issue-schema.test.ts`.

- [ ] **Step 2: Run schema parser tests to verify new parser coverage**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- issue-schema.test.ts
```

Expected: PASS. These tests prove the schema package still owns Markdown parser behavior before canonical validation is moved out.

- [ ] **Step 3: Remove schema canonical production export**

Edit `packages/schema/src/issue-schema.ts`:

Remove this interface:

```typescript
export interface CanonicalIssueModel {
  task_ref: {
    provider: string;
    external_key: string;
    external_id: string;
  };
  summary: string;
  workflow: {
    normalized_status: IssueStatus;
    raw_status: string;
    raw_status_category: string;
  };
  classification: {
    issue_type: string;
    priority: string;
    labels: string[];
    component: string[];
  };
  ownership: {
    assignee: string;
    reporter: string;
  };
  planning: Record<string, unknown>;
  automation: {
    policy_id: string;
    on_enter: IssueStatus[];
    on_exit: IssueStatus[];
    execution_profile: string;
    workspace?: string;
    useAcp?: boolean;
  };
  sync: {
    last_synced_at: string;
    last_source: string;
  };
  created?: string;
  updated?: string;
  completed?: string;
}
```

Remove this function and any helper functions used only by it:

```typescript
export function validateCanonicalIssue(input: unknown): ValidationResult<CanonicalIssueModel> {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Canonical issue must be an object'] };
  }

  const errors: string[] = [];
  requireString(input, 'summary', errors);
  requireRecord(input, 'task_ref', errors);
  requireRecord(input, 'workflow', errors);
  requireRecord(input, 'classification', errors);
  requireRecord(input, 'ownership', errors);
  requireRecord(input, 'planning', errors);
  requireRecord(input, 'automation', errors);
  requireRecord(input, 'sync', errors);

  if (isRecord(input.task_ref)) {
    requireString(input.task_ref, 'provider', errors, 'task_ref.provider');
    requireString(input.task_ref, 'external_key', errors, 'task_ref.external_key');
    requireString(input.task_ref, 'external_id', errors, 'task_ref.external_id');
  }

  if (isRecord(input.workflow)) {
    if (!isIssueStatus(input.workflow.normalized_status)) {
      errors.push(`Invalid canonical status: ${String(input.workflow.normalized_status)}`);
    }
    requireString(input.workflow, 'raw_status', errors, 'workflow.raw_status');
    requireString(input.workflow, 'raw_status_category', errors, 'workflow.raw_status_category');
  }

  if (isRecord(input.classification)) {
    requireString(input.classification, 'issue_type', errors, 'classification.issue_type');
    requireString(input.classification, 'priority', errors, 'classification.priority');
    requireStringArray(input.classification, 'labels', errors, 'classification.labels');
    requireStringArray(input.classification, 'component', errors, 'classification.component');
  }

  if (isRecord(input.ownership)) {
    requireString(input.ownership, 'assignee', errors, 'ownership.assignee');
    requireString(input.ownership, 'reporter', errors, 'ownership.reporter');
  }

  if (isRecord(input.automation)) {
    requireString(input.automation, 'policy_id', errors, 'automation.policy_id');
    requireIssueStatusArray(input.automation, 'on_enter', errors, 'automation.on_enter');
    requireIssueStatusArray(input.automation, 'on_exit', errors, 'automation.on_exit');
    requireString(input.automation, 'execution_profile', errors, 'automation.execution_profile');
  }

  if (isRecord(input.sync)) {
    requireString(input.sync, 'last_synced_at', errors, 'sync.last_synced_at');
    requireString(input.sync, 'last_source', errors, 'sync.last_source');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as CanonicalIssueModel };
}
```

Keep `ValidationResult<T>` exported from schema. Keep `isRecord` because parser validation uses it. Remove `requireRecord`, `requireString`, `requireStringArray`, and `requireIssueStatusArray`; after deleting `validateCanonicalIssue()`, those helpers are no longer part of schema-owned parsing behavior.

Edit `packages/schema/src/index.ts` only if it explicitly exports `CanonicalIssueModel` or `validateCanonicalIssue`; remove those named exports.

- [ ] **Step 4: Run schema tests to verify schema-owned behavior passes**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- issue-schema.test.ts
```

Expected: PASS. The schema package still validates `IssueFrontmatter`, type enum, priority enum, non-Epic sections, Epic sections, and optional `로그`.

- [ ] **Step 5: Verify schema does not import core**

Run:

```bash
rg -n "from '@kanban-task-engine/core'|from \"@kanban-task-engine/core\"|from '../../core|from \"../../core" packages/schema/src packages/schema/tests
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/issue-schema.ts packages/schema/src/index.ts packages/schema/tests/issue-schema.test.ts
git commit -m "refactor(schema): keep canonical task validation out of schema"
```

### Task 2: Add Core-Owned Canonical Task Validation

**Files:**
- Create: `packages/core/src/validation/canonical-task.ts`
- Create: `packages/core/tests/canonical-task.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing core validation tests**

Create `packages/core/tests/canonical-task.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { validateCanonicalTask } from '../src/validation/canonical-task';

describe('validateCanonicalTask', () => {
  const validTask = {
    task_ref: { provider: 'local', external_key: 'kanban-task-engine', external_id: 'VC-300' },
    summary: 'Validate canonical task in core',
    workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
    classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
    ownership: { assignee: '', reporter: '' },
    planning: {},
    automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
    sync: { last_synced_at: '2026-04-24T00:00:00.000Z', last_source: 'local' },
  };

  it('rejects non-object input', () => {
    const result = validateCanonicalTask('not an object');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Canonical task must be an object');
  });

  it('accepts the core CanonicalTaskModel shape', () => {
    const result = validateCanonicalTask(validTask);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task_ref.external_id).toBe('VC-300');
  });

  it('rejects invalid canonical issue type values', () => {
    const result = validateCanonicalTask({
      ...validTask,
      classification: { ...validTask.classification, issue_type: 'Chore' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Invalid canonical issue type: Chore');
  });

  it('rejects invalid canonical priority values', () => {
    const result = validateCanonicalTask({
      ...validTask,
      classification: { ...validTask.classification, priority: 'P0' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Invalid canonical priority: P0');
  });

  it('rejects invalid automation status arrays', () => {
    const result = validateCanonicalTask({
      ...validTask,
      automation: { ...validTask.automation, on_enter: ['READY', 'ACTIVE'] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Invalid automation.on_enter status: ACTIVE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- canonical-task.test.ts
```

Expected: FAIL with an import or module resolution error for `../src/validation/canonical-task`.

- [ ] **Step 3: Implement core validation**

Create `packages/core/src/validation/canonical-task.ts`:

```typescript
import { isIssueStatus, type ValidationResult } from '@kanban-task-engine/schema';
import {
  type CanonicalTaskModel,
  type ExecutionProfile,
  type IssueType,
  type Priority,
  type RawStatusCategory,
  type Sync,
  type TaskRef,
} from '../types';

const TASK_PROVIDERS: TaskRef['provider'][] = ['local', 'github', 'jira', 'firebase'];
const RAW_STATUS_CATEGORIES: RawStatusCategory[] = ['TODO', 'READY', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'FAILED'];
const ISSUE_TYPES: IssueType[] = ['Epic', 'Story', 'Task', 'Bug', 'Sub-task'];
const PRIORITIES: Priority[] = ['Blocker', 'Critical', 'High', 'Medium', 'Low', 'Trivial'];
const EXECUTION_PROFILES: ExecutionProfile[] = ['standard', 'aggressive', 'conservative'];
const SYNC_SOURCES: Sync['last_source'][] = ['local', 'github', 'firebase'];

export function validateCanonicalTask(input: unknown): ValidationResult<CanonicalTaskModel> {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Canonical task must be an object'] };
  }

  const errors: string[] = [];
  requireRecord(input, 'task_ref', errors);
  requireString(input, 'summary', errors);
  requireRecord(input, 'workflow', errors);
  requireRecord(input, 'classification', errors);
  requireRecord(input, 'ownership', errors);
  requireRecord(input, 'planning', errors);
  requireRecord(input, 'automation', errors);
  requireRecord(input, 'sync', errors);

  if (isRecord(input.task_ref)) {
    requireEnum(input.task_ref, 'provider', TASK_PROVIDERS, errors, 'task_ref.provider');
    requireString(input.task_ref, 'external_key', errors, 'task_ref.external_key');
    requireString(input.task_ref, 'external_id', errors, 'task_ref.external_id');
  }

  if (isRecord(input.workflow)) {
    if (!isIssueStatus(input.workflow.normalized_status)) {
      errors.push(`Invalid canonical status: ${String(input.workflow.normalized_status)}`);
    }
    requireString(input.workflow, 'raw_status', errors, 'workflow.raw_status');
    requireEnum(input.workflow, 'raw_status_category', RAW_STATUS_CATEGORIES, errors, 'workflow.raw_status_category');
  }

  if (isRecord(input.classification)) {
    requireEnum(input.classification, 'issue_type', ISSUE_TYPES, errors, 'classification.issue_type', 'Invalid canonical issue type');
    requireEnum(input.classification, 'priority', PRIORITIES, errors, 'classification.priority', 'Invalid canonical priority');
    requireStringArray(input.classification, 'labels', errors, 'classification.labels');
    requireStringArray(input.classification, 'component', errors, 'classification.component');
  }

  if (isRecord(input.ownership)) {
    requireString(input.ownership, 'assignee', errors, 'ownership.assignee');
    requireString(input.ownership, 'reporter', errors, 'ownership.reporter');
  }

  if (isRecord(input.automation)) {
    requireString(input.automation, 'policy_id', errors, 'automation.policy_id');
    requireIssueStatusArray(input.automation, 'on_enter', errors, 'automation.on_enter');
    requireIssueStatusArray(input.automation, 'on_exit', errors, 'automation.on_exit');
    requireEnum(input.automation, 'execution_profile', EXECUTION_PROFILES, errors, 'automation.execution_profile');
    if (input.automation.workspace !== undefined && typeof input.automation.workspace !== 'string') {
      errors.push('Invalid canonical field: automation.workspace must be a string');
    }
    if (input.automation.useAcp !== undefined && typeof input.automation.useAcp !== 'boolean') {
      errors.push('Invalid canonical field: automation.useAcp must be a boolean');
    }
  }

  if (isRecord(input.sync)) {
    requireString(input.sync, 'last_synced_at', errors, 'sync.last_synced_at');
    requireEnum(input.sync, 'last_source', SYNC_SOURCES, errors, 'sync.last_source');
    if (input.sync.checksum !== undefined && typeof input.sync.checksum !== 'string') {
      errors.push('Invalid canonical field: sync.checksum must be a string');
    }
  }

  for (const field of ['description_ref', 'created', 'updated', 'completed'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      errors.push(`Invalid canonical field: ${field} must be a string`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as CanonicalTaskModel };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(input: Record<string, unknown>, field: string, errors: string[]): void {
  if (!isRecord(input[field])) {
    errors.push(`Invalid canonical field: ${field} must be an object`);
  }
}

function requireString(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (typeof input[field] !== 'string') {
    errors.push(`Invalid canonical field: ${label} must be a string`);
  }
}

function requireStringArray(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (!Array.isArray(input[field]) || !(input[field] as unknown[]).every(value => typeof value === 'string')) {
    errors.push(`Invalid canonical field: ${label} must be a string array`);
  }
}

function requireIssueStatusArray(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (!Array.isArray(input[field])) {
    errors.push(`Invalid canonical field: ${label} must be a status array`);
    return;
  }
  for (const value of input[field] as unknown[]) {
    if (!isIssueStatus(value)) {
      errors.push(`Invalid ${label} status: ${String(value)}`);
    }
  }
}

function requireEnum<T extends string>(
  input: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  errors: string[],
  label = field,
  invalidPrefix = `Invalid canonical field: ${label}`,
): void {
  const value = input[field];
  if (typeof value !== 'string') {
    errors.push(`Invalid canonical field: ${label} must be a string`);
    return;
  }
  if (!allowed.includes(value as T)) {
    errors.push(`${invalidPrefix}: ${value}`);
  }
}
```

Edit `packages/core/src/index.ts`:

```typescript
export { validateCanonicalTask } from './validation/canonical-task';
```

- [ ] **Step 4: Run core validation tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- canonical-task.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validation/canonical-task.ts packages/core/tests/canonical-task.test.ts packages/core/src/index.ts
git commit -m "feat(core): own canonical task validation"
```

### Task 3: Rewire Markdown-to-Canonical Mapping and Mapping Coverage

**Files:**
- Modify: `packages/core/src/store/mapper.ts`
- Modify: `packages/core/tests/mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Edit `packages/core/tests/mapper.test.ts`.

Change the import to include `markdownIssueToCanonical`:

```typescript
import {
  yamlToCanonical,
  canonicalToYaml,
  markdownIssueToCanonical,
  rawStatusToNormalized,
  normalizedToRawStatus,
} from '../src/store/mapper';
```

Add these tests inside `describe('yamlToCanonical', ...)`:

```typescript
    it.each([
      ['epic', 'Epic'],
      ['bug', 'Bug'],
      ['task', 'Task'],
      ['chore', 'Task'],
      ['docs', 'Task'],
    ] as const)('maps Markdown type %s to canonical %s', (markdownType, canonicalType) => {
      const result = yamlToCanonical(
        { id: `VC-type-${markdownType}`, type: markdownType, title: markdownType },
        `/workspace/issues/VC-type-${markdownType}.md`,
      );
      expect(result.classification.issue_type).toBe(canonicalType);
    });

    it.each([
      ['P0', 'Blocker'],
      ['P1', 'High'],
      ['P2', 'Medium'],
      ['P3', 'Low'],
    ] as const)('maps Markdown priority %s to canonical %s', (markdownPriority, canonicalPriority) => {
      const result = yamlToCanonical(
        { id: `VC-priority-${markdownPriority}`, type: 'task', priority: markdownPriority },
        `/workspace/issues/VC-priority-${markdownPriority}.md`,
      );
      expect(result.classification.priority).toBe(canonicalPriority);
    });
```

Add these tests inside `describe('canonicalToYaml', ...)`:

```typescript
    it.each([
      ['Blocker', 'P0'],
      ['Critical', 'P0'],
      ['High', 'P1'],
      ['Medium', 'P2'],
      ['Low', 'P3'],
      ['Trivial', 'P3'],
    ] as const)('maps canonical priority %s back to Markdown %s', (canonicalPriority, markdownPriority) => {
      const canonical = yamlToCanonical(
        { id: `VC-reverse-${canonicalPriority}`, type: 'task', priority: 'P2', title: canonicalPriority },
        '/workspace/issues/VC-reverse.md',
      );
      const yaml = canonicalToYaml({
        ...canonical,
        classification: { ...canonical.classification, priority: canonicalPriority },
      });
      expect(yaml.priority).toBe(markdownPriority);
    });

    it.each([
      ['Epic', 'epic'],
      ['Bug', 'bug'],
      ['Task', 'task'],
      ['Story', 'task'],
      ['Sub-task', 'task'],
    ] as const)('maps canonical type %s back to Markdown %s', (canonicalType, markdownType) => {
      const canonical = yamlToCanonical(
        { id: `VC-reverse-${canonicalType}`, type: 'task', priority: 'P2', title: canonicalType },
        '/workspace/issues/VC-reverse-type.md',
      );
      const yaml = canonicalToYaml({
        ...canonical,
        classification: { ...canonical.classification, issue_type: canonicalType },
      });
      expect(yaml.type).toBe(markdownType);
    });
```

Add this new `describe` block:

```typescript
  describe('markdownIssueToCanonical', () => {
    it('uses schema Markdown parsing and core canonical validation', () => {
      const task = markdownIssueToCanonical(`---
id: VC-310
title: Valid mapped issue
type: docs
status: READY
executor: claude-code
project: kanban-task-engine
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P3
labels:
  - docs
---

## 목적
Document the contract.

## 컨텍스트
Core owns canonical validation.

## Acceptance Criteria
- A docs issue maps to canonical Task.

## 실행 힌트
Run mapper tests.
`, '/workspace/issues/VC-310.md');

      expect(task.task_ref.external_id).toBe('VC-310');
      expect(task.classification.issue_type).toBe('Task');
      expect(task.classification.priority).toBe('Low');
      expect(task.automation.useAcp).toBe(true);
    });
  });
```

- [ ] **Step 2: Run mapper tests to verify current failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- mapper.test.ts
```

Expected: FAIL during compilation because `packages/core/src/store/mapper.ts` imports removed `validateCanonicalIssue` from `@kanban-task-engine/schema`.

- [ ] **Step 3: Rewire mapper to core validation**

Edit `packages/core/src/store/mapper.ts`.

Replace:

```typescript
import { parseIssueMarkdown, validateCanonicalIssue } from '@kanban-task-engine/schema';
```

with:

```typescript
import { parseIssueMarkdown } from '@kanban-task-engine/schema';
import { validateCanonicalTask } from '../validation/canonical-task';
```

Replace:

```typescript
  const canonical = validateCanonicalIssue(task);
```

with:

```typescript
  const canonical = validateCanonicalTask(task);
```

Keep the existing type and priority mapping functions if they already satisfy the table in the spec:

```typescript
epic -> Epic
bug -> Bug
task -> Task
chore -> Task
docs -> Task
P0 -> Blocker
P1 -> High
P2 -> Medium
P3 -> Low
Blocker | Critical -> P0
High -> P1
Medium -> P2
Low | Trivial -> P3
```

- [ ] **Step 4: Run mapper tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- mapper.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify schema canonical export is gone**

Run:

```bash
rg -n "CanonicalIssueModel|validateCanonicalIssue" packages/schema/src packages/core/src packages/*/src packages/*/tests
```

Expected: no production references to `CanonicalIssueModel` or `validateCanonicalIssue`. If this finds references in docs or old test names, inspect them; do not change docs outside this plan unless the reference is in a listed implementation file.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/store/mapper.ts packages/core/tests/mapper.test.ts
git commit -m "refactor(core): validate mapped issues in core"
```

### Task 4: Enforce State Machine Epic Transition Rules

**Files:**
- Modify: `packages/core/src/state-machine.ts`
- Modify: `packages/core/tests/state-machine.test.ts`
- Modify if direct transition constants require it: `packages/schema/src/status.ts`
- Modify if direct transition tests require it: `packages/schema/tests/status.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Edit `packages/core/tests/state-machine.test.ts`.

Inside `describe('valid transitions', ...)`, add:

```typescript
    it('allows REVIEW -> READY for non-epic retry', () => {
      expect(sm.canTransition('REVIEW', 'READY')).toBe(true);
    });
```

Inside `describe('task transition', ...)`, add:

```typescript
    it('transitions non-epic task from REVIEW to READY', () => {
      const reviewTask = {
        ...baseTask,
        workflow: { ...baseTask.workflow, normalized_status: 'REVIEW' as NormalizedStatus },
      };

      const result = sm.transition(reviewTask, 'READY');
      expect(result.workflow.normalized_status).toBe('READY');
      expect(result.completed).toBeUndefined();
    });

    it.each(['READY', 'RUNNING', 'REVIEW', 'FAILED'] as const)('rejects Epic transition to %s', newStatus => {
      const epicTask: CanonicalTaskModel = {
        ...baseTask,
        classification: { ...baseTask.classification, issue_type: 'Epic' },
      };

      expect(() => sm.transition(epicTask, newStatus)).toThrow(
        `Invalid Epic transition: TODO → ${newStatus} for task OC-001`,
      );
    });

    it('allows Epic TODO -> DONE', () => {
      const epicTask: CanonicalTaskModel = {
        ...baseTask,
        classification: { ...baseTask.classification, issue_type: 'Epic' },
      };

      const result = sm.transition(epicTask, 'DONE');
      expect(result.workflow.normalized_status).toBe('DONE');
      expect(result.completed).toBeDefined();
    });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- state-machine.test.ts
```

Expected: FAIL. `REVIEW -> READY` currently fails if it is missing from `VALID_TRANSITIONS`, and Epic transition rejection fails because `transition()` only checks global transitions.

- [ ] **Step 3: Add non-Epic transition if missing**

Inspect `packages/schema/src/status.ts`.

If `VALID_ISSUE_TRANSITIONS` does not contain `REVIEW -> READY`, add it so the non-Epic global transition table contains:

```typescript
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'READY' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'REVIEW', to: 'FAILED' },
```

If `packages/schema/tests/status.test.ts` checks transitions, add:

```typescript
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'REVIEW', to: 'READY' });
```

- [ ] **Step 4: Implement Epic transition guard**

Edit `packages/core/src/state-machine.ts`.

Add the Epic helper near the raw status constants:

```typescript
const EPIC_ALLOWED_TRANSITIONS: Record<NormalizedStatus, ReadonlySet<NormalizedStatus>> = {
  TODO: new Set(['DONE']),
  READY: new Set(),
  RUNNING: new Set(),
  REVIEW: new Set(),
  DONE: new Set(),
  FAILED: new Set(),
};
```

At the start of `transition()`, before the existing global `canTransition()` check, add:

```typescript
    if (task.classification.issue_type === 'Epic') {
      const allowed = EPIC_ALLOWED_TRANSITIONS[task.workflow.normalized_status];
      if (!allowed?.has(newStatus)) {
        throw new Error(
          `Invalid Epic transition: ${task.workflow.normalized_status} → ${newStatus} for task ${task.task_ref.external_id}`
        );
      }
    } else if (!this.canTransition(task.workflow.normalized_status, newStatus)) {
      throw new Error(
        `Invalid transition: ${task.workflow.normalized_status} → ${newStatus} for task ${task.task_ref.external_id}`
      );
    }
```

Then remove the original standalone global transition guard so the method checks non-Epic tasks only once.

- [ ] **Step 5: Run focused tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- status.test.ts
pnpm --filter @kanban-task-engine/core test -- state-machine.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state-machine.ts packages/core/tests/state-machine.test.ts packages/schema/src/status.ts packages/schema/tests/status.test.ts
git commit -m "feat(core): enforce epic transition contract"
```

### Task 5: Add Recipe Module Registry and Explicit Dependency Interfaces

**Files:**
- Create: `packages/core/src/recipes/module-registry.ts`
- Create: `packages/core/tests/module-registry.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/modules/audit-log-module.ts`
- Modify: `packages/core/src/modules/git-checkpoint-module.ts`
- Modify: `packages/core/src/modules/state-transition-module.ts`

- [ ] **Step 1: Write failing registry tests**

Create `packages/core/tests/module-registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { StateMachine } from '../src/state-machine';
import { ModuleRegistry, createDefaultModuleRegistry, type EventWriter, type GitRunner } from '../src/recipes/module-registry';
import type { AutomationModule } from '../src/runtime/module';

describe('ModuleRegistry', () => {
  it('registers and resolves a module factory with dependencies', () => {
    const registry = new ModuleRegistry();
    registry.register('custom', dependencies => ({
      name: dependencies.store ? 'custom-with-store' : 'custom',
      sideEffects: [],
      async run(context) {
        return context;
      },
    }));

    const module = registry.resolve('custom', {
      store: {
        findByExternalKey: async () => null,
        saveTask: async () => undefined,
        updateTask: async () => undefined,
        writeBack: async () => undefined,
        listTasks: async () => [],
        deleteTask: async () => undefined,
      },
    });

    expect(module.name).toBe('custom-with-store');
  });

  it('assembles built-in recipe modules in recipe order', () => {
    const events: Record<string, unknown>[] = [];
    const eventWriter: EventWriter = {
      append: async event => {
        events.push(event);
      },
    };
    const gitRunner: GitRunner = {
      run: async args => ({ stdout: args.join(' '), stderr: '' }),
    };

    const registry = createDefaultModuleRegistry();
    const modules = registry.assemble({
      mode: 'home-execution',
      vaultPath: '/tmp/kanban-vault',
      modules: ['manual-command-trigger', 'state-transition', 'audit-log', 'git-checkpoint'],
      policy: { allowedSideEffects: ['writeIssue', 'writeEvent', 'gitCommit'] },
    }, {
      stateMachine: new StateMachine(),
      eventWriter,
      gitRunner,
    });

    expect(modules.map(module => module.name)).toEqual([
      'manual-command-trigger',
      'state-transition',
      'audit-log',
      'git-checkpoint',
    ]);
  });

  it('rejects unknown recipe module before execution', () => {
    const registry = createDefaultModuleRegistry();

    expect(() => registry.assemble({
      mode: 'home-execution',
      modules: ['manual-command-trigger', 'missing-module'],
      policy: { allowedSideEffects: [] },
    }, {})).toThrow('Unknown recipe module: missing-module');
  });

  it('rejects duplicate module names', () => {
    const registry = new ModuleRegistry();
    const factory = (): AutomationModule => ({
      name: 'duplicate',
      sideEffects: [],
      async run(context) {
        return context;
      },
    });

    registry.register('duplicate', factory);
    expect(() => registry.register('duplicate', factory)).toThrow('Recipe module already registered: duplicate');
  });
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- module-registry.test.ts
```

Expected: FAIL with module resolution error for `../src/recipes/module-registry`.

- [ ] **Step 3: Implement registry**

Create `packages/core/src/recipes/module-registry.ts`:

```typescript
import { createAuditLogModule } from '../modules/audit-log-module';
import { createGitCheckpointModule } from '../modules/git-checkpoint-module';
import { createManualCommandTrigger } from '../modules/manual-command-trigger';
import { createStateTransitionModule } from '../modules/state-transition-module';
import { StateMachine } from '../state-machine';
import type { AutomationModule } from '../runtime/module';
import type { TaskStore } from '../types';
import type { AutomationRecipe } from './recipe-loader';

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
  private readonly factories = new Map<string, ModuleFactory>();

  register(name: string, factory: ModuleFactory): void {
    if (this.factories.has(name)) {
      throw new Error(`Recipe module already registered: ${name}`);
    }
    this.factories.set(name, factory);
  }

  resolve(name: string, dependencies: ModuleFactoryDependencies): AutomationModule {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Unknown recipe module: ${name}`);
    }
    return factory(dependencies);
  }

  assemble(recipe: AutomationRecipe, dependencies: ModuleFactoryDependencies): AutomationModule[] {
    return recipe.modules.map(name => this.resolve(name, dependencies));
  }
}

export function createDefaultModuleRegistry(): ModuleRegistry {
  const registry = new ModuleRegistry();
  registry.register('manual-command-trigger', () => createManualCommandTrigger());
  registry.register('state-transition', dependencies => createStateTransitionModule(dependencies.stateMachine ?? new StateMachine()));
  registry.register('audit-log', dependencies => {
    if (dependencies.eventWriter) {
      return {
        name: 'audit-log',
        sideEffects: ['writeEvent'],
        async run(context) {
          const event = context.values.event;
          if (event && typeof event === 'object' && !Array.isArray(event)) {
            await dependencies.eventWriter!.append(event as Record<string, unknown>);
          }
          return context;
        },
      };
    }
    return createAuditLogModule('events/audit.jsonl');
  });
  registry.register('git-checkpoint', dependencies => createGitCheckpointModule(
    '.',
    'chore: checkpoint kanban vault',
    dependencies.gitRunner
      ? async command => {
          const result = await dependencies.gitRunner!.run(command);
          return { code: result.stderr ? 1 : 0, stdout: result.stdout, stderr: result.stderr };
        }
      : undefined,
  ));
  return registry;
}
```

This implementation keeps existing module factories intact and adapts explicit registry dependencies at assembly time. If TypeScript rejects `undefined` as the third `createGitCheckpointModule()` argument, use a local conditional:

```typescript
  registry.register('git-checkpoint', dependencies => {
    if (!dependencies.gitRunner) {
      return createGitCheckpointModule('.', 'chore: checkpoint kanban vault');
    }
    return createGitCheckpointModule('.', 'chore: checkpoint kanban vault', async command => {
      const result = await dependencies.gitRunner!.run(command);
      return { code: result.stderr ? 1 : 0, stdout: result.stdout, stderr: result.stderr };
    });
  });
```

Edit `packages/core/src/index.ts`:

```typescript
export {
  ModuleRegistry,
  createDefaultModuleRegistry,
} from './recipes/module-registry';
export type {
  EventWriter,
  GitRunner,
  ModuleFactory,
  ModuleFactoryDependencies,
} from './recipes/module-registry';
```

- [ ] **Step 4: Run registry tests to verify pass**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- module-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/recipes/module-registry.ts packages/core/tests/module-registry.test.ts packages/core/src/index.ts packages/core/src/modules/audit-log-module.ts packages/core/src/modules/git-checkpoint-module.ts packages/core/src/modules/state-transition-module.ts
git commit -m "feat(core): assemble recipe modules through registry"
```

### Task 6: Keep Recipe Parsing Separate from Module Assembly

**Files:**
- Modify: `packages/core/tests/recipe-loader.test.ts`
- Modify if required: `packages/core/src/recipes/recipe-loader.ts`

- [ ] **Step 1: Write parser-only recipe tests**

Edit `packages/core/tests/recipe-loader.test.ts`.

Replace the valid recipe module name `parser` with a built-in module name:

```typescript
modules:
  - manual-command-trigger
```

Update the assertion:

```typescript
    expect(recipe.modules).toEqual(['manual-command-trigger']);
```

Add:

```typescript
  it('parses recipe module names without resolving module instances', () => {
    const recipe = parseRecipeYaml(`
mode: home-execution
vaultPath: /tmp/kanban-vault
modules:
  - manual-command-trigger
  - state-transition
  - audit-log
  - git-checkpoint
policy:
  allowedSideEffects:
    - writeIssue
    - writeEvent
    - gitCommit
`);

    expect(recipe.modules).toEqual([
      'manual-command-trigger',
      'state-transition',
      'audit-log',
      'git-checkpoint',
    ]);
    expect(recipe.vaultPath).toBe('/tmp/kanban-vault');
  });

  it('allows unknown module names during parse because assembly validates them', () => {
    const recipe = parseRecipeYaml(`
mode: home-execution
modules:
  - not-implemented
policy:
  allowedSideEffects: []
`);

    expect(recipe.modules).toEqual(['not-implemented']);
  });
```

- [ ] **Step 2: Run recipe loader tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- recipe-loader.test.ts
```

Expected: PASS if `parseRecipeYaml()` already parses shape only. If it fails because parsing rejects unknown module names, remove module-name validation from `packages/core/src/recipes/recipe-loader.ts`; assembly validation belongs in `ModuleRegistry`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/recipe-loader.test.ts packages/core/src/recipes/recipe-loader.ts
git commit -m "test(core): document recipe parse and assembly boundary"
```

### Task 7: Full Workspace Verification and Adapter Fallout

**Files:**
- Modify only if tests or build fail because of the contract changes:
  - `packages/adapter-firebase/src/firebase-mapper.ts`
  - `packages/adapter-firebase/tests/firebase-mapper.test.ts`
  - `packages/adapter-github/src/status-mapping.ts`
  - `packages/adapter-github/tests/status-mapping.test.ts`
  - `packages/adapter-cli/src/prompt-builder.ts`
  - `packages/adapter-cli/tests/prompt-builder.test.ts`
  - `packages/adapter-openclaw/src/openclaw-adapter.ts`
  - `packages/adapter-openclaw/tests/openclaw-adapter.test.ts`
  - Other files only if `pnpm test` or `pnpm build` names them in an error.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS. If it fails, capture the first failing package and fix only the contract fallout. Likely fixes are status transition expectation updates or imports that still reference removed schema canonical exports.

- [ ] **Step 2: Run full build**

Run:

```bash
pnpm build
```

Expected: PASS. If it fails on schema canonical imports, replace those imports with `CanonicalTaskModel` from `@kanban-task-engine/core` for type-only adapter usage or with `validateCanonicalTask` from `@kanban-task-engine/core` for runtime validation usage. If it fails on module registry exports, add the missing `ModuleRegistry`, `createDefaultModuleRegistry`, `ModuleFactoryDependencies`, `EventWriter`, and `GitRunner` exports to `packages/core/src/index.ts`.

- [ ] **Step 3: Verify ownership boundaries with search**

Run:

```bash
rg -n "CanonicalIssueModel|validateCanonicalIssue" packages/schema/src packages/core/src packages/adapter-*/src packages/schema/tests packages/core/tests packages/adapter-*/tests
rg -n "from '@kanban-task-engine/core'|from \"@kanban-task-engine/core\"|from '../../core|from \"../../core" packages/schema/src packages/schema/tests
```

Expected:

- First command has no output.
- Second command has no output.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit verification fallout**

If Step 1 or Step 2 required adapter or export fixes:

```bash
git add packages/adapter-firebase packages/adapter-github packages/adapter-cli packages/adapter-openclaw packages/core/src/index.ts
git commit -m "fix(adapters): align with hardened kanban contracts"
```

If no files changed after Task 6, skip this commit.

### Task 8: Final Contract Audit

**Files:**
- No source changes expected.

- [ ] **Step 1: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: no uncommitted implementation files. Recent commits should show small sequenced commits for schema ownership, core validation, mapper validation, state-machine rules, module registry, recipe boundary, and optional adapter fallout.

- [ ] **Step 2: Run acceptance searches**

Run:

```bash
rg -n "export interface CanonicalIssueModel|validateCanonicalIssue" packages/schema/src
rg -n "export function validateCanonicalTask" packages/core/src
rg -n "REVIEW.*READY|from: 'REVIEW', to: 'READY'" packages/schema/src packages/core/tests
rg -n "Unknown recipe module" packages/core/src packages/core/tests
```

Expected:

- First command has no output.
- Second command finds `packages/core/src/validation/canonical-task.ts`.
- Third command finds transition table and tests.
- Fourth command finds module registry implementation and tests.

- [ ] **Step 3: Re-run required workspace verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: both PASS.

- [ ] **Step 4: Commit final audit artifact only if a file changed**

If Step 2 exposed a missed implementation issue and you fixed it:

```bash
git add <fixed-files>
git commit -m "chore: complete kanban contract hardening audit"
```

If no files changed, do not create an empty commit.

## Self-Review Checklist

- [ ] Acceptance: `CanonicalIssueModel` is removed as a production export from schema.
  - Covered by Task 1 Steps 3 and 5; audited again in Task 8 Step 2.
- [ ] Acceptance: `validateCanonicalTask()` exists in core and is used by Markdown-to-canonical mapping.
  - Covered by Task 2 and Task 3 Steps 3-5.
- [ ] Acceptance: `packages/schema` has no import from `packages/core`.
  - Covered by Task 1 Step 5 and Task 7 Step 3.
- [ ] Acceptance: `StateMachine.transition()` rejects Epic transitions to `READY`, `RUNNING`, `REVIEW`, or `FAILED`.
  - Covered by Task 4 Steps 1, 4, and 5.
- [ ] Acceptance: Tests cover non-Epic section requirements and Epic section requirements.
  - Covered by Task 1 Step 1.
- [ ] Acceptance: Tests cover Epic transition rejection.
  - Covered by Task 4 Step 1.
- [ ] Acceptance: Tests cover non-Epic `REVIEW -> READY`.
  - Covered by Task 4 Steps 1 and 3.
- [ ] Acceptance: Type mapping coverage exists for `epic`, `bug`, `task`, `chore`, and `docs`.
  - Covered by Task 3 Step 1.
- [ ] Acceptance: Priority mapping coverage exists for `P0`, `P1`, `P2`, `P3`, and reverse canonical priorities.
  - Covered by Task 3 Step 1.
- [ ] Acceptance: Recipe module assembly exists with explicit dependency interfaces.
  - Covered by Task 5 Steps 1 and 3.
- [ ] Acceptance: Unknown recipe module names fail during assembly with `Unknown recipe module: <name>`.
  - Covered by Task 5 Steps 1 and 3.
- [ ] Acceptance: Recipe parsing and module assembly remain separate phases.
  - Covered by Task 6.
- [ ] Acceptance: Full workspace verification passes with `pnpm test` and `pnpm build`.
  - Covered by Task 7 and Task 8.
