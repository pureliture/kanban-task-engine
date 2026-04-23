# Kanban Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1에서 authoritative spec에 흡수된 신규 스키마 규약(`type`/`epic`/`created`/`updated`, 본문 4섹션(목적/컨텍스트/AC/실행 힌트) + Epic 변종(목표/범위/성공 지표/하위 티켓), `type` enum을 `epic|task|bug|chore|docs`로 제한, optional 필드 `working_dir`/`merge_into`/`run_count`/`depends_on`/`completed`, `VC-###` 스타일 id)을 engine TypeScript 코드에 반영한다. 실행 레이어(worktree + CLI 정렬)는 Plan 3 스코프.

**Architecture:** TDD-first, 패키지별 분리 커밋. 순서: **schema → core → adapter-firebase → templates/migration**. 각 패키지에서 fixtures/tests를 먼저 신규 스키마로 바꿔 테스트가 실패하도록 한 뒤, source를 고쳐 다시 통과시킨다. 패키지 간 의존(`@kanban-task-engine/schema`를 core가 참조, core를 adapters가 참조) 덕분에 이 순서가 강제된다. 외부 API 필드와 동명인 `createdAt`/`updatedAt` (adapter-github의 GitHub GraphQL 응답), `updatedAtMs` (adapter-openclaw 내부 timestamp)는 의미가 다르므로 건드리지 않는다.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, gray-matter(YAML frontmatter), `yaml` 라이브러리.

**Dependencies:** Plan 1(spec reconciliation) 커밋 완료 가정. 병렬 작성 가능하지만 실행은 Plan 1 이후.

---

## 전제 및 범위

- engine repo `~/Projects/kanban-task-engine/`에서만 작업. workspace repo는 건드리지 않음.
- **건드리지 않는 영역** (외부 API 혹은 별도 의미):
  - `packages/adapter-github/src/github-adapter.ts` — `createdAt`/`updatedAt`는 GitHub GraphQL 응답 필드.
  - `packages/adapter-openclaw/src/**` — `updatedAtMs` 등은 openclaw adapter 내부 타입. 스키마 필드명과 무관.
  - `packages/adapter-claude-code/src/**` — 현재 스키마 필드 직접 참조 없음 (grep 확인 완료).
  - `packages/adapter-jira/src/**` — 동상.
  - `packages/adapter-cli/src/**` — 동상.
  - `packages/core/src/modules/*`, `recipes/*`, `config/*` — 현재 필드명 직접 참조 없음.
- **건드리는 영역** (내부 스키마 사용):
  - `packages/schema/src/issue-schema.ts`, `packages/schema/src/fixtures.ts`
  - `packages/schema/tests/issue-schema.test.ts`
  - `packages/core/src/store/mapper.ts`, `packages/core/src/store/write-back.ts`
  - `packages/core/tests/mapper.test.ts`
  - `packages/core/src/types.ts` (`IssueType`/`Priority` 리터럴 union을 일부 조정)
  - `packages/adapter-firebase/src/firebase-mapper.ts`, `packages/adapter-firebase/tests/firebase-mapper.test.ts`
  - `templates/{base,task,bug,story}.md` (story 제거, epic/chore/docs 신규)
  - `scripts/migrate-tickets.ts` (구→신 변환기 추가)

- **New 필드 semantics 재확인**:
  - `type: epic|task|bug|chore|docs` (enum 강제)
  - `epic: <issue-id>` (optional, 부모 Epic 포인터)
  - `created`/`updated` (ISO date string, `createdAt`/`updatedAt` 리네임)
  - `completed` (status=DONE 시 엔진이 자동 기입; optional)
  - `working_dir`, `merge_into`, `run_count`, `depends_on` — optional, Plan 3에서 사용. 이 plan에서는 파싱·검증만.
- **Priority 규약**: frontmatter는 `P0|P1|P2|P3`(neu). canonical `classification.priority`는 Jira 호환 이름(`Blocker|Critical|High|Medium|Low|Trivial`) 유지, mapper가 P-style → Jira 매핑. 역방향(canonicalToYaml)은 Jira → P-style.
- **Body sections** (required for non-epic): `목적`, `컨텍스트`, `Acceptance Criteria`, `실행 힌트`. `로그`는 optional (executor가 자동 append).
- **Body sections** (required for epic): `목표`, `범위`, `성공 지표`, `하위 티켓`. `로그`는 optional.
- ID는 free-form 문자열로 파서는 수용한다. `<PREFIX>-<seq>` 패턴 강제·시퀀스 할당기는 **Plan 3 스코프**.

## File Structure

**Modify:**

- `packages/schema/src/issue-schema.ts`
- `packages/schema/src/fixtures.ts`
- `packages/schema/tests/issue-schema.test.ts`
- `packages/core/src/types.ts`
- `packages/core/src/store/mapper.ts`
- `packages/core/src/store/write-back.ts`
- `packages/core/tests/mapper.test.ts`
- `packages/adapter-firebase/src/firebase-mapper.ts`
- `packages/adapter-firebase/tests/firebase-mapper.test.ts`
- `templates/base.md`
- `templates/task.md`
- `templates/bug.md`
- `scripts/migrate-tickets.ts`

**Create:**

- `templates/epic.md`
- `templates/chore.md`
- `templates/docs.md`

**Delete:**

- `templates/story.md` (story 타입 제거에 따라)

**Not modified (확인 필요 시 grep으로 잔재 없음을 입증):** `packages/adapter-{github,openclaw,claude-code,jira,cli}/**`, `packages/core/src/modules/**`, `recipes/**`.

---

## Task 1: 베이스라인 확인 — 빌드/테스트가 현재 상태에서 통과하는가

**Purpose:** 신규 스키마로 고치기 전에, 현재 엔진이 **그 전 스키마 기준에선 깨끗히 통과**함을 확인해서 이후 실패가 내가 쓴 변경에서 비롯됨을 보장한다.

**Files:** 없음 (read/run only).

- [ ] **Step 1: untracked 파일 상태 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: Plan 1 커밋 후 clean 또는 untracked `test-crlf.js`, `test_write_shell.txt` 두 건만. 이 두 건은 plan 작업 내내 건드리지 않는다.

