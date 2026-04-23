# Kanban Schema and Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared Jira-compatible issue schema, configurable vault paths, Markdown issue parsing, and registry resolution needed by Home and Work modes.

**Architecture:** A new `@kanban-task-engine/schema` package owns shared constants, schema validation, constrained Markdown parsing, and fixture helpers. `@kanban-task-engine/core` imports schema contracts, updates status naming to `TODO/READY/RUNNING/REVIEW/DONE/FAILED`, resolves `KANBAN_HOME`, converts parsed issue documents into canonical JSON, and reads vault `registry.yaml`.

**Tech Stack:** TypeScript, Vitest, `yaml`, Node `fs/promises`, pnpm workspaces.

---

## File Structure

- Create: `packages/schema/package.json` - package manifest.
- Create: `packages/schema/tsconfig.json` - TypeScript config.
- Create: `packages/schema/src/index.ts` - package exports.
- Create: `packages/schema/src/status.ts` - shared status constants and transition table.
- Create: `packages/schema/src/issue-schema.ts` - frontmatter and canonical validators.
- Create: `packages/schema/src/fixtures.ts` - reusable valid/invalid fixture strings.
- Create: `packages/schema/tests/issue-schema.test.ts` - schema unit tests.
- Modify: `packages/core/package.json` - add schema dependency.
- Modify: `packages/core/src/types.ts` - align canonical model with new issue schema.
- Modify: `packages/core/src/state-machine.ts` - use new status model.
- Modify: `packages/core/src/store/path-validator.ts` - introduce `KANBAN_HOME`.
- Create: `packages/core/src/config/kanban-home.ts` - path expansion/resolution.
- Modify: `packages/core/src/store/mapper.ts` - convert parsed issue documents into canonical JSON.
- Modify: `packages/core/src/store/workspace-resolver.ts` - support `registry.yaml`.
- Create: `packages/core/tests/kanban-home.test.ts` - path config tests.
- Create: `packages/core/tests/issue-markdown-parser.test.ts` - Markdown parser tests.
- Modify: `packages/core/tests/state-machine.test.ts` - new statuses.
- Modify: `packages/core/tests/workspace-resolver.test.ts` - registry tests.