- [ ] **Step 2: 설치된 의존성 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && ls node_modules/.pnpm 2>/dev/null | head -3
```
Expected: pnpm이 이미 설치된 상태. 비어 있으면 `pnpm install` 먼저.

- [ ] **Step 3: 현재 빌드 통과 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r build 2>&1 | tail -20
```
Expected: 모든 패키지 build 성공. TypeScript 오류 0.

- [ ] **Step 4: 현재 테스트 통과 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r test 2>&1 | tail -40
```
Expected: 전 패키지 테스트 green. 실패 있으면 Plan 2 작업을 **시작하지 않고** 먼저 기존 실패를 분리 해결.

- [ ] **Step 5: 스키마 필드 grep 베이스라인 기록**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -rnE '\bissueType\b|\bcreatedAt\b|\bupdatedAt\b' --include='*.ts' packages/schema packages/core packages/adapter-firebase scripts 2>/dev/null | wc -l
```
Expected: 20~40 범위의 정수. 이 수치가 Task 15의 최종 grep에서 **0 또는 외부 API 맥락만** 남으면 리네임 완료로 간주.

---

## Task 2: schema fixtures 교체 (TDD 첫 단추)

**Files:**
- Modify: `packages/schema/src/fixtures.ts`

기존 fixtures는 `issueType`/`createdAt`/`updatedAt`/`## Goal`/`## Implementation Tasks`/`## Notes` 기반. 신규 스키마로 교체하되 `VALID_EPIC_MARKDOWN`과 `INVALID_ISSUE_MISSING_목적`도 추가해 Epic/required section 검증을 TDD할 수 있게 한다.

- [ ] **Step 1: `packages/schema/src/fixtures.ts` 전체 교체**

Write `packages/schema/src/fixtures.ts`:

```typescript
export const VALID_ISSUE_MARKDOWN = `---
id: VC-006
title: 로그인 페이지 UI 스켈레톤
type: task
status: READY
executor: claude-code
project: flow-weaver
epic: VC-005
priority: P2
created: 2026-04-23
updated: 2026-04-23
labels: []
depends_on: []
working_dir: ~/Projects/flow-weaver
run_count: 0
---

## 목적

로그인 흐름의 초기 UI 뼈대를 만든다.

## 컨텍스트

디자인 토큰은 packages/ui-tokens에 이미 있음. 관련 티켓 VC-005 참고.

## Acceptance Criteria

- [ ] 이메일 + 비밀번호 입력 필드 존재
- [ ] 로그인 버튼 클릭 시 폼 제출 핸들러 호출

## 실행 힌트

pnpm -F flow-weaver test로 회귀 확인. 기존 스타일 프리셋 재사용.

## 로그

`;

export const VALID_EPIC_MARKDOWN = `---
id: VC-005
title: 온보딩 플로우 개편
type: epic
status: TODO
executor: human
project:
priority: P1
created: 2026-04-20
updated: 2026-04-20
labels: []
depends_on: []
run_count: 0
---

## 목표

신규 사용자의 첫 3분 경험을 재설계한다.

## 범위

- 포함: 로그인/가입/첫 대시보드
- 제외: 결제, 초대

## 성공 지표

- [ ] 3분 내 첫 액션 완료율 40% 이상

## 하위 티켓

<!-- kanban:auto-render start -->
- TODO: VC-006
<!-- kanban:auto-render end -->

## 로그

`;

export const INVALID_ISSUE_MISSING_목적 = `---
id: VC-007
title: 컨텍스트만 있는 이슈
type: task
status: READY
executor: claude-code
project: flow-weaver
priority: P2
created: 2026-04-23
updated: 2026-04-23
---

## 컨텍스트

목적 섹션이 빠져 있어야 한다.

## Acceptance Criteria

- [ ] 의도된 invalid fixture

## 실행 힌트

N/A.
`;

export const INVALID_ISSUE_UNKNOWN_TYPE = `---
id: VC-008
title: 잘못된 타입
type: story
status: READY
executor: claude-code
project: flow-weaver
priority: P2
created: 2026-04-23
updated: 2026-04-23
---

## 목적

story 타입은 제거됐어야 한다.

## 컨텍스트

MVP enum에서 story 제외.

## Acceptance Criteria

- [ ] validator가 거절

## 실행 힌트

N/A.
`;
```

- [ ] **Step 2: 기존 export `INVALID_ISSUE_MISSING_GOAL` 의 소비처 검색**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -rn INVALID_ISSUE_MISSING_GOAL --include='*.ts' 2>/dev/null
```
Expected: `packages/schema/tests/issue-schema.test.ts` 1건만 (Task 4에서 수정).

---

## Task 3: schema/issue-schema.ts 교체

**Files:**
- Modify: `packages/schema/src/issue-schema.ts`

- [ ] **Step 1: `IssueFrontmatter` 인터페이스와 상수 교체**

Edit `packages/schema/src/issue-schema.ts`:

Replace the interface and top-level constants:

Old:
```typescript
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
```

New:
```typescript
export interface IssueFrontmatter {
  id: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  executor: string;
  project: string;
  created: string;
  updated: string;
  // Optional
  epic?: string;
  priority?: Priority;
  assignee?: string;
  completed?: string;
  labels?: string[];
  depends_on?: string[];
  working_dir?: string;
  merge_into?: string;
  run_count?: number;
  syncTarget?: string;
  jiraProject?: string;
  jiraKey?: string;
  automation?: Record<string, unknown>;
}

export type IssueType = 'epic' | 'task' | 'bug' | 'chore' | 'docs';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
```

- [ ] **Step 2: 상수(required/optional/enum/section) 교체**

Replace the relevant constants block (currently lines ~71-74):

Old:
```typescript
const REQUIRED_FIELDS = ['id', 'title', 'issueType', 'project', 'status', 'priority', 'createdAt', 'updatedAt'] as const;
const REQUIRED_SECTIONS = ['Goal', 'Acceptance Criteria', 'Implementation Tasks', 'Notes'] as const;
const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'sub-task'] as const;
const PRIORITIES = ['blocker', 'critical', 'high', 'medium', 'low', 'trivial'] as const;
```

New:
```typescript
const REQUIRED_FIELDS = ['id', 'title', 'type', 'status', 'executor', 'project', 'created', 'updated'] as const;
const REQUIRED_SECTIONS_TASK = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트'] as const;
const REQUIRED_SECTIONS_EPIC = ['목표', '범위', '성공 지표', '하위 티켓'] as const;
const ISSUE_TYPES = ['epic', 'task', 'bug', 'chore', 'docs'] as const;
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
```

- [ ] **Step 3: `validateIssueFrontmatter` 본문 교체**

Replace the body of `validateIssueFrontmatter` (find the function signature `export function validateIssueFrontmatter(...)` and replace its entire body):

New body (inside `export function validateIssueFrontmatter(input: unknown): ValidationResult<IssueFrontmatter> {`):

```typescript
  if (!isRecord(input)) {
    return { ok: false, errors: ['Frontmatter must be an object'] };
  }

  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const v = input[field];
    // Epic은 project를 빈 문자열로 허용, non-epic은 비허용.
    if (field === 'project' && input.type === 'epic') continue;
    if (v === undefined || v === null || v === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const field of ['id', 'title', 'executor', 'created', 'updated'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      errors.push(`Invalid field type: ${field} must be a string`);
    }
  }

  // project는 epic일 때 빈 문자열 허용
  if (input.project !== undefined && input.project !== null && typeof input.project !== 'string') {
    errors.push('Invalid field type: project must be a string');
  }

  if (input.status !== undefined && !isIssueStatus(input.status)) {
    errors.push(`Invalid status: ${String(input.status)}`);
  }

  if (typeof input.type === 'string' && !(ISSUE_TYPES as readonly string[]).includes(input.type)) {
    errors.push(`Invalid type: ${input.type}`);
  }

  if (input.priority !== undefined && typeof input.priority === 'string'
      && !(PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.push(`Invalid priority: ${input.priority}`);
  }

  if (input.labels !== undefined && (!Array.isArray(input.labels)
      || !input.labels.every(label => typeof label === 'string'))) {
    errors.push('Invalid field type: labels must be a string array');
  }

  if (input.depends_on !== undefined && (!Array.isArray(input.depends_on)
      || !input.depends_on.every(v => typeof v === 'string'))) {
    errors.push('Invalid field type: depends_on must be a string array');
  }

  if (input.run_count !== undefined && typeof input.run_count !== 'number') {
    errors.push('Invalid field type: run_count must be a number');
  }

  for (const field of ['epic', 'assignee', 'completed', 'working_dir', 'merge_into'] as const) {
    if (input[field] !== undefined && input[field] !== null && typeof input[field] !== 'string') {
      errors.push(`Invalid field type: ${field} must be a string`);
    }
  }

  if (input.automation !== undefined && !isRecord(input.automation)) {
    errors.push('Invalid field type: automation must be an object');
  }

  // Epic 특수 규칙: READY 전이 금지. 파서 단계에선 경고만 수집, 실제 거절은
  // 상태 전이 모듈에서 처리. 여기서는 에러로 올리지 않는다.

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as IssueFrontmatter };
```

- [ ] **Step 4: `parseIssueMarkdown` 본문 교체 — type별 required section 분기**

Replace the `parseIssueMarkdown` function:

Old:
```typescript
export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return { ok: false, errors: ['Missing YAML frontmatter'] };

  let parsed: unknown;
  try {
    parsed = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Invalid YAML frontmatter: ${message}`] };
  }

  const frontmatterResult = validateIssueFrontmatter(parsed);
  const errors: string[] = frontmatterResult.ok ? [] : [...frontmatterResult.errors];

  const body = content.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);

  for (const section of REQUIRED_SECTIONS) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!frontmatterResult.ok) return { ok: false, errors: frontmatterResult.errors };

  return { ok: true, value: { frontmatter: frontmatterResult.value, sections } };
}
```

New:
```typescript
export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return { ok: false, errors: ['Missing YAML frontmatter'] };

  let parsed: unknown;
  try {
    parsed = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Invalid YAML frontmatter: ${message}`] };
  }

  const frontmatterResult = validateIssueFrontmatter(parsed);
  const errors: string[] = frontmatterResult.ok ? [] : [...frontmatterResult.errors];

  const body = content.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);

  const issueType = isRecord(parsed) ? String(parsed.type ?? '') : '';
  const required = issueType === 'epic' ? REQUIRED_SECTIONS_EPIC : REQUIRED_SECTIONS_TASK;

  for (const section of required) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!frontmatterResult.ok) return { ok: false, errors: frontmatterResult.errors };

  return { ok: true, value: { frontmatter: frontmatterResult.value, sections } };
}
```

- [ ] **Step 5: `packages/schema/src/index.ts` 가 새 export 노출하는지 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && cat packages/schema/src/index.ts
```

필요하면 다음 줄을 추가 (이미 있으면 skip):

```typescript
export type { IssueType, Priority } from './issue-schema';
```

---

## Task 4: schema 테스트 갱신 + 통과 확인

**Files:**
- Modify: `packages/schema/tests/issue-schema.test.ts`

- [ ] **Step 1: 현재 테스트 파일 읽기**

Run: `Read packages/schema/tests/issue-schema.test.ts`

주의: 테스트 파일은 fixture import 이름과 필드명을 직접 사용하고 있다. 교체 작업의 중심은 import 갱신 + 단언 갱신.

- [ ] **Step 2: 테스트 파일 전체 교체**