### Task 1: Add Schema Package Skeleton

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/index.ts`

- [ ] **Step 1: Write package manifest**

Create `packages/schema/package.json`:

```json
{
  "name": "@kanban-task-engine/schema",
  "version": "0.1.0",
  "description": "Shared issue schema and status model for kanban-task-engine",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig**

Create `packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write package index**

Create `packages/schema/src/index.ts`:

```typescript
export * from './status';
export * from './issue-schema';
export * from './fixtures';
```

- [ ] **Step 4: Run package build to verify expected failure**

Run:

```bash
pnpm --filter @kanban-task-engine/schema build
```

Expected: FAIL because `status`, `issue-schema`, and `fixtures` are not defined yet.

- [ ] **Step 5: Commit skeleton**

Run:

```bash
git add packages/schema/package.json packages/schema/tsconfig.json packages/schema/src/index.ts
git commit --no-gpg-sign -m "feat: add schema package skeleton" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 2: Define Shared Status Model

**Files:**
- Create: `packages/schema/src/status.ts`
- Test: `packages/schema/tests/status.test.ts`

- [ ] **Step 1: Write failing status tests**

Create `packages/schema/tests/status.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ISSUE_STATUSES, isIssueStatus, VALID_ISSUE_TRANSITIONS, toJiraStatusHint } from '../src/status';

describe('issue status schema', () => {
  it('defines the shared status order', () => {
    expect(ISSUE_STATUSES).toEqual(['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED']);
  });

  it('recognizes valid statuses', () => {
    expect(isIssueStatus('READY')).toBe(true);
    expect(isIssueStatus('ACTIVE')).toBe(false);
  });

  it('defines explicit execution transitions', () => {
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'READY', to: 'RUNNING' });
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'RUNNING', to: 'REVIEW' });
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'RUNNING', to: 'FAILED' });
  });

  it('maps statuses to Jira hints', () => {
    expect(toJiraStatusHint('RUNNING')).toBe('In Progress');
    expect(toJiraStatusHint('FAILED')).toBe('Blocked');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/status.test.ts
```

Expected: FAIL with module not found for `../src/status`.

- [ ] **Step 3: Implement status model**

Create `packages/schema/src/status.ts`:

```typescript
export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;

export type IssueStatus = typeof ISSUE_STATUSES[number];

export interface IssueTransition {
  from: IssueStatus;
  to: IssueStatus;
}

export const VALID_ISSUE_TRANSITIONS: IssueTransition[] = [
  { from: 'TODO', to: 'READY' },
  { from: 'TODO', to: 'FAILED' },
  { from: 'READY', to: 'RUNNING' },
  { from: 'READY', to: 'TODO' },
  { from: 'RUNNING', to: 'REVIEW' },
  { from: 'RUNNING', to: 'FAILED' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'REVIEW', to: 'FAILED' },
  { from: 'FAILED', to: 'READY' },
];

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === 'string' && (ISSUE_STATUSES as readonly string[]).includes(value);
}

const JIRA_STATUS_HINTS: Record<IssueStatus, string> = {
  TODO: 'To Do',
  READY: 'Ready',
  RUNNING: 'In Progress',
  REVIEW: 'In Review',
  DONE: 'Done',
  FAILED: 'Blocked',
};

export function toJiraStatusHint(status: IssueStatus): string {
  return JIRA_STATUS_HINTS[status];
}
```

- [ ] **Step 4: Run status tests**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit status model**

Run:

```bash
git add packages/schema/src/status.ts packages/schema/tests/status.test.ts
git commit --no-gpg-sign -m "feat: define shared issue status model" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 3: Define Issue Schema Validation

**Files:**
- Create: `packages/schema/src/issue-schema.ts`
- Create: `packages/schema/src/fixtures.ts`
- Test: `packages/schema/tests/issue-schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `packages/schema/tests/issue-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN, INVALID_ISSUE_MISSING_GOAL } from '../src/fixtures';
import { parseIssueMarkdown, validateIssueFrontmatter } from '../src/issue-schema';

describe('issue schema', () => {
  it('parses valid issue markdown', () => {
    const result = parseIssueMarkdown(VALID_ISSUE_MARKDOWN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frontmatter.status).toBe('READY');
      expect(result.sections.Goal).toContain('만료 직전');
    }
  });

  it('rejects missing required sections', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_MISSING_GOAL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Missing required section: Goal');
    }
  });

  it('rejects unknown statuses', () => {
    const result = validateIssueFrontmatter({
      id: 'issue-x',
      title: 'Bad status',
      issueType: 'task',
      project: 'demo',
      status: 'ACTIVE',
      priority: 'high',
      createdAt: '2026-04-20',
      updatedAt: '2026-04-20',
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing schema tests**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/issue-schema.test.ts
```

Expected: FAIL with module not found for `../src/issue-schema`.

- [ ] **Step 3: Add fixtures**

Create `packages/schema/src/fixtures.ts`:

```typescript
export const VALID_ISSUE_MARKDOWN = `---
id: issue-auth-refresh-001
title: 토큰 갱신 플로우 개선
issueType: story
project: auth-platform
status: READY
priority: high
createdAt: 2026-04-20
updatedAt: 2026-04-20
---

## Goal

만료 직전 access token 자동 갱신 처리.

## Acceptance Criteria

- refresh token이 유효하면 access token 재발급

## Implementation Tasks

- [ ] refresh token 검증 로직 추가

## Notes

초기 설계 메모.
`;

export const INVALID_ISSUE_MISSING_GOAL = `---
id: issue-auth-refresh-001
title: 토큰 갱신 플로우 개선
issueType: story
project: auth-platform
status: READY
priority: high
createdAt: 2026-04-20
updatedAt: 2026-04-20
---

## Acceptance Criteria

- refresh token이 유효하면 access token 재발급

## Implementation Tasks

- [ ] refresh token 검증 로직 추가

## Notes

초기 설계 메모.
`;
```

- [ ] **Step 4: Implement schema validation**

Create `packages/schema/src/issue-schema.ts`:

```typescript
import YAML from 'yaml';
import { isIssueStatus, IssueStatus } from './status';

export interface IssueFrontmatter {
  id: string;
  title: string;
  issueType: string;
  project: string;
  status: IssueStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  parent?: string;
  labels?: string[];
  executor?: string;
  syncTarget?: string;
  jiraProject?: string;
  jiraKey?: string;
  automation?: Record<string, unknown>;
}

export interface ParsedIssueMarkdown {
  frontmatter: IssueFrontmatter;
  sections: Record<string, string>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const REQUIRED_FIELDS = ['id', 'title', 'issueType', 'project', 'status', 'priority', 'createdAt', 'updatedAt'] as const;
const REQUIRED_SECTIONS = ['Goal', 'Acceptance Criteria', 'Implementation Tasks', 'Notes'] as const;

export function validateIssueFrontmatter(input: Record<string, unknown>): ValidationResult<IssueFrontmatter> {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (input.status !== undefined && !isIssueStatus(input.status)) {
    errors.push(`Invalid status: ${String(input.status)}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as IssueFrontmatter };
}