Write `packages/schema/tests/issue-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseIssueMarkdown,
  validateIssueFrontmatter,
  validateCanonicalIssue,
  VALID_ISSUE_MARKDOWN,
  VALID_EPIC_MARKDOWN,
  INVALID_ISSUE_MISSING_목적,
  INVALID_ISSUE_UNKNOWN_TYPE,
} from '../src';

describe('parseIssueMarkdown', () => {
  it('accepts a valid task issue', () => {
    const result = parseIssueMarkdown(VALID_ISSUE_MARKDOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.id).toBe('VC-006');
    expect(result.value.frontmatter.type).toBe('task');
    expect(result.value.frontmatter.epic).toBe('VC-005');
    expect(result.value.frontmatter.priority).toBe('P2');
    expect(result.value.sections['목적']).toContain('로그인');
    expect(result.value.sections['Acceptance Criteria']).toContain('이메일');
  });

  it('accepts a valid epic issue', () => {
    const result = parseIssueMarkdown(VALID_EPIC_MARKDOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.type).toBe('epic');
    expect(result.value.frontmatter.executor).toBe('human');
    expect(result.value.sections['목표']).toContain('신규 사용자');
    expect(result.value.sections['성공 지표']).toContain('첫 액션');
  });

  it('rejects a task issue with missing 목적 section', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_MISSING_목적);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Missing required section: 목적'))).toBe(true);
  });

  it('rejects a task issue with unknown type (story removed)', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_UNKNOWN_TYPE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Invalid type'))).toBe(true);
  });

  it('rejects missing YAML frontmatter', () => {
    const result = parseIssueMarkdown('no frontmatter here');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('Missing YAML frontmatter');
  });
});

describe('validateIssueFrontmatter', () => {
  const base = {
    id: 'VC-100',
    title: 't',
    type: 'task',
    status: 'TODO',
    executor: 'human',
    project: 'flow-weaver',
    created: '2026-04-23',
    updated: '2026-04-23',
  };

  it('passes with minimum required fields', () => {
    const result = validateIssueFrontmatter(base);
    expect(result.ok).toBe(true);
  });

  it('allows epic to have empty project', () => {
    const result = validateIssueFrontmatter({ ...base, type: 'epic', project: '' });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown priority', () => {
    const result = validateIssueFrontmatter({ ...base, priority: 'HighUrgent' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Invalid priority'))).toBe(true);
  });

  it('rejects non-number run_count', () => {
    const result = validateIssueFrontmatter({ ...base, run_count: 'three' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-array depends_on', () => {
    const result = validateIssueFrontmatter({ ...base, depends_on: 'VC-001' });
    expect(result.ok).toBe(false);
  });
});

describe('validateCanonicalIssue', () => {
  it('rejects non-object input', () => {
    const result = validateCanonicalIssue('not an object');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: schema 테스트 실행 — 통과 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/schema && pnpm test 2>&1 | tail -30
```
Expected: 5+ describe 블록 모두 pass. 실패 시 schema/src 수정.

- [ ] **Step 4: schema 패키지만 빌드**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/schema && pnpm build 2>&1 | tail -10
```
Expected: 컴파일 오류 0. `dist/` 갱신.

---

## Task 5: schema 변경 커밋

**Files:** 없음 (커밋만).

- [ ] **Step 1: 변경 파일 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain | grep -v '^??'
```
Expected:
```
 M packages/schema/src/fixtures.ts
 M packages/schema/src/issue-schema.ts
 M packages/schema/tests/issue-schema.test.ts
```
(dist는 gitignore되어 있거나, 커밋 대상이면 추가.)

- [ ] **Step 2: 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine
git add packages/schema/src/fixtures.ts packages/schema/src/issue-schema.ts packages/schema/tests/issue-schema.test.ts
git commit -m "$(cat <<'EOF'
refactor(schema): migrate issue frontmatter + body sections to new schema

authoritative control-plane spec(Plan 1에서 정합화)의 신규 스키마를 반영:

- type enum: epic|task|bug|chore|docs (story/sub-task 제거)
- 필드 리네임: issueType→type, createdAt→created, updatedAt→updated
- 신규 optional 필드: epic, working_dir, merge_into, run_count, depends_on,
  completed, assignee
- priority enum: P0|P1|P2|P3 (Jira 이름은 canonical 레이어에서 매핑)
- 본문 required 섹션: task = 목적/컨텍스트/AC/실행 힌트;
  epic = 목표/범위/성공 지표/하위 티켓
- Epic은 project 빈 문자열 허용 (프로젝트 횡단)
- Fixtures 전면 교체 + Epic/unknown-type invalid 케이스 추가

코어/adapter 측 리네임은 후속 task에서 진행.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 커밋 확인**

Run: `cd ~/Projects/kanban-task-engine && git log -1 --stat`
Expected: 3 files changed 로 최신 커밋 표시.

---

## Task 6: core/types.ts 의 IssueType/Priority 리터럴 그대로 유지 확인

**Files:**
- (Potentially Modify): `packages/core/src/types.ts`

core의 `IssueType = 'Epic' | 'Story' | 'Task' | 'Bug' | 'Sub-task'`는 **canonical 레이어의 Jira 호환 분류**이며 frontmatter의 `type` enum과는 별개다. 이 레이어는 Jira 호환성 유지 목적이므로 **그대로 둔다**. mapper가 frontmatter의 `task` → canonical의 `'Task'`로 매핑.

마찬가지로 `Priority = 'Blocker' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Trivial'`도 canonical 레이어. frontmatter의 `P0..P3`는 mapper에서 변환.

- [ ] **Step 1: 현재 types.ts 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && sed -n '29,37p' packages/core/src/types.ts
```
Expected:
```typescript
// === 분류 (Jira 친화적) ===
export type IssueType = 'Epic' | 'Story' | 'Task' | 'Bug' | 'Sub-task';
export type Priority = 'Blocker' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Trivial';
```

**변경 없음** (Jira 호환 canonical 레이어로 의도적으로 유지).

---

## Task 7: core/store/mapper.ts 갱신

**Files:**
- Modify: `packages/core/src/store/mapper.ts`

`markdownIssueToCanonical` 함수가 `frontmatter.issueType`, `frontmatter.createdAt`, `frontmatter.updatedAt`을 참조. `canonicalToYaml`/`yamlToCanonical`에서도 동일. 전부 신규 필드명 기반으로 교체하되 canonical 레이어의 Jira 이름은 유지.

- [ ] **Step 1: `yamlToCanonical` 내부 필드 참조 교체**

Edit `packages/core/src/store/mapper.ts`:

Find line (current ~87):
```typescript
      issue_type: String(yaml.issueType ?? 'Task') as CanonicalTaskModel['classification']['issue_type'],
```

Replace with:
```typescript
      issue_type: mapTypeToCanonical(String(yaml.type ?? 'task')),
```

Find line (current ~88):
```typescript
      priority: String(yaml.priority ?? 'Medium') as CanonicalTaskModel['classification']['priority'],
```

Replace with:
```typescript
      priority: mapPriorityToCanonical(String(yaml.priority ?? 'P2')),
```

- [ ] **Step 2: `markdownIssueToCanonical` 내부 필드 참조 교체**

Find the block (current ~182-205):
```typescript
    classification: {
      issue_type: normalizeIssueType(frontmatter.issueType),
      priority: normalizePriority(frontmatter.priority),
      labels: frontmatter.labels ?? [],
      component: [],
    },
```

Replace with:
```typescript
    classification: {
      issue_type: mapTypeToCanonical(frontmatter.type),
      priority: mapPriorityToCanonical(frontmatter.priority ?? 'P2'),
      labels: frontmatter.labels ?? [],
      component: [],
    },
```

Find:
```typescript
    sync: {
      last_synced_at: frontmatter.updatedAt,
      last_source: 'local',
    },
    created: frontmatter.createdAt,
    updated: frontmatter.updatedAt,
```

Replace with:
```typescript
    sync: {
      last_synced_at: frontmatter.updated,
      last_source: 'local',
    },
    created: frontmatter.created,
    updated: frontmatter.updated,
    completed: frontmatter.completed,
```

- [ ] **Step 3: `canonicalToYaml` 내부 필드 참조 교체**

Find (current ~122-145):
```typescript
export function canonicalToYaml(task: CanonicalTaskModel): Record<string, unknown> {
  const yaml: Record<string, unknown> = {
    id: task.task_ref.external_id,
    status: task.workflow.raw_status,
    priority: task.classification.priority,
    issueType: task.classification.issue_type,
    summary: task.summary,
    assignee: task.ownership.assignee,
    reporter: task.ownership.reporter,
    labels: task.classification.labels,
    project: task.task_ref.external_key,
    components: task.classification.component,
    sprint: task.planning.sprint,
    storyPoints: task.planning.estimate?.story_points,
    automation: {
      workspace: task.automation.workspace,
      useAcp: task.automation.useAcp,
      onEnter: task.automation.on_enter.map(normalizedToRawStatus),
      policy_id: task.automation.policy_id,
    },
    created: task.created,
    updated: task.updated ?? new Date().toISOString(),
    completed: task.completed,
  };
```

Replace with:
```typescript
export function canonicalToYaml(task: CanonicalTaskModel): Record<string, unknown> {
  const yaml: Record<string, unknown> = {
    id: task.task_ref.external_id,
    status: task.workflow.raw_status,
    priority: mapPriorityToFrontmatter(task.classification.priority),
    type: mapTypeToFrontmatter(task.classification.issue_type),
    title: task.summary,
    assignee: task.ownership.assignee,
    labels: task.classification.labels,
    project: task.task_ref.external_key,
    automation: {
      workspace: task.automation.workspace,
      useAcp: task.automation.useAcp,
      onEnter: task.automation.on_enter.map(normalizedToRawStatus),
      policy_id: task.automation.policy_id,
    },
    created: task.created,
    updated: task.updated ?? new Date().toISOString(),
    completed: task.completed,
  };
```

(주: `summary`→`title`, `reporter`/`components`/`sprint`/`storyPoints`는 신규 스키마 frontmatter에 없으므로 drop. 필요시 후속 plan에서 복구.)

- [ ] **Step 4: 구 normalize 함수 제거 + 신규 매퍼 추가**

Find and delete these at bottom of `mapper.ts`:
```typescript
function normalizeIssueType(input: string): CanonicalTaskModel['classification']['issue_type'] {
  const value = input.toLowerCase();
  if (value === 'epic') return 'Epic';
  if (value === 'story') return 'Story';
  if (value === 'bug') return 'Bug';
  if (value === 'sub-task') return 'Sub-task';
  return 'Task';
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

Replace with:
```typescript
function mapTypeToCanonical(input: string): CanonicalTaskModel['classification']['issue_type'] {
  switch (input.toLowerCase()) {
    case 'epic': return 'Epic';
    case 'bug':  return 'Bug';
    // chore, docs, task → Task (Jira에 직접 대응 없음)
    case 'task':
    case 'chore':
    case 'docs':
    default:
      return 'Task';
  }
}

function mapTypeToFrontmatter(input: CanonicalTaskModel['classification']['issue_type']): string {
  switch (input) {
    case 'Epic':     return 'epic';
    case 'Bug':      return 'bug';
    case 'Story':    return 'task'; // 레거시 Story → task
    case 'Sub-task': return 'task'; // 레거시 → task
    case 'Task':
    default:         return 'task';
  }
}

const PRIORITY_TO_CANONICAL: Record<string, CanonicalTaskModel['classification']['priority']> = {
  P0: 'Blocker',
  P1: 'High',
  P2: 'Medium',
  P3: 'Low',
};

const PRIORITY_TO_FRONTMATTER: Record<string, string> = {
  Blocker:  'P0',
  Critical: 'P0',
  High:     'P1',
  Medium:   'P2',
  Low:      'P3',
  Trivial:  'P3',
};

function mapPriorityToCanonical(input: string): CanonicalTaskModel['classification']['priority'] {
  return PRIORITY_TO_CANONICAL[input] ?? 'Medium';
}

function mapPriorityToFrontmatter(input: CanonicalTaskModel['classification']['priority']): string {
  return PRIORITY_TO_FRONTMATTER[input] ?? 'P2';
}
```

---

## Task 8: core/store/write-back.ts 의 ALLOWED_FIELDS 교체

**Files:**
- Modify: `packages/core/src/store/write-back.ts`

- [ ] **Step 1: 현재 ALLOWED_FIELDS 위치 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -n 'ALLOWED_FIELDS\|issueType' packages/core/src/store/write-back.ts
```
Expected: 8번 근처 1 hit.

- [ ] **Step 2: ALLOWED_FIELDS 라인 교체**

Edit `packages/core/src/store/write-back.ts`:

Find:
```typescript
  'id', 'status', 'priority', 'issueType', 'summary', 'assignee', 'reporter',
```

Replace with:
```typescript
  'id', 'status', 'priority', 'type', 'title', 'assignee',
```

(나머지 이 파일의 다른 필드명 사용이 있는지 확인.)

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -nE 'issueType|createdAt|updatedAt|summary|reporter|components|sprint|storyPoints' packages/core/src/store/write-back.ts
```
Expected: 0 (위 교체 후).

---

## Task 9: core/tests/mapper.test.ts 갱신

**Files:**
- Modify: `packages/core/tests/mapper.test.ts`

- [ ] **Step 1: 현재 파일 Read**

Run: `Read packages/core/tests/mapper.test.ts`

구조 확인. `describe`/`it` 블록들과 어떤 필드명을 assert하는지 파악.

- [ ] **Step 2: 파일 내 필드명 일괄 교체**

다음 리네임을 `replace_all` 로 수행 (순서대로):

- `issueType:` → `type:` (YAML frontmatter 문자열 내부 한정)
- `createdAt:` → `created:`
- `updatedAt:` → `updated:`
- `## Goal` → `## 목적`
- `## Implementation Tasks` → `## 실행 힌트`
- `## Notes` → `## 컨텍스트`
- `frontmatter.issueType` → `frontmatter.type`
- `frontmatter.createdAt` → `frontmatter.created`
- `frontmatter.updatedAt` → `frontmatter.updated`
- `normalizeIssueType` → `mapTypeToCanonical` (만약 import/사용 있으면)
- `normalizePriority` → `mapPriorityToCanonical`

주의:
- Story/Sub-task를 가정하는 테스트 케이스가 있으면 해당 기대값을 `Task`로 수정.
- Priority를 `medium`/`high` 문자열로 기대하던 테스트는 `P2`/`P1`로 수정.

- [ ] **Step 3: core 테스트 실행**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test 2>&1 | tail -30
```
Expected: 전 테스트 pass. 실패 시 해당 단언의 기대값을 신규 스키마에 맞게 조정.

- [ ] **Step 4: core 빌드**

Run: `cd ~/Projects/kanban-task-engine/packages/core && pnpm build 2>&1 | tail -10`
Expected: 컴파일 오류 0.

---

## Task 10: core 변경 커밋

- [ ] **Step 1: 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine
git add packages/core/src/store/mapper.ts packages/core/src/store/write-back.ts packages/core/tests/mapper.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): apply new schema to mapper and write-back

- markdownIssueToCanonical, yamlToCanonical, canonicalToYaml 의 필드 참조
  (issueType→type, createdAt→created, updatedAt→updated, summary→title,
  reporter/components/sprint/storyPoints drop) 교체.
- type enum(epic|task|bug|chore|docs) ↔ canonical Jira 이름(Epic|Task|Bug)
  매핑 함수 mapTypeToCanonical/mapTypeToFrontmatter 도입.
- priority P0..P3 ↔ Blocker..Trivial 매핑 함수 mapPriorityToCanonical/
  mapPriorityToFrontmatter 도입.
- write-back.ts ALLOWED_FIELDS 신규 필드명으로 교체.
- 기존 normalizeIssueType/normalizePriority 함수 제거.

canonical 레이어는 Jira 호환 이름 유지. frontmatter ↔ canonical 은 양방향
매퍼로만 연결.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: adapter-firebase 갱신 + 테스트

**Files:**
- Modify: `packages/adapter-firebase/src/firebase-mapper.ts`
- Modify: `packages/adapter-firebase/tests/firebase-mapper.test.ts`

- [ ] **Step 1: firebase-mapper.ts 필드 교체**

Edit `packages/adapter-firebase/src/firebase-mapper.ts`:

Find (line ~12):
```typescript
  issueType?: string;
```

Replace with:
```typescript
  type?: string;
```

Find (line ~76):
```typescript
      issue_type: (doc.issueType as CanonicalTaskModel['classification']['issue_type']) ?? 'Task',
```

Replace with:
```typescript
      issue_type: mapFirebaseTypeToCanonical(doc.type),
```

Find (line ~114):
```typescript
    issueType: task.classification.issue_type,
```

Replace with:
```typescript
    type: mapCanonicalToFirebaseType(task.classification.issue_type),
```

- [ ] **Step 2: 파일 끝에 매퍼 함수 추가**

파일 최하단에 추가:

```typescript
function mapFirebaseTypeToCanonical(input?: string): CanonicalTaskModel['classification']['issue_type'] {
  switch ((input ?? 'task').toLowerCase()) {
    case 'epic': return 'Epic';
    case 'bug':  return 'Bug';
    case 'task':
    case 'chore':
    case 'docs':
    default:
      return 'Task';
  }
}

function mapCanonicalToFirebaseType(input: CanonicalTaskModel['classification']['issue_type']): string {
  switch (input) {
    case 'Epic': return 'epic';
    case 'Bug':  return 'bug';
    default:     return 'task';
  }
}
```

- [ ] **Step 3: firebase 테스트 파일 갱신**

Edit `packages/adapter-firebase/tests/firebase-mapper.test.ts`:

파일 내 모든 `issueType` → `type` (string literal context) 그리고 테스트 기대값 중 Story/Sub-task 가정이 있으면 Task로 수정. `replace_all` 사용 가능.

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -n 'issueType' packages/adapter-firebase/tests/firebase-mapper.test.ts
```
Expected: 0 hits (교체 후).

- [ ] **Step 4: firebase 테스트 실행**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/adapter-firebase && pnpm test 2>&1 | tail -20
```
Expected: 전 테스트 pass.

- [ ] **Step 5: 빌드**

Run: `cd ~/Projects/kanban-task-engine/packages/adapter-firebase && pnpm build 2>&1 | tail -10`
Expected: 컴파일 오류 0.

- [ ] **Step 6: 커밋**

```bash
cd ~/Projects/kanban-task-engine
git add packages/adapter-firebase
git commit -m "$(cat <<'EOF'
refactor(adapter-firebase): update to new type field

firebase 문서 필드 issueType → type. canonical 변환은 신규 매퍼 함수로.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: templates 디렉토리 overhaul

**Files:**
- Modify: `templates/base.md`, `templates/task.md`, `templates/bug.md`
- Create: `templates/epic.md`, `templates/chore.md`, `templates/docs.md`
- Delete: `templates/story.md`

- [ ] **Step 1: story.md 제거**

Run:
```bash
cd ~/Projects/kanban-task-engine && rm templates/story.md
test ! -e templates/story.md && echo OK
```
Expected: `OK`.

- [ ] **Step 2: base.md 재작성**

Write `templates/base.md`:

```markdown
---
id: <PREFIX>-<NNN>
title: <한 줄 제목>
type: task
status: TODO
executor: claude-code
project: <project>
epic:
priority: P2
assignee:
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
completed:
labels: []
depends_on: []
working_dir:
merge_into:
run_count: 0
automation:
  trigger: manual
  allowedActions:
    - transitionIssue
    - startExecution
    - writeExecutionLog
---

## 목적

<왜 이 작업이 필요한가 — 한 문단>

## 컨텍스트

<executor가 읽어야 할 배경. 참조 파일 경로, 관련 티켓, 선행 결정 등>

## Acceptance Criteria

- [ ] <검증 가능한 완료 조건 1>

## 실행 힌트

<수행 지침 — 스킬 이름, 테스트 명령, 제외 경로 등. 자유 서술>

## 로그

```

- [ ] **Step 3: task.md / bug.md / chore.md / docs.md 생성**

Write `templates/task.md`, `templates/bug.md`, `templates/chore.md`, `templates/docs.md`:

네 파일 모두 `templates/base.md`와 동일하되 frontmatter `type:` 값만 각각 `task`/`bug`/`chore`/`docs`로 치환.

가장 간단한 방법:

Run:
```bash
cd ~/Projects/kanban-task-engine/templates
for t in task bug chore docs; do
  sed "s/^type: task$/type: $t/" base.md > "$t.md"
done
ls *.md
```
Expected: `base.md  bug.md  chore.md  docs.md  task.md` + (epic.md는 다음 Step).

- [ ] **Step 4: epic.md 생성**

Write `templates/epic.md`:

```markdown
---
id: <PREFIX>-<NNN>
title: <한 줄 Epic 제목>
type: epic
status: TODO
executor: human
project:
epic:
priority: P1
assignee:
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
completed:
labels: []
depends_on: []
run_count: 0
---

## 목표

<이 Epic이 완료되면 달성되는 결과 — 1~2문단>

## 범위

- 포함: ...
- 제외: ...

## 성공 지표

- [ ] <측정 가능한 완료 기준>

## 하위 티켓

<!-- kanban:auto-render start -->
<!-- kanban:auto-render end -->

## 로그

```

- [ ] **Step 5: templates 디렉토리 최종 점검**

Run:
```bash
cd ~/Projects/kanban-task-engine/templates && ls -la
```
Expected: `.gitkeep  base.md  bug.md  chore.md  docs.md  epic.md  task.md` (story.md 없음).

- [ ] **Step 6: 구 section 이름 잔재 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -lE '^## (Goal|Implementation Tasks|Notes)$' templates/*.md 2>/dev/null
```
Expected: 출력 없음.

---

## Task 13: scripts/migrate-tickets.ts 에 구→신 변환기 추가

**Files:**
- Modify: `scripts/migrate-tickets.ts`

기존 스크립트는 경로 이동만 한다. 여기에 필드/섹션 변환을 추가해 레거시 샘플(`workspace-vibe-coding/issues/OC-001-*.md` 등) 및 향후 발견되는 구 스키마 파일을 신규 스키마로 변환.

- [ ] **Step 1: 변환기 함수 추가**

Edit `scripts/migrate-tickets.ts`:

`async function migrateFile(srcPath: string, destPath: string, workspace: string): Promise<void> {` 함수 본문을 다음으로 교체:

```typescript
async function migrateFile(srcPath: string, destPath: string, workspace: string): Promise<void> {
  const content = await fs.readFile(srcPath, 'utf-8');
  const { data, content: body } = grayMatter(content);

  // Field renames
  if (data.issueType !== undefined && data.type === undefined) {
    data.type = String(data.issueType).toLowerCase();
    delete data.issueType;
  }
  if (data.createdAt !== undefined && data.created === undefined) {
    data.created = data.createdAt;
    delete data.createdAt;
  }
  if (data.updatedAt !== undefined && data.updated === undefined) {
    data.updated = data.updatedAt;
    delete data.updatedAt;
  }

  // Drop removed fields that map nowhere
  delete data.parent;   // 신규 스키마의 `epic`과 의미가 다름 — 수동 재배치 필요

  // Priority Jira → P-style
  const priorityMap: Record<string, string> = {
    blocker: 'P0', critical: 'P0',
    high: 'P1',
    medium: 'P2',
    low: 'P3', trivial: 'P3',
  };
  if (typeof data.priority === 'string' && priorityMap[data.priority.toLowerCase()]) {
    data.priority = priorityMap[data.priority.toLowerCase()];
  }

  // Type enum 정규화 (story/sub-task → task)
  if (typeof data.type === 'string') {
    const t = data.type.toLowerCase();
    if (t === 'story' || t === 'sub-task' || t === 'subtask') {
      data.type = 'task';
    } else {
      data.type = t;
    }
  }

  data.workspace = workspace;

  if (data.automation?.workspace === workspace) {
    delete data.automation.workspace;
  }

  // Body section renames (구 → 신). Epic은 이번 마이그레이션 대상 아님.
  const migratedBody = body
    .replace(/^## Goal\s*$/m, '## 목적')
    .replace(/^## Implementation Tasks\s*$/m, '## 실행 힌트')
    .replace(/^## Notes\s*$/m, '## 컨텍스트');

  const newContent = grayMatter.stringify(migratedBody, data);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, newContent);

  console.log(`Migrated: ${srcPath} -> ${destPath}`);
}
```

- [ ] **Step 2: 구 `workspace-claude` 경로를 `workspace-vibe-coding`으로 교체**

기존 스크립트는 `~/.openclaw/workspace-claude/issues`를 가정. 현재는 `workspace-vibe-coding`. `MIGRATIONS` 배열의 첫 엔트리 교체:

Find:
```typescript
    from: path.join(process.env.HOME!, '.openclaw/workspace-claude/issues'),
```

Replace with:
```typescript
    from: path.join(process.env.HOME!, '.openclaw/workspace-vibe-coding/issues'),
```

- [ ] **Step 3: 스크립트 lint/compile 확인 (tsx로 타입 체크)**

Run:
```bash
cd ~/Projects/kanban-task-engine && npx tsc --noEmit scripts/migrate-tickets.ts 2>&1 | head -10
```
Expected: 오류 0. (tsx는 실행 시 transpile이지만 `--noEmit`으로 type check만.)

- [ ] **Step 4: dry-run (실제 데이터 이동 금지 — 경로만 listing)**

Run:
```bash
cd ~/Projects/kanban-task-engine && ls ~/.openclaw/workspace-vibe-coding/issues/*.md 2>/dev/null
```
Expected: `OC-001-login-page.md`, `OC-002-api-endpoint.md` 두 건.

실제 마이그레이션 실행은 **이 plan에서 하지 않는다** — Plan 3의 "vibe-coding dogfood seed" 단계에서 실행. 본 task는 스크립트 준비까지만.

---

## Task 14: templates + migration script 커밋

- [ ] **Step 1: 커밋**

```bash
cd ~/Projects/kanban-task-engine
git add templates/ scripts/migrate-tickets.ts
git commit -m "$(cat <<'EOF'
refactor(templates,migrate): adopt new schema in templates and migration

- templates/story.md 제거, epic.md/chore.md/docs.md 신규 작성,
  base.md/task.md/bug.md를 신규 frontmatter+본문 4섹션으로 재작성.
- migrate-tickets.ts: 구 필드(issueType/createdAt/updatedAt) → 신 필드 변환,
  Story/Sub-task → task 정규화, Jira priority → P0..P3, 본문 섹션 헤딩
  Goal/Implementation Tasks/Notes → 목적/실행 힌트/컨텍스트 변환.
- MIGRATIONS 첫 엔트리를 workspace-claude → workspace-vibe-coding 로 수정.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: 전체 잔재 scan + 회귀 테스트

**Files:** 없음 (read/run only).

- [ ] **Step 1: 전체 src/tests 에서 구 필드명 잔재 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -rnE '\bissueType\b|\bcreatedAt\b|\bupdatedAt\b' \
  --include='*.ts' packages/schema packages/core packages/adapter-firebase scripts \
  | grep -v '/dist/'
```
Expected: **출력 없음**. (adapter-github/adapter-openclaw는 외부 API 맥락이므로 이 grep 범위에서 제외.)

- [ ] **Step 2: templates 구 섹션 잔재 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -rE '^## (Goal|Implementation Tasks|Notes)$' templates/
```
Expected: 출력 없음.

- [ ] **Step 3: 전체 빌드 통과**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r build 2>&1 | tail -30
```
Expected: 모든 패키지 build 성공.

- [ ] **Step 4: 전체 테스트 통과**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r test 2>&1 | tail -50
```
Expected: 전체 green. 실패 시 원인을 개별 task로 역추적.

- [ ] **Step 5: git 상태 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: untracked `test-crlf.js`, `test_write_shell.txt` 외 빈 출력.

- [ ] **Step 6: 완료 기록**

이 Task는 검증 전용이므로 커밋 없음. Plan 2 완료. Plan 3(worktree + CLI) 착수 조건 확보.

---

## Self-Review

### 1. Spec coverage

| 신규 스키마 규약 | 반영 Task |
|------------------|-----------|
| `type` enum (epic/task/bug/chore/docs) | Task 3 (schema), Task 9 (core tests), Task 12 (templates) |
| `issueType → type` 리네임 | Task 3, 7, 8, 9, 11, 13 |
| `createdAt → created`, `updatedAt → updated` | Task 3, 7, 9, 11, 13 |
| `epic` 신규 필드 | Task 3 (schema) |
| `priority: P0..P3` + Jira 매핑 | Task 3 (schema), Task 7 (mapper 매퍼 함수) |
| optional 필드 `working_dir`/`merge_into`/`run_count`/`depends_on`/`completed`/`assignee` | Task 3 (schema validation) |
| 본문 섹션: 목적/컨텍스트/AC/실행 힌트 (task), 목표/범위/성공 지표/하위 티켓 (epic) | Task 3 (parser 분기), Task 9 (core tests), Task 12 (templates) |
| Epic은 project 빈 문자열 허용 | Task 3 (validator 분기) |
| canonical 레이어 Jira 이름 유지 | Task 6 (unchanged), Task 7 (매퍼 함수) |
| firebase adapter 필드 변환 | Task 11 |
| 레거시 샘플(workspace-vibe-coding/issues) 변환기 | Task 13 |
| templates 리노베이션 (story 제거, epic/chore/docs 신규) | Task 12 |

worktree 실행·CLI 표면·시퀀스 할당기는 **이 plan의 목표가 아님** (Plan 3 스코프).

### 2. Placeholder scan

- "TBD/TODO/이후 정리" 없음.
- "적절한 에러 처리" 같은 모호 문구 없음 — 각 단계가 Read/Edit/Bash 명령으로 구체화.
- 모든 Old/New 블록이 실제 교체 텍스트 포함.
- "Task N과 유사" 없음.

### 3. Type consistency

- `IssueFrontmatter.type`의 enum(`epic|task|bug|chore|docs`)이 Task 2 fixtures, Task 3 선언, Task 7 매퍼 입력, Task 9 테스트, Task 12 templates에서 일관.
- canonical `issue_type`의 enum(`'Epic'|'Story'|'Task'|'Bug'|'Sub-task'`)은 Task 6에서 **그대로 유지**로 명시. Task 7의 `mapTypeToCanonical/mapTypeToFrontmatter`가 frontmatter(소문자) ↔ canonical(파스칼) 변환을 담당.
- Priority frontmatter(`P0..P3`) ↔ canonical(`Blocker..Trivial`) 매핑이 Task 7의 상수 객체와 Task 13의 migration 스크립트에서 동일.
- Required body sections 리스트가 Task 3 (`REQUIRED_SECTIONS_TASK`/`REQUIRED_SECTIONS_EPIC`)과 Task 12 templates의 실제 섹션 이름과 일치.
- Fixtures(Task 2)에서 `INVALID_ISSUE_MISSING_목적`, `INVALID_ISSUE_UNKNOWN_TYPE` 이름이 Task 4 테스트의 import문과 일치.

Self-review 이슈 없음. Plan 실행 가능.

---

## Execution Handoff

**Plan complete and saved to `~/Projects/kanban-task-engine/docs/superpowers/plans/2026-04-23-kanban-schema-migration.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — task별 fresh subagent dispatch + 리뷰.
2. **Inline Execution** — 이 세션에서 executing-plans로 checkpoint 배치 실행.

Plan 1이 먼저 실행되어 있어야 의미 정합이 보장된다. 실행 순서: **Plan 1 → Plan 2 → Plan 3**.