export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const frontmatterMatch = content.match(/^---\\s*\\n([\\s\\S]*?)\\n---\\s*\\n?/);
  if (!frontmatterMatch) return { ok: false, errors: ['Missing YAML frontmatter'] };

  const parsed = YAML.parse(frontmatterMatch[1]) as Record<string, unknown>;
  const frontmatter = validateIssueFrontmatter(parsed);
  const errors = frontmatter.ok ? [] : [...frontmatter.errors];
  const body = content.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);

  for (const section of REQUIRED_SECTIONS) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { frontmatter: frontmatter.value, sections } };
}

function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const matches = [...body.matchAll(/^##\\s+(.+)\\n([\\s\\S]*?)(?=^##\\s+|\\s*$)/gm)];
  for (const match of matches) {
    sections[match[1].trim()] = match[2].trim();
  }
  return sections;
}
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/issue-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build schema package**

Run:

```bash
pnpm --filter @kanban-task-engine/schema build
```

Expected: PASS.

- [ ] **Step 7: Commit schema validation**

Run:

```bash
git add packages/schema
git commit --no-gpg-sign -m "feat: validate markdown issue schema" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 4: Align Core Status Types

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/state-machine.ts`
- Modify: `packages/core/tests/state-machine.test.ts`

- [ ] **Step 1: Add schema dependency**

Modify `packages/core/package.json` dependencies:

```json
"dependencies": {
  "@kanban-task-engine/schema": "workspace:*",
  "chokidar": "^3.6.0",
  "yaml": "^2.4.0"
}
```

- [ ] **Step 2: Update failing state-machine test**

In `packages/core/tests/state-machine.test.ts`, replace old status assertions with:

```typescript
it('allows READY -> RUNNING', () => {
  expect(sm.canTransition('READY', 'RUNNING')).toBe(true);
});

it('allows RUNNING -> REVIEW', () => {
  expect(sm.canTransition('RUNNING', 'REVIEW')).toBe(true);
});

it('rejects TODO -> DONE', () => {
  expect(sm.canTransition('TODO', 'DONE')).toBe(false);
});
```

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/state-machine.test.ts
```

Expected: FAIL because core still defines old status names.

- [ ] **Step 3: Update core types**

In `packages/core/src/types.ts`, replace `NormalizedStatus` and `VALID_TRANSITIONS` with:

```typescript
export type { IssueStatus as NormalizedStatus, IssueTransition as StateTransition } from '@kanban-task-engine/schema';
export { VALID_ISSUE_TRANSITIONS as VALID_TRANSITIONS } from '@kanban-task-engine/schema';

export type RawStatusCategory =
  | 'TODO'
  | 'READY'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'FAILED';
```

Keep the rest of the file, and update any `Sync.last_source` union in later adapter tasks only if tests require it.

- [ ] **Step 4: Update state machine mapping**

In `packages/core/src/state-machine.ts`, replace maps with:

```typescript
const STATUS_TO_RAW: Record<NormalizedStatus, string> = {
  TODO: 'TODO',
  READY: 'READY',
  RUNNING: 'RUNNING',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

const STATUS_TO_CATEGORY: Record<NormalizedStatus, RawStatusCategory> = {
  TODO: 'TODO',
  READY: 'READY',
  RUNNING: 'IN_PROGRESS',
  REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
  FAILED: 'FAILED',
};
```

Update `isTerminalStatus`:

```typescript
isTerminalStatus(status: NormalizedStatus): boolean {
  return status === 'DONE' || status === 'FAILED';
}
```

- [ ] **Step 5: Run state machine tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/state-machine.test.ts
```

Expected: PASS after updating remaining old fixture values in the test file to new statuses.

- [ ] **Step 6: Commit status alignment**

Run:

```bash
git add packages/core/package.json packages/core/src/types.ts packages/core/src/state-machine.ts packages/core/tests/state-machine.test.ts pnpm-lock.yaml
git commit --no-gpg-sign -m "feat: align core status model with issue schema" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 5: Add KANBAN_HOME Path Resolution

**Files:**
- Create: `packages/core/src/config/kanban-home.ts`
- Modify: `packages/core/src/store/path-validator.ts`
- Create: `packages/core/tests/kanban-home.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing path tests**

Create `packages/core/tests/kanban-home.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { resolveKanbanHome, getAllowedIssueBasePath } from '../src/config/kanban-home';
import { validatePath } from '../src/store/path-validator';

describe('kanban home config', () => {
  it('defaults to workspace-kanban vault', () => {
    vi.stubEnv('KANBAN_HOME', '');
    expect(resolveKanbanHome()).toBe(path.join(os.homedir(), '.openclaw', 'workspace-kanban', 'kanban'));
    vi.unstubAllEnvs();
  });

  it('uses KANBAN_HOME when provided', () => {
    vi.stubEnv('KANBAN_HOME', '~/custom-kanban');
    expect(resolveKanbanHome()).toBe(path.join(os.homedir(), 'custom-kanban'));
    vi.unstubAllEnvs();
  });

  it('allows paths under issues', () => {
    vi.stubEnv('KANBAN_HOME', '~/custom-kanban');
    const allowed = getAllowedIssueBasePath();
    expect(allowed).toBe(path.join(os.homedir(), 'custom-kanban', 'issues'));
    expect(validatePath(path.join(allowed, 'openclaw', 'issue-1.md'))).toContain('issue-1.md');
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run failing path tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/kanban-home.test.ts
```

Expected: FAIL with module not found for `../src/config/kanban-home`.

- [ ] **Step 3: Implement config helper**

Create `packages/core/src/config/kanban-home.ts`:

```typescript
import os from 'os';
import path from 'path';

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function resolveKanbanHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.KANBAN_HOME && env.KANBAN_HOME.trim() !== ''
    ? env.KANBAN_HOME
    : '~/.openclaw/workspace-kanban/kanban';
  return path.resolve(expandHome(configured));
}

export function getAllowedIssueBasePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveKanbanHome(env), 'issues');
}
```

- [ ] **Step 4: Update path validator**

Replace `packages/core/src/store/path-validator.ts` with:

```typescript
import path from 'path';
import { getAllowedIssueBasePath } from '../config/kanban-home';

export function getAllowedBasePaths(): string[] {
  return [path.resolve(getAllowedIssueBasePath())];
}

export function validatePath(requestedPath: string): string {
  const resolved = path.resolve(requestedPath);
  const isAllowed = getAllowedBasePaths().some(base => {
    const normalizedBase = base.endsWith(path.sep) ? base : base + path.sep;
    return resolved.startsWith(normalizedBase);
  });

  if (!isAllowed) {
    throw new Error(`Path traversal blocked: ${requestedPath}`);
  }

  return resolved;
}

export function isPathWithinAllowed(requestedPath: string): boolean {
  try {
    validatePath(requestedPath);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Export config helper**

Add to `packages/core/src/index.ts`:

```typescript
export { resolveKanbanHome, getAllowedIssueBasePath, expandHome } from './config/kanban-home';
```

- [ ] **Step 6: Run path tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/kanban-home.test.ts tests/path-validator.test.ts
```

Expected: PASS after updating `path-validator.test.ts` expectations to use `KANBAN_HOME`.

- [ ] **Step 7: Commit path configuration**

Run:

```bash
git add packages/core/src/config/kanban-home.ts packages/core/src/store/path-validator.ts packages/core/src/index.ts packages/core/tests/kanban-home.test.ts packages/core/tests/path-validator.test.ts
git commit --no-gpg-sign -m "feat: resolve kanban home paths" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 6: Convert Markdown Issues to Canonical JSON

**Files:**
- Modify: `packages/core/src/store/mapper.ts`
- Create: `packages/core/tests/issue-markdown-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `packages/core/tests/issue-markdown-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN } from '@kanban-task-engine/schema';
import { markdownIssueToCanonical } from '../src/store/mapper';

describe('markdownIssueToCanonical', () => {
  it('converts constrained Markdown issue to canonical JSON', () => {
    const task = markdownIssueToCanonical(
      VALID_ISSUE_MARKDOWN,
      '/vault/issues/openclaw/issue-auth-refresh-001.md'
    );
    expect(task.task_ref.provider).toBe('local');
    expect(task.task_ref.external_id).toBe('issue-auth-refresh-001');
    expect(task.summary).toBe('토큰 갱신 플로우 개선');
    expect(task.workflow.normalized_status).toBe('READY');
    expect(task.description_ref).toBe('/vault/issues/openclaw/issue-auth-refresh-001.md');
  });
});
```

- [ ] **Step 2: Run failing parser test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/issue-markdown-parser.test.ts
```

Expected: FAIL because `markdownIssueToCanonical` is not exported.

- [ ] **Step 3: Implement canonical mapping function**

Add to `packages/core/src/store/mapper.ts`:

```typescript
import { parseIssueMarkdown } from '@kanban-task-engine/schema';

export function markdownIssueToCanonical(content: string, filePath: string): CanonicalTaskModel {
  const parsed = parseIssueMarkdown(content);
  if (!parsed.ok) {
    throw new Error(parsed.errors.join('; '));
  }

  const { frontmatter, sections } = parsed.value;
  return {
    task_ref: {
      provider: 'local',
      external_key: frontmatter.project,
      external_id: frontmatter.id,
    },
    summary: frontmatter.title,
    description_ref: filePath,
    workflow: {
      normalized_status: frontmatter.status,
      raw_status: frontmatter.status,
      raw_status_category: frontmatter.status === 'RUNNING' ? 'IN_PROGRESS' :
        frontmatter.status === 'REVIEW' ? 'IN_REVIEW' :
        frontmatter.status,
    },
    classification: {
      issue_type: frontmatter.issueType as CanonicalTaskModel['classification']['issue_type'],
      priority: normalizePriority(frontmatter.priority),
      labels: frontmatter.labels ?? [],
      component: [],
    },
    ownership: {
      assignee: '',
      reporter: '',
    },
    planning: {},
    automation: {
      policy_id: String(frontmatter.automation?.policy_id ?? 'default'),
      on_enter: [],
      on_exit: [],
      execution_profile: 'standard',
      workspace: frontmatter.project,
      useAcp: frontmatter.executor === 'claude-code',
    },
    sync: {
      last_synced_at: frontmatter.updatedAt,
      last_source: 'local',
    },
    created: frontmatter.createdAt,
    updated: frontmatter.updatedAt,
  };
}

function normalizePriority(input: string): CanonicalTaskModel['classification']['priority'] {
  const value = input.toLowerCase();
  if (value === 'blocker') return 'Blocker';
  if (value === 'critical') return 'Critical';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  if (value === 'trivial') return 'Trivial';
  return 'Medium';
}
```

- [ ] **Step 4: Run parser test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/issue-markdown-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

Run:

```bash
git add packages/core/src/store/mapper.ts packages/core/tests/issue-markdown-parser.test.ts
git commit --no-gpg-sign -m "feat: parse markdown issues to canonical model" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 7: Resolve Vault Registry

**Files:**
- Modify: `packages/core/src/store/workspace-resolver.ts`
- Modify: `packages/core/tests/workspace-resolver.test.ts`

- [ ] **Step 1: Write failing registry test**

Append to `packages/core/tests/workspace-resolver.test.ts`:

```typescript
describe('fromRegistry', () => {
  it('creates resolver from vault registry shape', () => {
    const resolver = WorkspaceResolver.fromRegistry({
      spaces: {
        openclaw: { type: 'single', issues: 'issues/openclaw', board: 'boards/openclaw.md' },
        'vibe-coding': {
          type: 'container',
          issues: 'issues/vibe-coding',
          board: 'boards/vibe-coding.md',
          projects: {
            'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' },
          },
        },
      },
    }, '/vault');

    expect(resolver.getTicketPath('openclaw', 'issue-1')).toBe('/vault/issues/openclaw/issue-1.md');
    expect(resolver.getTicketPath('vibe-coding', 'kanban-task-engine', 'issue-2')).toBe('/vault/issues/vibe-coding/kanban-task-engine/issue-2.md');
  });
});
```

- [ ] **Step 2: Run failing registry test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/workspace-resolver.test.ts
```

Expected: FAIL because `WorkspaceResolver.fromRegistry` is not defined.

- [ ] **Step 3: Implement registry factory**

Add to `WorkspaceResolver` in `packages/core/src/store/workspace-resolver.ts`:

```typescript
export interface VaultRegistry {
  spaces: Record<string, {
    type: WorkspaceType;
    issues: string;
    board: string;
    projects?: Record<string, { path: string }>;
  }>;
}

static fromRegistry(registry: VaultRegistry, vaultRoot: string): WorkspaceResolver {
  const config: Record<string, WorkspaceConfig> = {};
  for (const [space, entry] of Object.entries(registry.spaces)) {
    config[space] = {
      type: entry.type,
      path: path.join(vaultRoot, entry.issues),
      projects: entry.projects ? Object.keys(entry.projects) : undefined,
    };
  }
  return new WorkspaceResolver(config);
}
```

- [ ] **Step 4: Run workspace resolver tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/workspace-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registry support**

Run:

```bash
git add packages/core/src/store/workspace-resolver.ts packages/core/tests/workspace-resolver.test.ts
git commit --no-gpg-sign -m "feat: resolve workspaces from vault registry" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 8: Full Core Verification

**Files:**
- Read: all changed files in `packages/schema` and `packages/core`

- [ ] **Step 1: Run schema tests**

Run:

```bash
pnpm --filter @kanban-task-engine/schema test
```

Expected: PASS.

- [ ] **Step 2: Run core tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test
```

Expected: PASS. If adapter tests fail because they use old status names, update only the fixtures in the failing test file and rerun the same command.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm --filter @kanban-task-engine/schema build
pnpm --filter @kanban-task-engine/core build
```

Expected: both commands PASS.

- [ ] **Step 4: Commit verification-only fixture updates if any**

Run:

```bash
git status --short
```

Expected: no output. If output shows only test fixture status-name updates, commit them:

```bash
git add packages
git commit --no-gpg-sign -m "test: update core fixtures for issue statuses" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```
