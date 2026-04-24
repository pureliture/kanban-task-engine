# Kanban Worktree Execution + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1(spec 정합화)과 Plan 2(스키마 코드 마이그레이션) 위에서, authoritative spec §11.1 / §11.2 / §12 / §15에 박힌 **worktree 기반 실행 계약과 CLI 표면**을 코드로 구현한다. 구체적으로:

1. `registry.yaml` 파서/업데이터 + space별 ID 시퀀스 할당기 (`VC-001`, `VC-002`, ... 3자리 zero-padding)
2. git worktree 관리자 (`git worktree add/remove`, fetch-origin, base ref 결정, ff-only merge)
3. `claude-code-executor` — headless `claude -p` 호출 + 상태 전이 + 로그 append
4. CLI 커맨드: `kanban run <id>`, `kanban next`, `kanban approve <id>`, `kanban abort <id>`, `kanban retry <id>`, `kanban sync`, `kanban board`
5. vibe-coding space에서 실티켓 1건 end-to-end dogfood

**Architecture:** TDD-first. 계층 순서로 진행한다: **registry 파서 → sequence 할당기 → worktree 매니저 (mocked git) → executor (mocked claude CLI) → CLI entrypoint 커맨드별 → sync/board → dogfood**. 각 계층은 순수 단위 테스트로 우선 검증하고, 다음 계층이 상위 계약을 호출한다. git/claude-CLI 같은 부수효과는 `execa` 같은 주입 가능한 인터페이스로 감싸 테스트에서 모킹한다.

**Tech Stack:**
- TypeScript 5.4, pnpm workspaces, Vitest 1.x.
- `yaml` (이미 schema가 사용), `gray-matter` (frontmatter r/w).
- `execa` — git/claude 호출용 (신규 의존성).
- `commander` 또는 `cac` — CLI parsing (기존 adapter-cli 구조에 없다면 cac 채택).
- 기존 `packages/core`/`packages/schema`/`packages/adapter-cli`를 확장. 새 패키지는 만들지 않는다 (executor는 `packages/core/src/executor/` 서브모듈, CLI entrypoint는 신규 `packages/cli` 패키지 — 기존 `adapter-cli`는 execution adapter 구현체이므로 이름 충돌 피함).

**Dependencies:**
- Plan 1 (spec reconciliation) 커밋 완료.
- Plan 2 (schema migration) 커밋 완료 — 신규 필드(`type`, `created`, `updated`, `working_dir`, `merge_into`, `run_count`, `depends_on`)가 이미 파싱·검증됨.
- vault는 `~/.openclaw/workspace-kanban/kanban/` (아직 이동 전이면 기존 `~/.openclaw/kanban/` 경로. 본 plan에서는 `KANBAN_HOME` env 또는 `--vault` 플래그로 주입).

---

## 전제 및 범위

- engine repo `~/Projects/kanban-task-engine/`에서만 작업.
- **건드리지 않는 영역**:
  - `packages/adapter-github/**`, `packages/adapter-openclaw/**`, `packages/adapter-jira/**`, `packages/adapter-firebase/**` — 본 plan의 실행 계약과 무관.
  - `packages/core/src/modules/**` — manual-command-trigger/state-transition-module/git-checkpoint-module은 이미 존재한다. 본 plan의 신규 executor는 `packages/core/src/executor/`로 분리 (module runner 통합은 후속 plan에서).
  - `packages/schema/**` — Plan 2에서 확정된 스키마를 그대로 소비.
- **건드리는 영역**:
  - `packages/core/src/store/sequence.ts` (신규)
  - `packages/core/src/store/registry.ts` (신규) + 테스트
  - `packages/core/src/executor/` (신규 디렉토리: `worktree.ts`, `claude-code-executor.ts`, `git.ts`, `lock.ts`, `run-artifacts.ts`, `index.ts`) + 테스트
  - `packages/core/src/index.ts` (신규 export 노출)
  - `packages/core/package.json` (execa 의존성 추가)
  - `packages/cli/` (신규 패키지) — entrypoint `bin/kanban`, 커맨드별 모듈
  - `pnpm-workspace.yaml` (이미 `packages/*` wildcard 확인 필요)
  - `~/.openclaw/workspace-kanban/kanban/registry.yaml` (신규 스키마로 재작성 — dogfood 단계 Task에서)

- **Registry 전제**: 현 vault의 `registry.yaml`은 구 형식(`spaces.workspace.workspace_path` 류). 신규 스키마(§15: `type`/`idPrefix`/`issues`/`epics`/`board`/`epicBoard`/`projects`)로의 vault 자체 갱신은 Task 15(dogfood)에서 수행. 파서(Task 2)는 신규 스키마만 지원하고 구 형식은 명시적 에러로 거절한다 (사용자가 한 번은 재작성해야 함).

- **Locking**: `kanban/runtime/current.lock` 단일 lock. 본 plan에서 `runtime/` 디렉토리가 없으면 executor가 mkdir.

- **Executor 범위**: MVP에서 `claude -p @prompt.md` headless 호출만 구현. OpenClaw ACP/openai-adapter 경로는 후속 plan.

- **상태 전이 의미론** (재확인, spec §11.2):
  - `run`: READY → RUNNING (worktree 생성) → {REVIEW | FAILED} (실행 결과).
  - `approve`: REVIEW → DONE (ff-only merge + worktree cleanup + `completed` 기입).
  - `abort`: {REVIEW | FAILED} → READY. 기본 worktree 유지. `--discard` 시 `git merge-base --is-ancestor` 통과 케이스만 제거.
  - `retry`: {FAILED | REVIEW} → READY. worktree/branch **무조건 force 제거**.

## File Structure

**Create:**

- `packages/core/src/store/sequence.ts` + `packages/core/tests/sequence.test.ts`
- `packages/core/src/store/registry.ts` + `packages/core/tests/registry.test.ts`
- `packages/core/src/executor/index.ts`
- `packages/core/src/executor/git.ts` + `packages/core/tests/executor/git.test.ts`
- `packages/core/src/executor/lock.ts` + `packages/core/tests/executor/lock.test.ts`
- `packages/core/src/executor/worktree.ts` + `packages/core/tests/executor/worktree.test.ts`
- `packages/core/src/executor/run-artifacts.ts` + `packages/core/tests/executor/run-artifacts.test.ts`
- `packages/core/src/executor/prompt-assembler.ts` + `packages/core/tests/executor/prompt-assembler.test.ts`
- `packages/core/src/executor/claude-code-executor.ts` + `packages/core/tests/executor/claude-code-executor.test.ts`
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/index.ts` (cac 엔트리)
- `packages/cli/src/bin.ts` (shebang 엔트리)
- `packages/cli/src/context.ts` (vault 경로 resolve + store/registry/executor 빌드)
- `packages/cli/src/commands/run.ts` + `tests/commands/run.test.ts`
- `packages/cli/src/commands/next.ts` + `tests/commands/next.test.ts`
- `packages/cli/src/commands/approve.ts` + `tests/commands/approve.test.ts`
- `packages/cli/src/commands/abort.ts` + `tests/commands/abort.test.ts`
- `packages/cli/src/commands/retry.ts` + `tests/commands/retry.test.ts`
- `packages/cli/src/commands/sync.ts` + `tests/commands/sync.test.ts`
- `packages/cli/src/commands/board.ts` + `tests/commands/board.test.ts`
- `packages/cli/src/render/board-renderer.ts` + `tests/render/board-renderer.test.ts`
- `packages/cli/src/render/epic-index-renderer.ts` + `tests/render/epic-index-renderer.test.ts`

**Modify:**

- `packages/core/package.json` — `execa` 의존성 추가.
- `packages/core/src/index.ts` — 신규 모듈 re-export.
- `pnpm-workspace.yaml` — 이미 `packages/*` wildcard면 변경 없음. 확인만.
- `~/.openclaw/workspace-kanban/kanban/registry.yaml` — Task 15에서 신규 스키마로 재작성 (vault repo 커밋).

**Not created:** dedicated `migrate-registry` 스크립트는 만들지 않는다 — registry.yaml은 파일 1개이므로 수기 재작성으로 충분.

---

## Task 1: 베이스라인 확인 — 빌드/테스트 green

**Purpose:** Plan 2까지의 상태에서 engine repo 전체가 깨끗히 통과함을 보장. 이후 실패가 Plan 3 작업에서 비롯됨을 확정.

**Files:** 없음 (read/run).

- [ ] **Step 1: git 상태**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: untracked `test-crlf.js`, `test_write_shell.txt` 두 건 외 빈 출력.

- [ ] **Step 2: 전체 빌드**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r build 2>&1 | tail -20
```
Expected: 전 패키지 build 성공.

- [ ] **Step 3: 전체 테스트**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r test 2>&1 | tail -40
```
Expected: 전 패키지 green.

- [ ] **Step 4: execa 의존성 유무 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && grep -l execa packages/*/package.json
```
Expected: 출력 없음 (본 plan에서 신규 추가).

---

## Task 2: registry.yaml 파서 (TDD)

**Purpose:** authoritative spec §15의 신규 스키마(`type`, `idPrefix`, `issues`, `epics`, `board`, `epicBoard`, 선택적 `projects`)를 파싱하는 타입드 로더. sequence 할당기와 CLI context가 모두 이걸 호출한다.

**Files:**
- Create: `packages/core/src/store/registry.ts`
- Create: `packages/core/tests/registry.test.ts`

**Depends on:** Task 1.

- [ ] **Step 1: 테스트 파일 먼저 작성 (RED)**

Write `packages/core/tests/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRegistryYaml, resolveSpace, SpaceConfig } from '../src/store/registry';

const VALID_YAML = `
spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      flow-weaver:
        path: issues/vibe-coding/flow-weaver
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
  stocks:
    type: single
    idPrefix: ST
    issues: issues/stocks
    epics: issues/stocks/_epics
    board: boards/stocks.md
    epicBoard: boards/stocks-epics.md
`;

describe('parseRegistryYaml', () => {
  it('parses container space with projects', () => {
    const reg = parseRegistryYaml(VALID_YAML);
    const vc = reg.spaces['vibe-coding'];
    expect(vc.type).toBe('container');
    expect(vc.idPrefix).toBe('VC');
    expect(vc.projects?.['flow-weaver']?.path).toBe('issues/vibe-coding/flow-weaver');
  });

  it('parses single space without projects', () => {
    const reg = parseRegistryYaml(VALID_YAML);
    const st = reg.spaces.stocks;
    expect(st.type).toBe('single');
    expect(st.idPrefix).toBe('ST');
    expect(st.projects).toBeUndefined();
  });

  it('rejects legacy schema (no idPrefix)', () => {
    const legacy = `spaces:\n  workspace:\n    board: spaces/workspace.md\n    workspace_path: ../workspace\n`;
    expect(() => parseRegistryYaml(legacy)).toThrow(/idPrefix/);
  });

  it('rejects unknown space type', () => {
    const bad = VALID_YAML.replace('type: single', 'type: hybrid');
    expect(() => parseRegistryYaml(bad)).toThrow(/type/);
  });
});

describe('resolveSpace', () => {
  it('resolves space by id prefix', () => {
    const reg = parseRegistryYaml(VALID_YAML);
    const sp = resolveSpace(reg, 'VC-006');
    expect(sp?.key).toBe('vibe-coding');
  });

  it('returns null for unknown prefix', () => {
    const reg = parseRegistryYaml(VALID_YAML);
    expect(resolveSpace(reg, 'ZZ-001')).toBeNull();
  });

  it('throws on malformed id', () => {
    const reg = parseRegistryYaml(VALID_YAML);
    expect(() => resolveSpace(reg, 'no-dash')).toThrow();
  });
});
```

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test registry 2>&1 | tail -20
```
Expected: RED — `parseRegistryYaml` import 실패.

- [ ] **Step 2: 구현 (`registry.ts` 작성)**

Write `packages/core/src/store/registry.ts`:

```typescript
import YAML from 'yaml';

export interface ProjectConfig {
  path: string;
}

export interface SpaceConfig {
  key: string;                 // map key 복제 (resolveSpace 결과 편의)
  type: 'single' | 'container';
  idPrefix: string;
  issues: string;
  epics: string;
  board: string;
  epicBoard: string;
  projects?: Record<string, ProjectConfig>;
}

export interface Registry {
  spaces: Record<string, SpaceConfig>;
  byPrefix: Record<string, SpaceConfig>;
}

export function parseRegistryYaml(content: string): Registry {
  const doc = YAML.parse(content);
  if (!doc || typeof doc !== 'object' || !doc.spaces || typeof doc.spaces !== 'object') {
    throw new Error('registry.yaml: missing top-level `spaces` map');
  }

  const spaces: Record<string, SpaceConfig> = {};
  const byPrefix: Record<string, SpaceConfig> = {};

  for (const [key, raw] of Object.entries(doc.spaces as Record<string, any>)) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`registry.yaml: space ${key} is not an object`);
    }
    const required = ['type', 'idPrefix', 'issues', 'epics', 'board', 'epicBoard'] as const;
    for (const field of required) {
      if (!raw[field] || typeof raw[field] !== 'string') {
        throw new Error(`registry.yaml: space ${key} missing ${field}`);
      }
    }
    if (raw.type !== 'single' && raw.type !== 'container') {
      throw new Error(`registry.yaml: space ${key} has invalid type ${raw.type}`);
    }

    const cfg: SpaceConfig = {
      key,
      type: raw.type,
      idPrefix: raw.idPrefix,
      issues: raw.issues,
      epics: raw.epics,
      board: raw.board,
      epicBoard: raw.epicBoard,
    };

    if (raw.projects) {
      if (typeof raw.projects !== 'object') {
        throw new Error(`registry.yaml: space ${key} projects must be an object`);
      }
      cfg.projects = {};
      for (const [pKey, pRaw] of Object.entries(raw.projects as Record<string, any>)) {
        if (!pRaw?.path || typeof pRaw.path !== 'string') {
          throw new Error(`registry.yaml: space ${key} project ${pKey} missing path`);
        }
        cfg.projects[pKey] = { path: pRaw.path };
      }
    }

    spaces[key] = cfg;
    if (byPrefix[cfg.idPrefix]) {
      throw new Error(`registry.yaml: duplicate idPrefix ${cfg.idPrefix}`);
    }
    byPrefix[cfg.idPrefix] = cfg;
  }

  return { spaces, byPrefix };
}

export function resolveSpace(reg: Registry, issueId: string): SpaceConfig | null {
  const m = issueId.match(/^([A-Z]+)-\d+$/);
  if (!m) {
    throw new Error(`Invalid issue id: ${issueId}`);
  }
  return reg.byPrefix[m[1]] ?? null;
}
```

- [ ] **Step 3: core/src/index.ts에 export 추가**

Edit `packages/core/src/index.ts`: 기존 export 목록 끝에 추가.

```typescript
export { parseRegistryYaml, resolveSpace } from './store/registry';
export type { Registry, SpaceConfig, ProjectConfig } from './store/registry';
```

- [ ] **Step 4: GREEN 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test registry 2>&1 | tail -15
```
Expected: `registry.test.ts` 전 케이스 pass.

- [ ] **Step 5: 커밋**

```bash
cd ~/Projects/kanban-task-engine
git add packages/core/src/store/registry.ts packages/core/tests/registry.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): registry.yaml 파서 추가 (신규 스키마)

authoritative spec §15 신규 registry 스키마(type/idPrefix/issues/epics/
board/epicBoard + 선택적 projects) 전용 파서. legacy 형식은 명시적 에러로
거절. resolveSpace(id)가 "VC-006" → "vibe-coding" space config 반환.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:**
- `parseRegistryYaml`이 신규 스키마를 타입드 결과로 반환한다.
- `resolveSpace`가 idPrefix로 space를 역조회한다.
- 구 형식은 throw.

---

## Task 3: ID 시퀀스 할당기 (TDD)

**Purpose:** `VC-001`, `VC-042`, `VC-999` → `VC-1000`으로 공간 내 monotonic 시퀀스 발급. 디스크 상의 기존 이슈 파일명을 스캔해서 최댓값+1을 계산하는 파일시스템-기반 구현. (별도 counter 파일 없음 — spec의 "space-wide monotonic" 요구와 registry만으로 재구성 가능하다는 요구에 부합.)

**Files:**
- Create: `packages/core/src/store/sequence.ts`
- Create: `packages/core/tests/sequence.test.ts`

**Depends on:** Task 2.

- [ ] **Step 1: 테스트 먼저 (RED)**

Write `packages/core/tests/sequence.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { allocateNextId, formatIssueId, scanExistingIds } from '../src/store/sequence';
import { SpaceConfig } from '../src/store/registry';

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'seq-'));
}

const SPACE: SpaceConfig = {
  key: 'vibe-coding',
  type: 'container',
  idPrefix: 'VC',
  issues: 'issues/vibe-coding',
  epics: 'issues/vibe-coding/_epics',
  board: 'boards/vibe-coding.md',
  epicBoard: 'boards/vibe-coding-epics.md',
  projects: { 'flow-weaver': { path: 'issues/vibe-coding/flow-weaver' } },
};

describe('formatIssueId', () => {
  it('zero-pads to 3 digits below 1000', () => {
    expect(formatIssueId('VC', 1)).toBe('VC-001');
    expect(formatIssueId('VC', 42)).toBe('VC-042');
    expect(formatIssueId('VC', 999)).toBe('VC-999');
  });
  it('does not truncate at/above 1000', () => {
    expect(formatIssueId('VC', 1000)).toBe('VC-1000');
    expect(formatIssueId('VC', 1234)).toBe('VC-1234');
  });
});

describe('scanExistingIds', () => {
  let vault: string;
  beforeEach(async () => { vault = await mkTmp(); });

  it('returns empty set when no issues exist', async () => {
    await fs.mkdir(path.join(vault, SPACE.issues), { recursive: true });
    await fs.mkdir(path.join(vault, SPACE.epics), { recursive: true });
    const ids = await scanExistingIds(vault, SPACE);
    expect(ids.size).toBe(0);
  });

  it('scans both epics/ and project dirs for container space', async () => {
    await fs.mkdir(path.join(vault, SPACE.epics), { recursive: true });
    await fs.mkdir(path.join(vault, SPACE.projects!['flow-weaver'].path), { recursive: true });
    await fs.writeFile(path.join(vault, SPACE.epics, 'VC-001-foo.md'), '---\nid: VC-001\n---\n');
    await fs.writeFile(path.join(vault, SPACE.projects!['flow-weaver'].path, 'VC-007-bar.md'), '---\nid: VC-007\n---\n');
    const ids = await scanExistingIds(vault, SPACE);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(7)).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('ignores other-prefix files and non-md files', async () => {
    await fs.mkdir(path.join(vault, SPACE.issues), { recursive: true });
    await fs.writeFile(path.join(vault, SPACE.issues, 'ST-003-other.md'), '');
    await fs.writeFile(path.join(vault, SPACE.issues, 'README.txt'), '');
    const ids = await scanExistingIds(vault, SPACE);
    expect(ids.size).toBe(0);
  });
});

describe('allocateNextId', () => {
  let vault: string;
  beforeEach(async () => { vault = await mkTmp(); });

  it('starts at 001 when empty', async () => {
    await fs.mkdir(path.join(vault, SPACE.issues), { recursive: true });
    await fs.mkdir(path.join(vault, SPACE.epics), { recursive: true });
    const id = await allocateNextId(vault, SPACE);
    expect(id).toBe('VC-001');
  });

  it('returns max+1', async () => {
    await fs.mkdir(path.join(vault, SPACE.epics), { recursive: true });
    await fs.writeFile(path.join(vault, SPACE.epics, 'VC-005-epic.md'), '');
    await fs.writeFile(path.join(vault, SPACE.epics, 'VC-010-epic2.md'), '');
    const id = await allocateNextId(vault, SPACE);
    expect(id).toBe('VC-011');
  });

  it('handles overflow past 999', async () => {
    await fs.mkdir(path.join(vault, SPACE.issues), { recursive: true });
    await fs.writeFile(path.join(vault, SPACE.issues, 'VC-999-last.md'), '');
    const id = await allocateNextId(vault, SPACE);
    expect(id).toBe('VC-1000');
  });
});
```

Run test — expect RED (module missing).

- [ ] **Step 2: 구현**

Write `packages/core/src/store/sequence.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { SpaceConfig } from './registry';

export function formatIssueId(prefix: string, seq: number): string {
  const padded = seq < 1000 ? String(seq).padStart(3, '0') : String(seq);
  return `${prefix}-${padded}`;
}

export async function scanExistingIds(vaultPath: string, space: SpaceConfig): Promise<Set<number>> {
  const ids = new Set<number>();
  const pattern = new RegExp(`^${space.idPrefix}-(\\d+)(?:[-.]|$)`);

  const dirs: string[] = [
    path.join(vaultPath, space.issues),
    path.join(vaultPath, space.epics),
  ];
  if (space.projects) {
    for (const p of Object.values(space.projects)) {
      dirs.push(path.join(vaultPath, p.path));
    }
  }

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const m = entry.match(pattern);
      if (m) ids.add(parseInt(m[1], 10));
    }
  }

  return ids;
}

export async function allocateNextId(vaultPath: string, space: SpaceConfig): Promise<string> {
  const existing = await scanExistingIds(vaultPath, space);
  let next = 1;
  if (existing.size > 0) {
    next = Math.max(...existing) + 1;
  }
  return formatIssueId(space.idPrefix, next);
}
```

- [ ] **Step 3: export 추가**

Edit `packages/core/src/index.ts`:

```typescript
export { allocateNextId, formatIssueId, scanExistingIds } from './store/sequence';
```

- [ ] **Step 4: GREEN 확인 + 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test sequence 2>&1 | tail -15
```
Expected: 전 pass.

```bash
cd ~/Projects/kanban-task-engine
git add packages/core/src/store/sequence.ts packages/core/tests/sequence.test.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): space별 ID 시퀀스 할당기 추가

VC-001/VC-042/VC-999 → VC-1000 포맷. 디스크 스캔 기반(별도 counter 파일
없음)으로 registry만으로 재구성 가능. container space는 epics/ +
projects/*/ 모두 스캔. idPrefix로 다른 space 파일 필터링.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:**
- 빈 vault에서 `VC-001` 반환.
- 기존 최댓값+1 반환.
- 999 초과 자릿수 자연 확장.

---

## Task 4: execa 의존성 추가 + git wrapper (TDD)

**Purpose:** spec §11.1의 worktree 생성 단계에서 호출하는 git 명령을 타입드 wrapper로 추상화. 테스트는 execa를 모킹해 인자/옵션을 검증.

**Files:**
- Modify: `packages/core/package.json` (execa 추가)
- Create: `packages/core/src/executor/git.ts`
- Create: `packages/core/tests/executor/git.test.ts`

**Depends on:** Task 1.

- [ ] **Step 1: execa 추가**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm add execa@^8.0.0
```
Expected: `package.json` dependencies에 `execa` 추가. `pnpm-lock.yaml` 갱신.

- [ ] **Step 2: 테스트 먼저 (RED)**

Write `packages/core/tests/executor/git.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitRunner } from '../../src/executor/git';
import {
  getOriginUrl,
  fetchOrigin,
  resolveBaseRef,
  addWorktree,
  removeWorktree,
  getStatusPorcelain,
  mergeFfOnly,
  getMergeBaseIsAncestor,
  deleteBranchForce,
} from '../../src/executor/git';

function makeRunner(cases: Array<{ args: string[]; stdout?: string; exitCode?: number }>): GitRunner {
  const calls: string[][] = [];
  const run = vi.fn(async (args: string[]) => {
    calls.push(args);
    const match = cases.find(c => JSON.stringify(c.args) === JSON.stringify(args));
    if (!match) throw new Error(`Unexpected git args: ${args.join(' ')}`);
    if (match.exitCode && match.exitCode !== 0) {
      const err: any = new Error('git failed');
      err.exitCode = match.exitCode;
      err.stderr = '';
      throw err;
    }
    return { stdout: match.stdout ?? '', exitCode: 0 };
  });
  return { run, cwd: '/fake', calls } as any;
}

describe('getOriginUrl', () => {
  it('returns url when origin exists', async () => {
    const r = makeRunner([{ args: ['remote', 'get-url', 'origin'], stdout: 'git@github.com:x/y.git\n' }]);
    expect(await getOriginUrl(r)).toBe('git@github.com:x/y.git');
  });
  it('returns null when no origin', async () => {
    const r = makeRunner([{ args: ['remote', 'get-url', 'origin'], exitCode: 128 }]);
    expect(await getOriginUrl(r)).toBeNull();
  });
});

describe('resolveBaseRef', () => {
  it('prefers origin/HEAD when available', async () => {
    const r = makeRunner([
      { args: ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], stdout: 'origin/main\n' },
    ]);
    expect(await resolveBaseRef(r, true)).toBe('origin/main');
  });
  it('falls back to main then master when no origin HEAD', async () => {
    const r = makeRunner([
      { args: ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], exitCode: 1 },
      { args: ['rev-parse', '--verify', 'main'], stdout: 'deadbeef\n' },
    ]);
    expect(await resolveBaseRef(r, true)).toBe('main');
  });
  it('returns master when main missing', async () => {
    const r = makeRunner([
      { args: ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], exitCode: 1 },
      { args: ['rev-parse', '--verify', 'main'], exitCode: 128 },
      { args: ['rev-parse', '--verify', 'master'], stdout: 'cafebabe\n' },
    ]);
    expect(await resolveBaseRef(r, true)).toBe('master');
  });
});

describe('addWorktree / removeWorktree', () => {
  it('adds worktree with branch', async () => {
    const r = makeRunner([
      { args: ['worktree', 'add', '-b', 'kanban/VC-001', '/repo/.worktrees/kanban/VC-001/', 'origin/main'], stdout: '' },
    ]);
    await addWorktree(r, '/repo/.worktrees/kanban/VC-001/', 'kanban/VC-001', 'origin/main');
    expect((r as any).calls[0]).toEqual(['worktree', 'add', '-b', 'kanban/VC-001', '/repo/.worktrees/kanban/VC-001/', 'origin/main']);
  });
  it('removes worktree with --force', async () => {
    const r = makeRunner([{ args: ['worktree', 'remove', '--force', '/repo/.worktrees/kanban/VC-001/'], stdout: '' }]);
    await removeWorktree(r, '/repo/.worktrees/kanban/VC-001/', { force: true });
  });
});

describe('mergeFfOnly', () => {
  it('returns true on success', async () => {
    const r = makeRunner([{ args: ['merge', '--ff-only', 'kanban/VC-001'], stdout: '' }]);
    expect(await mergeFfOnly(r, 'kanban/VC-001')).toBe(true);
  });
  it('returns false when non-ff', async () => {
    const r = makeRunner([{ args: ['merge', '--ff-only', 'kanban/VC-001'], exitCode: 128 }]);
    expect(await mergeFfOnly(r, 'kanban/VC-001')).toBe(false);
  });
});

describe('getMergeBaseIsAncestor', () => {
  it('true when ancestor', async () => {
    const r = makeRunner([{ args: ['merge-base', '--is-ancestor', 'kanban/VC-001', 'origin/main'], stdout: '' }]);
    expect(await getMergeBaseIsAncestor(r, 'kanban/VC-001', 'origin/main')).toBe(true);
  });
  it('false when not ancestor', async () => {
    const r = makeRunner([{ args: ['merge-base', '--is-ancestor', 'kanban/VC-001', 'origin/main'], exitCode: 1 }]);
    expect(await getMergeBaseIsAncestor(r, 'kanban/VC-001', 'origin/main')).toBe(false);
  });
});
```

- [ ] **Step 3: 구현**

Write `packages/core/src/executor/git.ts`:

```typescript
import { execa, ExecaError } from 'execa';

export interface GitRunResult { stdout: string; exitCode: number; }

export interface GitRunner {
  run(args: string[]): Promise<GitRunResult>;
  cwd: string;
}

export function createGitRunner(cwd: string): GitRunner {
  return {
    cwd,
    async run(args: string[]): Promise<GitRunResult> {
      const result = await execa('git', args, { cwd, reject: false });
      if (result.exitCode !== 0) {
        const err: any = new Error(`git ${args.join(' ')} failed (${result.exitCode}): ${result.stderr}`);
        err.exitCode = result.exitCode;
        err.stderr = result.stderr;
        err.stdout = result.stdout;
        throw err;
      }
      return { stdout: result.stdout ?? '', exitCode: 0 };
    },
  };
}

async function runOrNull(r: GitRunner, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await r.run(args);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getOriginUrl(r: GitRunner): Promise<string | null> {
  return runOrNull(r, ['remote', 'get-url', 'origin']);
}

export async function fetchOrigin(r: GitRunner): Promise<void> {
  await r.run(['fetch', 'origin', '--prune']);
}

export async function resolveBaseRef(r: GitRunner, hasOrigin: boolean): Promise<string> {
  if (hasOrigin) {
    const originHead = await runOrNull(r, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    if (originHead) return originHead;
  }
  if (await runOrNull(r, ['rev-parse', '--verify', 'main'])) return 'main';
  if (await runOrNull(r, ['rev-parse', '--verify', 'master'])) return 'master';
  throw new Error('Could not resolve base ref: no origin/HEAD, main, or master');
}

export async function addWorktree(r: GitRunner, worktreePath: string, branch: string, baseRef: string): Promise<void> {
  await r.run(['worktree', 'add', '-b', branch, worktreePath, baseRef]);
}

export async function removeWorktree(r: GitRunner, worktreePath: string, opts: { force?: boolean } = {}): Promise<void> {
  const args = ['worktree', 'remove'];
  if (opts.force) args.push('--force');
  args.push(worktreePath);
  await r.run(args);
}

export async function getStatusPorcelain(r: GitRunner): Promise<string> {
  const { stdout } = await r.run(['status', '--porcelain']);
  return stdout;
}

export async function mergeFfOnly(r: GitRunner, branch: string): Promise<boolean> {
  try {
    await r.run(['merge', '--ff-only', branch]);
    return true;
  } catch {
    return false;
  }
}

export async function getMergeBaseIsAncestor(r: GitRunner, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await r.run(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteBranchForce(r: GitRunner, branch: string): Promise<void> {
  await r.run(['branch', '-D', branch]);
}

export async function countNewCommits(r: GitRunner, baseRef: string, headRef: string): Promise<number> {
  const { stdout } = await r.run(['rev-list', '--count', `${baseRef}..${headRef}`]);
  return parseInt(stdout.trim() || '0', 10);
}
```

- [ ] **Step 4: GREEN 확인 + 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test git 2>&1 | tail -15
```
Expected: 전 pass.

```bash
cd ~/Projects/kanban-task-engine
git add packages/core/package.json packages/core/src/executor/git.ts packages/core/tests/executor/git.test.ts ../../pnpm-lock.yaml 2>/dev/null || git add packages/core/package.json packages/core/src/executor/git.ts packages/core/tests/executor/git.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(core): execa 기반 git wrapper

worktree/merge/branch 조작에 필요한 최소 git 명령을 타입드 함수로 래핑.
createGitRunner(cwd) 주입 가능한 GitRunner 인터페이스로 테스트 모킹.
spec §11.1의 fetch-origin → origin/HEAD → main/master fallback 순서
resolveBaseRef에 구현.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:**
- getOriginUrl/fetchOrigin/resolveBaseRef/addWorktree/removeWorktree/mergeFfOnly/getMergeBaseIsAncestor/deleteBranchForce/countNewCommits 모두 유닛 테스트 통과.

---

## Task 5: lock 매니저 (TDD)

**Purpose:** `kanban/runtime/current.lock` 단일 lock. acquire/release + stale detection (PID 기반).

**Files:**
- Create: `packages/core/src/executor/lock.ts`
- Create: `packages/core/tests/executor/lock.test.ts`

**Depends on:** Task 1.

- [ ] **Step 1: 테스트 (RED)**

Write `packages/core/tests/executor/lock.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { acquireLock, releaseLock, LockError } from '../../src/executor/lock';

async function mkTmp(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), 'lock-')); }

describe('lock', () => {
  let vault: string;
  beforeEach(async () => { vault = await mkTmp(); });

  it('acquires when no lock exists', async () => {
    const h = await acquireLock(vault, { issueId: 'VC-001' });
    expect(h.path).toBe(path.join(vault, 'runtime', 'current.lock'));
    await releaseLock(h);
  });

  it('throws when lock held by live process', async () => {
    const h1 = await acquireLock(vault, { issueId: 'VC-001' });
    await expect(acquireLock(vault, { issueId: 'VC-002' })).rejects.toThrow(LockError);
    await releaseLock(h1);
  });

  it('reclaims stale lock (pid dead)', async () => {
    await fs.mkdir(path.join(vault, 'runtime'), { recursive: true });
    await fs.writeFile(
      path.join(vault, 'runtime', 'current.lock'),
      JSON.stringify({ pid: 999999, issueId: 'VC-999', acquiredAt: new Date().toISOString() }),
    );
    const h = await acquireLock(vault, { issueId: 'VC-001' });
    await releaseLock(h);
  });

  it('releases lock (removes file)', async () => {
    const h = await acquireLock(vault, { issueId: 'VC-001' });
    await releaseLock(h);
    await expect(fs.access(h.path)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 구현**

Write `packages/core/src/executor/lock.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';

export class LockError extends Error {
  constructor(msg: string, public holder?: LockInfo) { super(msg); }
}

export interface LockInfo {
  pid: number;
  issueId: string;
  acquiredAt: string;
}

export interface LockHandle {
  path: string;
  info: LockInfo;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === 'EPERM';
  }
}

export async function acquireLock(vaultPath: string, opts: { issueId: string }): Promise<LockHandle> {
  const runtimeDir = path.join(vaultPath, 'runtime');
  await fs.mkdir(runtimeDir, { recursive: true });
  const lockPath = path.join(runtimeDir, 'current.lock');

  try {
    const existing = await fs.readFile(lockPath, 'utf-8');
    const holder = JSON.parse(existing) as LockInfo;
    if (holder.pid && isProcessAlive(holder.pid)) {
      throw new LockError(`Lock held by pid ${holder.pid} for issue ${holder.issueId}`, holder);
    }
    // stale — remove and fall through to acquire.
    await fs.unlink(lockPath).catch(() => {});
  } catch (err: any) {
    if (err instanceof LockError) throw err;
    if (err.code !== 'ENOENT') throw err;
  }

  const info: LockInfo = { pid: process.pid, issueId: opts.issueId, acquiredAt: new Date().toISOString() };
  await fs.writeFile(lockPath, JSON.stringify(info, null, 2), { flag: 'wx' });
  return { path: lockPath, info };
}

export async function releaseLock(handle: LockHandle): Promise<void> {
  await fs.unlink(handle.path).catch(() => {});
}
```

- [ ] **Step 3: GREEN + 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test lock 2>&1 | tail -15
```

```bash
cd ~/Projects/kanban-task-engine
git add packages/core/src/executor/lock.ts packages/core/tests/executor/lock.test.ts
git commit -m "$(cat <<'EOF'
feat(core): runtime/current.lock 매니저

단일 lock + pid 기반 stale 감지. 같은 pid가 release 없이 종료된 뒤 재실행
시 kill(pid, 0) 체크로 자동 회수. spec §11.1의 "이미 존재하면 실행 거절"을
LockError로 구현.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** 첫 acquire 성공, 중복 acquire 실패, stale 재획득 성공, release 정상.

---

## Task 6: run artifacts writer (TDD)

**Purpose:** `kanban/runs/<date>/<id>/<run-N>.{log,json}` + `kanban/events/<date>.jsonl` 쓰기 책임.

**Files:**
- Create: `packages/core/src/executor/run-artifacts.ts`
- Create: `packages/core/tests/executor/run-artifacts.test.ts`

**Depends on:** Task 1.

- [ ] **Step 1: 테스트**

Write `packages/core/tests/executor/run-artifacts.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  nextRunNumber,
  writeRunLog,
  writeRunMetadata,
  appendEvent,
  RunMetadata,
} from '../../src/executor/run-artifacts';

async function mkTmp(): Promise<string> { return fs.mkdtemp(path.join(os.tmpdir(), 'runs-')); }

describe('nextRunNumber', () => {
  it('returns 1 when no prior runs', async () => {
    const vault = await mkTmp();
    expect(await nextRunNumber(vault, 'VC-001', '2026-04-23')).toBe(1);
  });
  it('increments over existing run-N.log', async () => {
    const vault = await mkTmp();
    const dir = path.join(vault, 'runs', '2026-04-23', 'VC-001');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'run-1.log'), '');
    await fs.writeFile(path.join(dir, 'run-2.log'), '');
    expect(await nextRunNumber(vault, 'VC-001', '2026-04-23')).toBe(3);
  });
});

describe('writeRunLog / writeRunMetadata', () => {
  it('writes both log and json', async () => {
    const vault = await mkTmp();
    await writeRunLog(vault, 'VC-001', '2026-04-23', 1, 'hello stdout\nhello stderr\n');
    const meta: RunMetadata = {
      issueId: 'VC-001', runNumber: 1, startedAt: '2026-04-23T10:00:00Z',
      endedAt: '2026-04-23T10:10:00Z', exitCode: 0, baseCommit: 'abc', headCommit: 'def',
      acceptanceRatio: { total: 3, checked: 3 }, outcome: 'REVIEW',
    };
    await writeRunMetadata(vault, 'VC-001', '2026-04-23', 1, meta);
    const log = await fs.readFile(path.join(vault, 'runs', '2026-04-23', 'VC-001', 'run-1.log'), 'utf-8');
    const json = JSON.parse(await fs.readFile(path.join(vault, 'runs', '2026-04-23', 'VC-001', 'run-1.json'), 'utf-8'));
    expect(log).toContain('hello stdout');
    expect(json.outcome).toBe('REVIEW');
    expect(json.acceptanceRatio.checked).toBe(3);
  });
});

describe('appendEvent', () => {
  it('appends JSONL line to events/<date>.jsonl', async () => {
    const vault = await mkTmp();
    await appendEvent(vault, '2026-04-23', { type: 'transition', from: 'RUNNING', to: 'REVIEW', issueId: 'VC-001' });
    await appendEvent(vault, '2026-04-23', { type: 'transition', from: 'REVIEW', to: 'DONE', issueId: 'VC-001' });
    const content = await fs.readFile(path.join(vault, 'events', '2026-04-23.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).to).toBe('REVIEW');
  });
});
```

- [ ] **Step 2: 구현**

Write `packages/core/src/executor/run-artifacts.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';

export interface AcceptanceRatio { total: number; checked: number; }

export interface RunMetadata {
  issueId: string;
  runNumber: number;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  baseCommit: string;
  headCommit: string;
  acceptanceRatio: AcceptanceRatio;
  outcome: 'REVIEW' | 'FAILED';
  timeoutHit?: boolean;
  stderrTail?: string;
}

function runDir(vault: string, issueId: string, date: string): string {
  return path.join(vault, 'runs', date, issueId);
}

export async function nextRunNumber(vault: string, issueId: string, date: string): Promise<number> {
  const dir = runDir(vault, issueId, date);
  let entries: string[];
  try { entries = await fs.readdir(dir); } catch { return 1; }
  const nums: number[] = [];
  for (const e of entries) {
    const m = e.match(/^run-(\d+)\.log$/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

export async function writeRunLog(vault: string, issueId: string, date: string, runNumber: number, content: string): Promise<void> {
  const dir = runDir(vault, issueId, date);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `run-${runNumber}.log`), content);
}

export async function writeRunMetadata(vault: string, issueId: string, date: string, runNumber: number, meta: RunMetadata): Promise<void> {
  const dir = runDir(vault, issueId, date);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `run-${runNumber}.json`), JSON.stringify(meta, null, 2));
}

export interface EventRecord {
  type: 'transition';
  issueId: string;
  from: string;
  to: string;
  runNumber?: number;
  timestamp?: string;
  extra?: Record<string, unknown>;
}

export async function appendEvent(vault: string, date: string, ev: EventRecord): Promise<void> {
  const dir = path.join(vault, 'events');
  await fs.mkdir(dir, { recursive: true });
  const line = JSON.stringify({ timestamp: ev.timestamp ?? new Date().toISOString(), ...ev });
  await fs.appendFile(path.join(dir, `${date}.jsonl`), line + '\n');
}
```

- [ ] **Step 3: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test run-artifacts 2>&1 | tail -15
cd ~/Projects/kanban-task-engine
git add packages/core/src/executor/run-artifacts.ts packages/core/tests/executor/run-artifacts.test.ts
git commit -m "$(cat <<'EOF'
feat(core): run artifact writer

runs/<date>/<id>/run-N.{log,json} 쓰기 + events/<date>.jsonl append.
nextRunNumber는 기존 run-*.log 스캔으로 최대+1 계산. acceptance ratio는
RunMetadata에 저장되어 이후 board 렌더링에서 사용.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** log/json/jsonl 각 파일이 올바른 위치에 작성되고 run 번호가 단조 증가.

---

## Task 7: 프롬프트 어셈블러 (TDD)

**Purpose:** `목적/컨텍스트/Acceptance Criteria/실행 힌트` 4섹션 + protocol tail(commit 지침, AC 체크박스 재평가, 로그 append 지침)을 단일 markdown으로 조립.

**Files:**
- Create: `packages/core/src/executor/prompt-assembler.ts`
- Create: `packages/core/tests/executor/prompt-assembler.test.ts`

**Depends on:** Plan 2의 schema (`ParsedIssueMarkdown`).

- [ ] **Step 1: 테스트**

Write `packages/core/tests/executor/prompt-assembler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../../src/executor/prompt-assembler';

const sections = {
  '목적': '로그인 UI를 만든다.',
  '컨텍스트': 'packages/ui-tokens 참조.',
  'Acceptance Criteria': '- [ ] email field\n- [ ] password field',
  '실행 힌트': 'pnpm -F flow-weaver test로 확인.',
};

describe('assemblePrompt', () => {
  it('concatenates 4 sections in order', () => {
    const out = assemblePrompt({ issueId: 'VC-006', sections });
    expect(out).toContain('## 목적');
    expect(out).toContain('## 컨텍스트');
    expect(out).toContain('## Acceptance Criteria');
    expect(out).toContain('## 실행 힌트');
    expect(out.indexOf('## 목적')).toBeLessThan(out.indexOf('## 컨텍스트'));
  });

  it('appends protocol tail with commit/AC/log guidance', () => {
    const out = assemblePrompt({ issueId: 'VC-006', sections });
    expect(out).toContain('VC-006');
    expect(out).toMatch(/commit/i);
    expect(out).toMatch(/Acceptance Criteria/);
    expect(out).toMatch(/로그/);
  });

  it('throws if any required section is empty', () => {
    expect(() => assemblePrompt({ issueId: 'VC-006', sections: { ...sections, '목적': '' } })).toThrow();
  });
});
```

- [ ] **Step 2: 구현**

Write `packages/core/src/executor/prompt-assembler.ts`:

```typescript
export interface PromptInput {
  issueId: string;
  sections: Record<string, string>;
}

const REQUIRED_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트'] as const;

export function assemblePrompt(input: PromptInput): string {
  for (const s of REQUIRED_SECTIONS) {
    if (!input.sections[s] || !input.sections[s].trim()) {
      throw new Error(`assemblePrompt: section '${s}' is empty for ${input.issueId}`);
    }
  }

  const parts: string[] = [];
  parts.push(`# Issue ${input.issueId}\n`);
  for (const s of REQUIRED_SECTIONS) {
    parts.push(`## ${s}\n\n${input.sections[s].trim()}\n`);
  }

  parts.push(`---\n\n## 실행 프로토콜\n`);
  parts.push(
    `- 이 worktree에서 바로 변경을 수행하고, 의미 단위로 \`git commit\` 한다.\n` +
    `- 끝나기 전에 Acceptance Criteria 체크박스(\`- [ ]\`)를 실제 성취한 것만 \`- [x]\`로 업데이트한다.\n` +
    `- 완료 시 상위 이슈 파일의 \`## 로그\` 섹션에 ISO-8601 타임스탬프 + 3~10줄 요약을 append 한다(기존 로그 유지).\n` +
    `- 실패/차단 시 로그에 원인을 남기고 비어있는 커밋을 만들지 않는다.\n`,
  );
  return parts.join('\n');
}
```

- [ ] **Step 3: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test prompt-assembler 2>&1 | tail -15
cd ~/Projects/kanban-task-engine
git add packages/core/src/executor/prompt-assembler.ts packages/core/tests/executor/prompt-assembler.test.ts
git commit -m "$(cat <<'EOF'
feat(core): claude-code용 프롬프트 어셈블러

4섹션(목적/컨텍스트/AC/실행 힌트) + 프로토콜 꼬리(commit/AC/로그 지침)
조립. 어느 섹션이든 비어 있으면 throw (READY 전이 본문 요구치 재검증).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** 4섹션 순서 유지 + 프로토콜 꼬리 부착 + 빈 섹션 거절.

---

## Task 8: worktree 매니저 (TDD, executor 상위 계약)

**Purpose:** spec §11.1 1-4단계: `working_dir` 결정 → fetch origin → base ref → `git worktree add`. 역방향 cleanup (abort/retry/approve에서 재사용).

**Files:**
- Create: `packages/core/src/executor/worktree.ts`
- Create: `packages/core/tests/executor/worktree.test.ts`

**Depends on:** Task 4 (git wrapper).

- [ ] **Step 1: 테스트 — GitRunner 모킹**

Write `packages/core/tests/executor/worktree.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { GitRunner } from '../../src/executor/git';
import { createWorktree, cleanupWorktree, worktreePath } from '../../src/executor/worktree';

function stubRunner(script: Record<string, { stdout?: string; exitCode?: number }>): GitRunner {
  const calls: string[][] = [];
  return {
    cwd: '/repo',
    async run(args: string[]) {
      calls.push(args);
      const key = args.join(' ');
      const r = script[key];
      if (r === undefined) throw new Error(`Unexpected git: ${key}`);
      if (r.exitCode && r.exitCode !== 0) {
        const err: any = new Error('fail');
        err.exitCode = r.exitCode;
        throw err;
      }
      return { stdout: r.stdout ?? '', exitCode: 0 };
    },
  } as any;
}

describe('worktreePath', () => {
  it('formats <working_dir>/.worktrees/kanban/<id>/', () => {
    expect(worktreePath('/repo', 'VC-006')).toBe('/repo/.worktrees/kanban/VC-006/');
  });
});

describe('createWorktree', () => {
  it('fetches origin and creates worktree from origin/HEAD', async () => {
    const r = stubRunner({
      'remote get-url origin': { stdout: 'git@gh:x/y.git' },
      'fetch origin --prune': { stdout: '' },
      'symbolic-ref --short refs/remotes/origin/HEAD': { stdout: 'origin/main' },
      'worktree add -b kanban/VC-006 /repo/.worktrees/kanban/VC-006/ origin/main': { stdout: '' },
    });
    const out = await createWorktree(r, { workingDir: '/repo', issueId: 'VC-006' });
    expect(out.branch).toBe('kanban/VC-006');
    expect(out.baseRef).toBe('origin/main');
    expect(out.path).toBe('/repo/.worktrees/kanban/VC-006/');
  });

  it('skips fetch when --no-fetch', async () => {
    const r = stubRunner({
      'remote get-url origin': { stdout: 'git@gh:x/y.git' },
      'symbolic-ref --short refs/remotes/origin/HEAD': { stdout: 'origin/main' },
      'worktree add -b kanban/VC-007 /repo/.worktrees/kanban/VC-007/ origin/main': { stdout: '' },
    });
    await createWorktree(r, { workingDir: '/repo', issueId: 'VC-007', fetch: false });
  });

  it('falls back to local main when no origin', async () => {
    const r = stubRunner({
      'remote get-url origin': { exitCode: 128 },
      'rev-parse --verify main': { stdout: 'abc' },
      'worktree add -b kanban/VC-008 /repo/.worktrees/kanban/VC-008/ main': { stdout: '' },
    });
    const out = await createWorktree(r, { workingDir: '/repo', issueId: 'VC-008' });
    expect(out.baseRef).toBe('main');
  });
});

describe('cleanupWorktree', () => {
  it('removes worktree and deletes branch when force', async () => {
    const r = stubRunner({
      'worktree remove --force /repo/.worktrees/kanban/VC-006/': { stdout: '' },
      'branch -D kanban/VC-006': { stdout: '' },
    });
    await cleanupWorktree(r, { workingDir: '/repo', issueId: 'VC-006', force: true, deleteBranch: true });
  });
});
```

- [ ] **Step 2: 구현**

Write `packages/core/src/executor/worktree.ts`:

```typescript
import path from 'path';
import {
  GitRunner, getOriginUrl, fetchOrigin, resolveBaseRef, addWorktree,
  removeWorktree, deleteBranchForce,
} from './git';

export interface CreateWorktreeInput {
  workingDir: string;
  issueId: string;
  fetch?: boolean;    // default true
}

export interface CreateWorktreeOutput {
  path: string;
  branch: string;
  baseRef: string;
  workingDir: string;
}

export function worktreePath(workingDir: string, issueId: string): string {
  return path.join(workingDir, '.worktrees', 'kanban', issueId) + path.sep;
}

export function branchName(issueId: string): string {
  return `kanban/${issueId}`;
}

export async function createWorktree(runner: GitRunner, input: CreateWorktreeInput): Promise<CreateWorktreeOutput> {
  const doFetch = input.fetch !== false;
  const origin = await getOriginUrl(runner);
  if (origin && doFetch) {
    await fetchOrigin(runner);
  }
  const baseRef = await resolveBaseRef(runner, Boolean(origin));
  const wtPath = worktreePath(input.workingDir, input.issueId);
  const branch = branchName(input.issueId);
  await addWorktree(runner, wtPath, branch, baseRef);
  return { path: wtPath, branch, baseRef, workingDir: input.workingDir };
}

export interface CleanupWorktreeInput {
  workingDir: string;
  issueId: string;
  force?: boolean;
  deleteBranch?: boolean;
}

export async function cleanupWorktree(runner: GitRunner, input: CleanupWorktreeInput): Promise<void> {
  const wtPath = worktreePath(input.workingDir, input.issueId);
  await removeWorktree(runner, wtPath, { force: Boolean(input.force) });
  if (input.deleteBranch) {
    await deleteBranchForce(runner, branchName(input.issueId));
  }
}
```

- [ ] **Step 3: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test worktree 2>&1 | tail -15
cd ~/Projects/kanban-task-engine
git add packages/core/src/executor/worktree.ts packages/core/tests/executor/worktree.test.ts
git commit -m "$(cat <<'EOF'
feat(core): worktree 생성/정리 매니저

spec §11.1 1-4단계(fetch origin → origin/HEAD → main→master fallback →
git worktree add -b kanban/<id> <workingDir>/.worktrees/kanban/<id>/
<baseRef>) 구현. 경로는 항상 작업 대상 repo 내부 고정.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** createWorktree는 fetch/baseRef/add 호출 순서가 spec 그대로. cleanupWorktree는 remove(force) + branch -D.

---

## Task 9: claude-code-executor (TDD, spec §11.1 5-10단계)

**Purpose:** prompt 조립 → `claude -p @prompt.md` headless 실행 → stdout/stderr 로그 → 상태 분기(REVIEW/FAILED).

**Files:**
- Create: `packages/core/src/executor/claude-code-executor.ts`
- Create: `packages/core/tests/executor/claude-code-executor.test.ts`

**Depends on:** Tasks 2, 3, 4, 5, 6, 7, 8.

- [ ] **Step 1: 테스트 — `claude` CLI runner 주입 인터페이스**

Write `packages/core/tests/executor/claude-code-executor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runIssue, ClaudeRunner, ClaudeRunInput, ClaudeRunResult } from '../../src/executor/claude-code-executor';
import type { GitRunner } from '../../src/executor/git';

async function mkTmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'ex-')); }

function stubGit(cwd: string, newCommits = 1): GitRunner {
  return {
    cwd,
    async run(args: string[]) {
      const key = args.join(' ');
      if (key === 'remote get-url origin') return { stdout: 'git@gh:x/y.git', exitCode: 0 };
      if (key === 'fetch origin --prune') return { stdout: '', exitCode: 0 };
      if (key === 'symbolic-ref --short refs/remotes/origin/HEAD') return { stdout: 'origin/main', exitCode: 0 };
      if (args[0] === 'worktree' && args[1] === 'add') return { stdout: '', exitCode: 0 };
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { stdout: 'deadbeef', exitCode: 0 };
      if (args[0] === 'rev-list' && args[1] === '--count') return { stdout: String(newCommits), exitCode: 0 };
      return { stdout: '', exitCode: 0 };
    },
  } as any;
}

function stubClaude(exitCode: number, stdout = 'ok'): ClaudeRunner {
  return async (input: ClaudeRunInput): Promise<ClaudeRunResult> => ({
    exitCode, stdout, stderr: exitCode === 0 ? '' : 'boom', timedOut: false,
  });
}

const baseSections = {
  '목적': 'a', '컨텍스트': 'b', 'Acceptance Criteria': '- [ ] x', '실행 힌트': 'd',
};

describe('runIssue', () => {
  it('returns REVIEW on exit 0 with new commits', async () => {
    const vault = await mkTmp();
    const workingDir = await mkTmp();
    const result = await runIssue({
      vault, issueId: 'VC-010', workingDir,
      sections: baseSections,
      gitRunner: stubGit(workingDir, 2),
      claudeRunner: stubClaude(0),
      now: () => new Date('2026-04-23T10:00:00Z'),
    });
    expect(result.outcome).toBe('REVIEW');
    expect(result.newCommitCount).toBe(2);
  });

  it('returns REVIEW with warning when exit 0 + 0 commits', async () => {
    const vault = await mkTmp();
    const workingDir = await mkTmp();
    const result = await runIssue({
      vault, issueId: 'VC-011', workingDir,
      sections: baseSections,
      gitRunner: stubGit(workingDir, 0),
      claudeRunner: stubClaude(0),
      now: () => new Date('2026-04-23T10:00:00Z'),
    });
    expect(result.outcome).toBe('REVIEW');
    expect(result.warnings).toContain('no changes produced');
  });

  it('returns FAILED on non-zero exit', async () => {
    const vault = await mkTmp();
    const workingDir = await mkTmp();
    const result = await runIssue({
      vault, issueId: 'VC-012', workingDir,
      sections: baseSections,
      gitRunner: stubGit(workingDir, 0),
      claudeRunner: stubClaude(1),
      now: () => new Date('2026-04-23T10:00:00Z'),
    });
    expect(result.outcome).toBe('FAILED');
  });

  it('writes run-N.log and run-N.json', async () => {
    const vault = await mkTmp();
    const workingDir = await mkTmp();
    await runIssue({
      vault, issueId: 'VC-013', workingDir,
      sections: baseSections,
      gitRunner: stubGit(workingDir, 1),
      claudeRunner: stubClaude(0, 'hi'),
      now: () => new Date('2026-04-23T10:00:00Z'),
    });
    const log = await fs.readFile(path.join(vault, 'runs', '2026-04-23', 'VC-013', 'run-1.log'), 'utf-8');
    expect(log).toContain('hi');
  });
});
```

- [ ] **Step 2: 구현**

Write `packages/core/src/executor/claude-code-executor.ts`:

```typescript
import path from 'path';
import fs from 'fs/promises';
import { execa } from 'execa';
import { GitRunner, countNewCommits } from './git';
import { createWorktree, worktreePath } from './worktree';
import { assemblePrompt } from './prompt-assembler';
import { nextRunNumber, writeRunLog, writeRunMetadata, appendEvent, RunMetadata } from './run-artifacts';

export interface ClaudeRunInput {
  promptPath: string;
  cwd: string;
  timeoutMs: number;
}

export interface ClaudeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type ClaudeRunner = (input: ClaudeRunInput) => Promise<ClaudeRunResult>;

export const defaultClaudeRunner: ClaudeRunner = async ({ promptPath, cwd, timeoutMs }) => {
  try {
    const res = await execa('claude', ['-p', `@${promptPath}`], { cwd, timeout: timeoutMs, reject: false });
    return {
      exitCode: res.exitCode ?? 0,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      timedOut: Boolean(res.timedOut),
    };
  } catch (e: any) {
    return { exitCode: e.exitCode ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(e), timedOut: Boolean(e.timedOut) };
  }
};

export interface RunIssueInput {
  vault: string;
  issueId: string;
  workingDir: string;
  sections: Record<string, string>;
  gitRunner: GitRunner;
  claudeRunner?: ClaudeRunner;
  timeoutMs?: number;                // default 30min
  now?: () => Date;
}

export interface RunIssueResult {
  outcome: 'REVIEW' | 'FAILED';
  runNumber: number;
  newCommitCount: number;
  warnings: string[];
  worktreePath: string;
  metadataPath: string;
}

export async function runIssue(input: RunIssueInput): Promise<RunIssueResult> {
  const now = input.now ?? (() => new Date());
  const runner = input.claudeRunner ?? defaultClaudeRunner;
  const timeoutMs = input.timeoutMs ?? 30 * 60 * 1000;

  const startedAt = now().toISOString();
  const date = startedAt.slice(0, 10);

  // 1) worktree
  const wt = await createWorktree(input.gitRunner, {
    workingDir: input.workingDir, issueId: input.issueId,
  });
  const baseCommit = (await input.gitRunner.run(['rev-parse', wt.baseRef])).stdout.trim();

  // 2) prompt
  const promptMd = assemblePrompt({ issueId: input.issueId, sections: input.sections });
  const promptPath = path.join(wt.path, '.kanban-prompt.md');
  await fs.writeFile(promptPath, promptMd);

  // 3) run
  const runNumber = await nextRunNumber(input.vault, input.issueId, date);
  const runResult = await runner({ promptPath, cwd: wt.path, timeoutMs });
  const endedAt = now().toISOString();

  // 4) post-run git info
  const wtRunner: GitRunner = { cwd: wt.path, run: (a) => input.gitRunner.run(a.map(x => x)) }; // simple — reuse if runner scoped differently
  const headCommit = (await input.gitRunner.run(['rev-parse', 'HEAD'])).stdout.trim();
  const newCommitCount = await countNewCommits(input.gitRunner, wt.baseRef, 'HEAD');

  const warnings: string[] = [];
  let outcome: 'REVIEW' | 'FAILED';
  if (runResult.exitCode !== 0 || runResult.timedOut) {
    outcome = 'FAILED';
  } else {
    outcome = 'REVIEW';
    if (newCommitCount === 0) warnings.push('no changes produced');
  }

  // 5) log + metadata
  await writeRunLog(
    input.vault, input.issueId, date, runNumber,
    `[stdout]\n${runResult.stdout}\n\n[stderr]\n${runResult.stderr}\n`,
  );

  const acceptanceRatio = countAcceptance(input.sections['Acceptance Criteria'] ?? '');
  const meta: RunMetadata = {
    issueId: input.issueId,
    runNumber,
    startedAt,
    endedAt,
    exitCode: runResult.exitCode,
    baseCommit,
    headCommit,
    acceptanceRatio,
    outcome,
    timeoutHit: runResult.timedOut,
    stderrTail: runResult.stderr.split('\n').slice(-20).join('\n'),
  };
  await writeRunMetadata(input.vault, input.issueId, date, runNumber, meta);

  await appendEvent(input.vault, date, {
    type: 'transition',
    issueId: input.issueId,
    from: 'RUNNING',
    to: outcome,
    runNumber,
  });

  return {
    outcome,
    runNumber,
    newCommitCount,
    warnings,
    worktreePath: wt.path,
    metadataPath: path.join(input.vault, 'runs', date, input.issueId, `run-${runNumber}.json`),
  };
}

function countAcceptance(body: string): { total: number; checked: number } {
  const total = (body.match(/^- \[( |x)\]/gim) ?? []).length;
  const checked = (body.match(/^- \[x\]/gim) ?? []).length;
  return { total, checked };
}
```

- [ ] **Step 3: executor/index.ts 작성 + core export**

Write `packages/core/src/executor/index.ts`:

```typescript
export * from './git';
export * from './lock';
export * from './worktree';
export * from './run-artifacts';
export * from './prompt-assembler';
export * from './claude-code-executor';
```

Edit `packages/core/src/index.ts`: 끝에 추가.

```typescript
export * from './executor';
```

- [ ] **Step 4: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/core && pnpm test claude-code-executor 2>&1 | tail -20
cd ~/Projects/kanban-task-engine
git add packages/core/src/executor packages/core/tests/executor packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): claude-code worktree executor

spec §11.1 5-10단계 구현:
- worktree 생성 → 프롬프트 파일(.kanban-prompt.md) 작성 → claude -p
  @prompt.md headless 호출(기본 30분 timeout) → stdout/stderr 로그.
- exit 0 + 커밋 존재 → REVIEW / exit 0 + 커밋 0 → REVIEW + warning /
  exit != 0 || timeout → FAILED.
- run-N.log, run-N.json(base/head commit, AC 비율, outcome), events
  transition line 모두 동일 호출에서 산출.

frontmatter write-back(run_count 증가, updated 갱신, completed 기입)은
CLI 호출자(run/approve 커맨드)에서 수행. executor는 실행+artifact에 집중.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** 세 가지 outcome(REVIEW, REVIEW+warning, FAILED) 모두 유닛 테스트 통과. run artifacts가 실제로 디스크에 기록됨.

---

## Task 10: CLI 패키지 스캐폴드

**Purpose:** `packages/cli` 생성 + cac 진입점 + context resolver (vault 찾기, registry 파싱, markdown store 빌드).

**Files:**
- Create: `packages/cli/package.json`, `tsconfig.json`
- Create: `packages/cli/src/{index.ts,bin.ts,context.ts}`

**Depends on:** Tasks 2, 3, 9.

- [ ] **Step 1: 패키지 스캐폴드**

Write `packages/cli/package.json`:

```json
{
  "name": "@kanban-task-engine/cli",
  "version": "0.1.0",
  "description": "Kanban CLI (run/approve/abort/retry/sync/board)",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "kanban": "./dist/bin.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@kanban-task-engine/core": "workspace:*",
    "@kanban-task-engine/schema": "workspace:*",
    "cac": "^6.7.14",
    "gray-matter": "^4.0.3",
    "yaml": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

Write `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: bin shim + context**

Write `packages/cli/src/bin.ts`:

```typescript
#!/usr/bin/env node
import './index';
```

Write `packages/cli/src/context.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseRegistryYaml, Registry } from '@kanban-task-engine/core';

export interface CliContext {
  vault: string;
  registry: Registry;
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function resolveVault(override?: string): Promise<string> {
  const candidate = override ?? process.env.KANBAN_HOME ?? '~/.openclaw/workspace-kanban/kanban';
  const expanded = expandHome(candidate);
  const abs = path.resolve(expanded);
  try {
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) throw new Error(`vault not a directory: ${abs}`);
  } catch {
    throw new Error(`vault not found at ${abs} (set KANBAN_HOME or pass --vault)`);
  }
  try {
    await fs.access(path.join(abs, 'registry.yaml'));
  } catch {
    throw new Error(`registry.yaml not found in ${abs}`);
  }
  return abs;
}

export async function buildContext(vaultOverride?: string): Promise<CliContext> {
  const vault = await resolveVault(vaultOverride);
  const yaml = await fs.readFile(path.join(vault, 'registry.yaml'), 'utf-8');
  const registry = parseRegistryYaml(yaml);
  return { vault, registry };
}
```

Write `packages/cli/src/index.ts` (placeholder — 커맨드는 이후 Task에서 추가):

```typescript
import { cac } from 'cac';
import { buildContext } from './context';

const cli = cac('kanban');

cli.option('--vault <path>', 'Vault path (default: $KANBAN_HOME or ~/.openclaw/workspace-kanban/kanban)');

cli.command('board', 'Print current board state').action(async (opts) => {
  const { runBoard } = await import('./commands/board');
  await runBoard(await buildContext(opts.vault));
});

cli.command('sync', 'Regenerate boards + validate READY transitions').action(async (opts) => {
  const { runSync } = await import('./commands/sync');
  await runSync(await buildContext(opts.vault));
});

cli.command('run <id>', 'Run a READY issue in a worktree').action(async (id, opts) => {
  const { runRun } = await import('./commands/run');
  await runRun(await buildContext(opts.vault), id);
});

cli.command('next', 'Run oldest READY issue').action(async (opts) => {
  const { runNext } = await import('./commands/next');
  await runNext(await buildContext(opts.vault));
});

cli.command('approve <id>', 'REVIEW → DONE (ff-only merge)')
  .option('--rebase', 'Rebase onto origin/<merge_into> before merge')
  .action(async (id, opts) => {
    const { runApprove } = await import('./commands/approve');
    await runApprove(await buildContext(opts.vault), id, { rebase: Boolean(opts.rebase) });
  });

cli.command('abort <id>', 'REVIEW|FAILED → READY (keep worktree by default)')
  .option('--discard', 'Remove worktree/branch if ancestor check passes')
  .action(async (id, opts) => {
    const { runAbort } = await import('./commands/abort');
    await runAbort(await buildContext(opts.vault), id, { discard: Boolean(opts.discard) });
  });

cli.command('retry <id>', 'FAILED|REVIEW → READY (force-discard worktree/branch)').action(async (id, opts) => {
  const { runRetry } = await import('./commands/retry');
  await runRetry(await buildContext(opts.vault), id);
});

cli.help();
cli.parse();
```

- [ ] **Step 3: pnpm install + 초기 빌드**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm install 2>&1 | tail -5
cd ~/Projects/kanban-task-engine/packages/cli && pnpm build 2>&1 | tail -10
```
Expected: cli 패키지 인식 + build 실패(아직 commands/* 없음). 다음 Task에서 commands 추가하면 해결.

임시로 commands 없이도 build 통과하도록 `index.ts`의 dynamic import는 런타임 의존이므로 TypeScript 타입 체크는 통과해야 한다. 실제로 커맨드 디렉토리가 없으면 타입 에러가 날 수 있으니, **이 Step에서는 commands/ 디렉토리에 각 커맨드의 빈 skeleton(`export async function runX(...) {}`)을 만들어 타입만 맞추고 다음 Task에서 채운다**.

Write `packages/cli/src/commands/{run,next,approve,abort,retry,sync,board}.ts` — 각 파일은 다음 skeleton:

```typescript
import type { CliContext } from '../context';
export async function runRun(_ctx: CliContext, _id: string): Promise<void> { throw new Error('not implemented'); }
```

(함수명만 각 커맨드에 맞게 `runNext`, `runApprove(ctx, id, opts)`, `runAbort(ctx, id, opts)`, `runRetry(ctx, id)`, `runSync(ctx)`, `runBoard(ctx)`.)

Run build 재확인:
```bash
cd ~/Projects/kanban-task-engine/packages/cli && pnpm build 2>&1 | tail -5
```
Expected: 0 error.

- [ ] **Step 4: 커밋**

```bash
cd ~/Projects/kanban-task-engine
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): @kanban-task-engine/cli 패키지 스캐폴드

cac 기반 entrypoint + vault/registry 해석 context. 서브커맨드는 dynamic
import로 분리해 콜드 스타트 시간 최소화. 각 커맨드 파일은 skeleton만,
구현은 후속 Task에서 TDD.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** `pnpm -r build` green. `node packages/cli/dist/bin.js --help`가 모든 서브커맨드를 리스트.

---

## Task 11: `kanban sync` + `kanban board` 구현 (TDD)

**Purpose:** 나머지 커맨드가 store/registry를 소비하려면 먼저 가벼운 read-only 커맨드로 기반을 확정한다. `sync`는 보드 재생성 + READY 전이 검증(spec §8.7). `board`는 현재 보드 markdown을 출력.

**Files:**
- Create: `packages/cli/src/render/board-renderer.ts` + tests
- Create: `packages/cli/src/render/epic-index-renderer.ts` + tests
- Modify: `packages/cli/src/commands/{sync,board}.ts`
- Create: `packages/cli/tests/commands/{sync,board}.test.ts`

**Depends on:** Task 10.

- [ ] **Step 1: board-renderer 테스트 + 구현**

Write `packages/cli/tests/render/board-renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderBoardMarkdown, BoardIssue } from '../../src/render/board-renderer';

const issues: BoardIssue[] = [
  { id: 'VC-001', title: 'First', status: 'TODO', epic: null, type: 'task' },
  { id: 'VC-002', title: 'Second', status: 'READY', epic: 'VC-005', type: 'task' },
  { id: 'VC-003', title: 'Third', status: 'RUNNING', epic: null, type: 'bug' },
  { id: 'VC-004', title: 'Fourth', status: 'REVIEW', epic: null, type: 'task' },
  { id: 'VC-005', title: 'epic hidden', status: 'TODO', epic: null, type: 'epic' },
];

describe('renderBoardMarkdown', () => {
  it('groups by status and excludes epics', () => {
    const md = renderBoardMarkdown('vibe-coding', issues);
    expect(md).toContain('## TODO');
    expect(md).toContain('## READY');
    expect(md).toContain('## RUNNING');
    expect(md).toContain('## REVIEW');
    expect(md).toContain('## DONE');
    expect(md).toContain('## FAILED');
    expect(md).toContain('VC-001');
    expect(md).not.toContain('VC-005');   // epic 제외
  });

  it('attaches #epic/<id> tag when epic link present', () => {
    const md = renderBoardMarkdown('vibe-coding', issues);
    const readyBlock = md.split('## READY')[1].split('##')[0];
    expect(readyBlock).toContain('#epic/VC-005');
  });
});
```

Write `packages/cli/src/render/board-renderer.ts`:

```typescript
export interface BoardIssue {
  id: string;
  title: string;
  status: 'TODO' | 'READY' | 'RUNNING' | 'REVIEW' | 'DONE' | 'FAILED';
  epic: string | null;
  type: string;
}

const STATUS_ORDER = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;

export function renderBoardMarkdown(spaceKey: string, issues: BoardIssue[]): string {
  const lines: string[] = [
    '---',
    'kanban-plugin: basic',
    `space: ${spaceKey}`,
    'generated: true',
    '---',
    '',
    `<!-- generated by kanban sync - do not edit by hand -->`,
    '',
  ];
  for (const status of STATUS_ORDER) {
    lines.push(`## ${status}`);
    lines.push('');
    for (const it of issues) {
      if (it.type === 'epic') continue;
      if (it.status !== status) continue;
      const epicTag = it.epic ? ` #epic/${it.epic}` : '';
      lines.push(`- [ ] [[${it.id}]] ${it.title}${epicTag}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: epic-index-renderer 테스트 + 구현**

Write `packages/cli/tests/render/epic-index-renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderEpicIndex, EpicRow } from '../../src/render/epic-index-renderer';

describe('renderEpicIndex', () => {
  it('renders a table with progress counts', () => {
    const epics: EpicRow[] = [
      { id: 'VC-005', title: 'onboarding', status: 'TODO', children: { TODO: 2, READY: 1, RUNNING: 0, REVIEW: 0, DONE: 1, FAILED: 0 } },
    ];
    const md = renderEpicIndex('vibe-coding', epics);
    expect(md).toContain('| Epic |');
    expect(md).toContain('VC-005');
    expect(md).toContain('onboarding');
    expect(md).toContain('1/4');  // DONE / (total non-FAILED)
  });
});
```

Write `packages/cli/src/render/epic-index-renderer.ts`:

```typescript
export interface EpicRow {
  id: string;
  title: string;
  status: string;
  children: {
    TODO: number; READY: number; RUNNING: number; REVIEW: number; DONE: number; FAILED: number;
  };
}

export function renderEpicIndex(spaceKey: string, epics: EpicRow[]): string {
  const lines: string[] = [
    '---',
    `space: ${spaceKey}`,
    'generated: true',
    '---',
    '',
    `<!-- generated by kanban sync - do not edit by hand -->`,
    '',
    `# ${spaceKey} epics`,
    '',
    '| Epic | Title | Status | Done/Total | TODO | READY | RUNNING | REVIEW | FAILED |',
    '|------|-------|--------|-----------|------|-------|---------|--------|--------|',
  ];
  for (const ep of epics) {
    const c = ep.children;
    const total = c.TODO + c.READY + c.RUNNING + c.REVIEW + c.DONE;
    lines.push(`| [[${ep.id}]] | ${ep.title} | ${ep.status} | ${c.DONE}/${total} | ${c.TODO} | ${c.READY} | ${c.RUNNING} | ${c.REVIEW} | ${c.FAILED} |`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 3: `kanban sync` 구현**

`runSync`가 하는 일:
1. vault 전체를 space별로 훑어 issue markdown을 로드.
2. 각 이슈의 `status`가 READY이고 `executor != 'human'`이면 본문 4섹션이 모두 채워졌는지 검사 (spec §8.7).
   - 미충족 → 표준출력에 경고(`WARN`)만 내고 상태는 건드리지 않는다 (자동 FAILED 전이는 `kanban run`에서 수행).
3. 각 space별로 `boards/<space>.md`, `boards/<space>-epics.md` 재생성.
4. 요약(생성된 경로, 이슈 수, 경고 수) 출력.

Write `packages/cli/src/commands/sync.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import type { CliContext } from '../context';
import { renderBoardMarkdown, BoardIssue } from '../render/board-renderer';
import { renderEpicIndex, EpicRow } from '../render/epic-index-renderer';
import type { SpaceConfig } from '@kanban-task-engine/core';

interface IssueRecord {
  id: string; title: string; status: string; type: string; epic: string | null;
  executor: string; sections: Record<string, string>;
}

async function loadIssues(vault: string, space: SpaceConfig): Promise<IssueRecord[]> {
  const dirs: string[] = [path.join(vault, space.epics)];
  if (space.type === 'single') dirs.push(path.join(vault, space.issues));
  if (space.projects) for (const p of Object.values(space.projects)) dirs.push(path.join(vault, p.path));

  const records: IssueRecord[] = [];
  for (const dir of dirs) {
    let files: string[]; try { files = await fs.readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      const raw = await fs.readFile(full, 'utf-8');
      const parsed = matter(raw);
      const fm = parsed.data as any;
      if (!fm.id || !fm.title || !fm.type) continue;
      const sections = extractSections(parsed.content);
      records.push({
        id: String(fm.id), title: String(fm.title), status: String(fm.status),
        type: String(fm.type), epic: fm.epic ? String(fm.epic) : null,
        executor: String(fm.executor ?? 'human'), sections,
      });
    }
  }
  return records;
}

function extractSections(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let currentKey: string | null = null;
  let buf: string[] = [];
  for (const line of lines) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) {
      if (currentKey) out[currentKey] = buf.join('\n').trim();
      currentKey = m[1]; buf = [];
    } else if (currentKey) buf.push(line);
  }
  if (currentKey) out[currentKey] = buf.join('\n').trim();
  return out;
}

function missingRequiredSections(r: IssueRecord): string[] {
  const required = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트'];
  return required.filter(s => !r.sections[s] || !r.sections[s].trim());
}

export async function runSync(ctx: CliContext): Promise<void> {
  let warnings = 0;
  for (const [key, space] of Object.entries(ctx.registry.spaces)) {
    const records = await loadIssues(ctx.vault, space);

    // READY 본문 검증
    for (const r of records) {
      if (r.status === 'READY' && r.type !== 'epic' && r.executor !== 'human') {
        const missing = missingRequiredSections(r);
        if (missing.length > 0) {
          console.warn(`WARN ${r.id}: READY이지만 본문 섹션 비어있음: ${missing.join(', ')}`);
          warnings++;
        }
      }
    }

    // 보드 렌더
    const boardIssues: BoardIssue[] = records.map(r => ({
      id: r.id, title: r.title, type: r.type, epic: r.epic,
      status: r.status as BoardIssue['status'],
    }));
    const boardMd = renderBoardMarkdown(key, boardIssues);
    const boardPath = path.join(ctx.vault, space.board);
    await fs.mkdir(path.dirname(boardPath), { recursive: true });
    await fs.writeFile(boardPath, boardMd);

    // Epic 인덱스 렌더
    const epicRows: EpicRow[] = records.filter(r => r.type === 'epic').map(ep => {
      const children = records.filter(r => r.epic === ep.id);
      const count = (st: string) => children.filter(c => c.status === st).length;
      return {
        id: ep.id, title: ep.title, status: ep.status,
        children: {
          TODO: count('TODO'), READY: count('READY'), RUNNING: count('RUNNING'),
          REVIEW: count('REVIEW'), DONE: count('DONE'), FAILED: count('FAILED'),
        },
      };
    });
    const epicMd = renderEpicIndex(key, epicRows);
    const epicPath = path.join(ctx.vault, space.epicBoard);
    await fs.writeFile(epicPath, epicMd);

    console.log(`synced ${key}: ${records.length} issues, board + epicBoard written`);
  }
  if (warnings > 0) console.log(`${warnings} warning(s)`);
}
```

- [ ] **Step 4: `kanban board` 구현**

Write `packages/cli/src/commands/board.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { CliContext } from '../context';

export async function runBoard(ctx: CliContext): Promise<void> {
  for (const [key, space] of Object.entries(ctx.registry.spaces)) {
    const p = path.join(ctx.vault, space.board);
    try {
      const content = await fs.readFile(p, 'utf-8');
      console.log(`\n=== ${key} (${p}) ===\n`);
      console.log(content);
    } catch {
      console.log(`\n=== ${key} ===\n(board not generated yet; run 'kanban sync')`);
    }
  }
}
```

- [ ] **Step 5: sync 통합 테스트 (가벼운 fixture 기반)**

Write `packages/cli/tests/commands/sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runSync } from '../../src/commands/sync';
import type { CliContext } from '../../src/context';
import { parseRegistryYaml } from '@kanban-task-engine/core';

async function mkVault(): Promise<string> {
  const v = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
  await fs.mkdir(path.join(v, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.mkdir(path.join(v, 'issues/vibe-coding/flow-weaver'), { recursive: true });
  await fs.mkdir(path.join(v, 'boards'), { recursive: true });
  await fs.writeFile(path.join(v, 'registry.yaml'),
`spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      flow-weaver:
        path: issues/vibe-coding/flow-weaver
`);
  return v;
}

async function writeIssue(vault: string, rel: string, fm: Record<string, unknown>, body: string): Promise<void> {
  const lines = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${v}`), '---', '', body];
  await fs.writeFile(path.join(vault, rel), lines.join('\n'));
}

function ctxOf(vault: string): CliContext {
  const yaml = require('fs').readFileSync(path.join(vault, 'registry.yaml'), 'utf-8');
  return { vault, registry: parseRegistryYaml(yaml) };
}

describe('runSync', () => {
  it('renders boards and flags READY without required sections', async () => {
    const v = await mkVault();
    await writeIssue(v, 'issues/vibe-coding/flow-weaver/VC-001-a.md', {
      id: 'VC-001', title: 'a', type: 'task', status: 'READY', executor: 'claude-code',
      project: 'flow-weaver', created: '2026-04-23', updated: '2026-04-23',
    }, '## 컨텍스트\n\nonly this.');
    const warn = [] as string[];
    const origWarn = console.warn;
    console.warn = (m: string) => warn.push(m);
    try {
      await runSync(ctxOf(v));
    } finally { console.warn = origWarn; }
    expect(warn.some(m => m.includes('VC-001'))).toBe(true);
    const board = await fs.readFile(path.join(v, 'boards/vibe-coding.md'), 'utf-8');
    expect(board).toContain('VC-001');
  });

  it('excludes epics from main board', async () => {
    const v = await mkVault();
    await writeIssue(v, 'issues/vibe-coding/_epics/VC-005-ep.md', {
      id: 'VC-005', title: 'ep', type: 'epic', status: 'TODO', executor: 'human',
      project: '', created: '2026-04-20', updated: '2026-04-20',
    }, '## 목표\n\nx.\n\n## 범위\n\ny.\n\n## 성공 지표\n- [ ] z\n\n## 하위 티켓\n');
    await runSync(ctxOf(v));
    const board = await fs.readFile(path.join(v, 'boards/vibe-coding.md'), 'utf-8');
    expect(board).not.toContain('VC-005');
    const epic = await fs.readFile(path.join(v, 'boards/vibe-coding-epics.md'), 'utf-8');
    expect(epic).toContain('VC-005');
  });
});
```

- [ ] **Step 6: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/cli && pnpm test 2>&1 | tail -30
cd ~/Projects/kanban-task-engine
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): kanban sync + kanban board 커맨드

- sync: 각 space의 이슈를 스캔해 boards/<space>.md (6-column Obsidian
  Kanban), boards/<space>-epics.md (Epic 테이블) 재생성. READY이면서
  executor가 기계이고 본문 4섹션이 비어있는 이슈를 WARN으로 표시
  (상태는 건드리지 않음; 자동 FAILED는 run에서 처리).
- board: 생성된 보드 markdown을 stdout으로 출력.
- Epic은 메인 보드에서 제외, epic-index 렌더러가 하위 티켓 상태 집계.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** sync가 empty vault/normal vault 모두에서 동작. WARN이 정확히 해당 READY 이슈에만 발동.

---

## Task 12: `kanban run` + `kanban next` 구현 (TDD)

**Purpose:** spec §11.1의 실행 + state transition을 CLI로 묶는다. executor는 Task 9의 `runIssue`를 호출, 성공/실패에 따라 frontmatter 업데이트(status, run_count, updated)와 로그 섹션 append를 담당.

**Files:**
- Modify: `packages/cli/src/commands/run.ts`, `packages/cli/src/commands/next.ts`
- Create: `packages/cli/src/issue-io.ts` (frontmatter read/write 헬퍼) + test
- Create: `packages/cli/tests/commands/run.test.ts`, `packages/cli/tests/commands/next.test.ts`

**Depends on:** Tasks 9, 10, 11.

- [ ] **Step 1: `issue-io.ts` TDD**

Write `packages/cli/tests/issue-io.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadIssue, writeIssueStatus, appendLogEntry, findIssueFile } from '../src/issue-io';

describe('issue-io', () => {
  it('round-trips frontmatter status + run_count', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'iio-'));
    const p = path.join(d, 'VC-001.md');
    await fs.writeFile(p, `---
id: VC-001
title: t
type: task
status: READY
executor: claude-code
project: x
created: 2026-04-23
updated: 2026-04-23
run_count: 0
---

## 목적
p.

## 컨텍스트
c.

## Acceptance Criteria
- [ ] a.

## 실행 힌트
h.

## 로그
`);
    const issue = await loadIssue(p);
    expect(issue.frontmatter.status).toBe('READY');
    await writeIssueStatus(p, { status: 'RUNNING', updated: '2026-04-23T10:00:00Z', run_count: 1 });
    const reloaded = await loadIssue(p);
    expect(reloaded.frontmatter.status).toBe('RUNNING');
    expect(reloaded.frontmatter.run_count).toBe(1);
  });

  it('appends log entry below ## 로그 heading', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'iio-'));
    const p = path.join(d, 'VC-002.md');
    await fs.writeFile(p, `---
id: VC-002
title: t
type: task
status: RUNNING
executor: claude-code
project: x
created: 2026-04-23
updated: 2026-04-23
---

## 목적
p.

## 로그
`);
    await appendLogEntry(p, '2026-04-23T10:00:00Z', 'run-1 REVIEW\n2 commits.');
    const c = await fs.readFile(p, 'utf-8');
    expect(c).toContain('2026-04-23T10:00:00Z');
    expect(c).toContain('run-1 REVIEW');
    expect(c).toContain('2 commits.');
  });
});
```

Write `packages/cli/src/issue-io.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface LoadedIssue {
  filePath: string;
  frontmatter: Record<string, any>;
  body: string;
  sections: Record<string, string>;
}

export async function loadIssue(filePath: string): Promise<LoadedIssue> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  return {
    filePath,
    frontmatter: parsed.data,
    body: parsed.content,
    sections: extractSections(parsed.content),
  };
}

export function extractSections(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let k: string | null = null; let buf: string[] = [];
  for (const line of lines) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) { if (k) out[k] = buf.join('\n').trim(); k = m[1]; buf = []; }
    else if (k) buf.push(line);
  }
  if (k) out[k] = buf.join('\n').trim();
  return out;
}

export async function writeIssueStatus(filePath: string, patch: Record<string, any>): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  const merged = { ...parsed.data, ...patch };
  // gray-matter stringify를 쓰되 옵션으로 프리티 유지
  const out = matter.stringify(parsed.content, merged);
  await fs.writeFile(filePath, out);
}

export async function appendLogEntry(filePath: string, timestamp: string, entry: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const marker = '\n## 로그\n';
  const idx = raw.indexOf(marker);
  if (idx < 0) {
    // heading 없음 → 끝에 추가
    await fs.writeFile(filePath, raw + `\n## 로그\n\n### ${timestamp}\n\n${entry}\n`);
    return;
  }
  const before = raw.slice(0, idx + marker.length);
  const after = raw.slice(idx + marker.length);
  const newEntry = `\n### ${timestamp}\n\n${entry}\n`;
  await fs.writeFile(filePath, before + newEntry + after);
}

export async function findIssueFile(vault: string, issueId: string): Promise<string | null> {
  // walk issues/ subtrees
  const issuesRoot = path.join(vault, 'issues');
  const queue = [issuesRoot];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }) as any; } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) queue.push(full);
      else if (e.isFile() && e.name.startsWith(issueId) && e.name.endsWith('.md')) return full;
    }
  }
  return null;
}
```

Run test — expect pass.

- [ ] **Step 2: `run` 커맨드 구현**

`runRun(ctx, id)` 흐름:
1. `findIssueFile` → `loadIssue` → status가 READY 아니면 reject.
2. type=epic이거나 executor=human이면 reject.
3. 본문 4섹션 비었으면 즉시 frontmatter status=FAILED로 쓰고 로그에 "READY precondition failed" append, exit 1.
4. `acquireLock(ctx.vault, { issueId: id })`.
5. `resolveSpace`로 space 확인 (registry 존재 여부).
6. working_dir 결정: frontmatter.working_dir 있으면 expandHome, 아니면 `~/Projects/<project>/`. 존재 확인.
7. status를 RUNNING으로 write-back + log에 "run-N START" append.
8. `createGitRunner(workingDir)` + `runIssue(...)` 호출.
9. 결과에 따라 status를 REVIEW/FAILED로 업데이트, run_count += 1, updated 갱신, 로그에 `run-N ${outcome}` + metadata 요약 append.
10. lock release. 결과 요약 stdout.

Write `packages/cli/src/commands/run.ts`:

```typescript
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { CliContext } from '../context';
import { findIssueFile, loadIssue, writeIssueStatus, appendLogEntry } from '../issue-io';
import { resolveSpace, acquireLock, releaseLock, createGitRunner, runIssue } from '@kanban-task-engine/core';

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function runRun(ctx: CliContext, issueId: string): Promise<void> {
  const file = await findIssueFile(ctx.vault, issueId);
  if (!file) throw new Error(`Issue not found: ${issueId}`);
  const issue = await loadIssue(file);
  const fm = issue.frontmatter;

  if (fm.status !== 'READY') throw new Error(`${issueId} is ${fm.status}, not READY`);
  if (fm.type === 'epic') throw new Error(`${issueId} is an epic; cannot run`);
  if (fm.executor === 'human') throw new Error(`${issueId} executor is human`);

  const required = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트'];
  const missing = required.filter(s => !issue.sections[s] || !issue.sections[s].trim());
  if (missing.length > 0) {
    const ts = new Date().toISOString();
    await writeIssueStatus(file, { status: 'FAILED', updated: ts });
    await appendLogEntry(file, ts, `READY precondition failed: missing sections ${missing.join(', ')}`);
    console.error(`FAILED ${issueId}: missing ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const space = resolveSpace(ctx.registry, issueId);
  if (!space) throw new Error(`No space found for id ${issueId}`);

  const workingDir = expandHome(fm.working_dir ?? path.join('~/Projects', String(fm.project)));
  await fs.access(workingDir);

  const lock = await acquireLock(ctx.vault, { issueId });
  try {
    const runCount = typeof fm.run_count === 'number' ? fm.run_count : 0;
    const startedAt = new Date().toISOString();
    await writeIssueStatus(file, { status: 'RUNNING', updated: startedAt });
    await appendLogEntry(file, startedAt, `run-${runCount + 1} START (worktree=${workingDir}/.worktrees/kanban/${issueId}/)`);

    const gitRunner = createGitRunner(workingDir);
    const result = await runIssue({
      vault: ctx.vault,
      issueId,
      workingDir,
      sections: issue.sections,
      gitRunner,
    });

    const endedAt = new Date().toISOString();
    await writeIssueStatus(file, {
      status: result.outcome,
      updated: endedAt,
      run_count: runCount + 1,
    });
    const summary = [
      `run-${result.runNumber} ${result.outcome}`,
      `worktree: ${result.worktreePath}`,
      `new commits: ${result.newCommitCount}`,
      ...result.warnings.map(w => `warning: ${w}`),
      `artifact: ${result.metadataPath}`,
    ].join('\n');
    await appendLogEntry(file, endedAt, summary);

    console.log(`${issueId}: ${result.outcome} (run-${result.runNumber})`);
  } finally {
    await releaseLock(lock);
  }
}
```

- [ ] **Step 3: `next` 커맨드 구현**

`runNext(ctx)` 흐름:
- 전 space의 이슈를 스캔해 status=READY && type != 'epic' && executor != 'human'인 것 중 `created` 오름차순 최상위 1건을 골라 `runRun(ctx, id)` 호출.

Write `packages/cli/src/commands/next.ts`:

```typescript
import type { CliContext } from '../context';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { runRun } from './run';

export async function runNext(ctx: CliContext): Promise<void> {
  const candidates: Array<{ id: string; created: string }> = [];
  for (const space of Object.values(ctx.registry.spaces)) {
    const dirs = [path.join(ctx.vault, space.epics)];
    if (space.type === 'single') dirs.push(path.join(ctx.vault, space.issues));
    if (space.projects) for (const p of Object.values(space.projects)) dirs.push(path.join(ctx.vault, p.path));
    for (const dir of dirs) {
      let files: string[]; try { files = await fs.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const raw = await fs.readFile(path.join(dir, f), 'utf-8');
        const fm = matter(raw).data as any;
        if (fm.status !== 'READY') continue;
        if (fm.type === 'epic') continue;
        if (fm.executor === 'human') continue;
        candidates.push({ id: String(fm.id), created: String(fm.created ?? '') });
      }
    }
  }
  if (candidates.length === 0) {
    console.log('No READY machine-executable issues');
    return;
  }
  candidates.sort((a, b) => a.created.localeCompare(b.created));
  await runRun(ctx, candidates[0].id);
}
```

- [ ] **Step 4: `run`/`next` 통합 테스트 (claude runner 모킹)**

`runRun`은 내부적으로 `runIssue`를 호출하고, `runIssue`는 `defaultClaudeRunner`를 쓴다. 테스트에서는 `runIssue`를 직접 호출하지 못하고 `runRun`이 하드코딩된 default를 씁니다. 이를 TDD 가능하게 하려면 `runRun`에 optional `{ claudeRunner }` 인자를 받도록 확장하고, CLI 엔트리포인트는 default를 쓴다.

Edit `packages/cli/src/commands/run.ts`:

- `RunOptions` 파라미터에 `claudeRunner?: ClaudeRunner` 추가.
- `runIssue(...)` 호출에 `claudeRunner: opts.claudeRunner`를 전달.
- index.ts의 `runRun(await buildContext(opts.vault), id)`는 그대로 호출 (옵션 생략 → default).

시그니처 변경:
```typescript
import type { ClaudeRunner } from '@kanban-task-engine/core';
export interface RunOptions { claudeRunner?: ClaudeRunner; }
export async function runRun(ctx: CliContext, issueId: string, opts: RunOptions = {}): Promise<void> { ... }
```

Write `packages/cli/tests/commands/run.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execa } from 'execa';
import { runRun } from '../../src/commands/run';
import { parseRegistryYaml, type ClaudeRunner } from '@kanban-task-engine/core';
import type { CliContext } from '../../src/context';

async function mkWorkingRepo(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-'));
  await execa('git', ['init', '-b', 'main'], { cwd: d });
  await execa('git', ['config', 'user.email', 'x@x'], { cwd: d });
  await execa('git', ['config', 'user.name', 'x'], { cwd: d });
  await fs.writeFile(path.join(d, 'README.md'), 'init');
  await execa('git', ['add', '.'], { cwd: d });
  await execa('git', ['commit', '-m', 'init'], { cwd: d });
  return d;
}

async function mkVault(workingDir: string, status = 'READY'): Promise<{ vault: string; ctx: CliContext }> {
  const v = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
  await fs.mkdir(path.join(v, 'issues/vibe-coding/flow-weaver'), { recursive: true });
  await fs.mkdir(path.join(v, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.mkdir(path.join(v, 'boards'), { recursive: true });
  await fs.writeFile(path.join(v, 'registry.yaml'),
`spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      flow-weaver:
        path: issues/vibe-coding/flow-weaver
`);
  await fs.writeFile(path.join(v, 'issues/vibe-coding/flow-weaver/VC-001-t.md'),
`---
id: VC-001
title: t
type: task
status: ${status}
executor: claude-code
project: flow-weaver
created: 2026-04-23
updated: 2026-04-23
run_count: 0
working_dir: ${workingDir}
---

## 목적
p.

## 컨텍스트
c.

## Acceptance Criteria
- [ ] a.

## 실행 힌트
h.

## 로그
`);
  const yaml = await fs.readFile(path.join(v, 'registry.yaml'), 'utf-8');
  return { vault: v, ctx: { vault: v, registry: parseRegistryYaml(yaml) } };
}

describe('runRun', () => {
  it('transitions READY → REVIEW when claude succeeds with a commit', async () => {
    const repo = await mkWorkingRepo();
    const { ctx, vault } = await mkVault(repo);
    const fakeClaude: ClaudeRunner = async ({ cwd }) => {
      await fs.writeFile(path.join(cwd, 'a.txt'), 'hi');
      await execa('git', ['add', '.'], { cwd });
      await execa('git', ['commit', '-m', 'wip'], { cwd });
      return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false };
    };
    await runRun(ctx, 'VC-001', { claudeRunner: fakeClaude });
    const after = await fs.readFile(path.join(vault, 'issues/vibe-coding/flow-weaver/VC-001-t.md'), 'utf-8');
    expect(after).toContain('status: REVIEW');
    expect(after).toContain('run_count: 1');
  });

  it('transitions READY → FAILED on non-zero exit', async () => {
    const repo = await mkWorkingRepo();
    const { ctx, vault } = await mkVault(repo);
    const fakeClaude: ClaudeRunner = async () => ({ exitCode: 2, stdout: '', stderr: 'boom', timedOut: false });
    await runRun(ctx, 'VC-001', { claudeRunner: fakeClaude });
    const after = await fs.readFile(path.join(vault, 'issues/vibe-coding/flow-weaver/VC-001-t.md'), 'utf-8');
    expect(after).toContain('status: FAILED');
  });

  it('rejects non-READY issue', async () => {
    const repo = await mkWorkingRepo();
    const { ctx } = await mkVault(repo, 'TODO');
    await expect(runRun(ctx, 'VC-001')).rejects.toThrow(/not READY/);
  });
});
```

- [ ] **Step 5: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/cli && pnpm test 2>&1 | tail -30
cd ~/Projects/kanban-task-engine
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): kanban run + kanban next

- run <id>: READY precondition 재검증 → lock acquire → status RUNNING
  write-back + log START → core runIssue() 실행 → 결과에 따라 REVIEW/
  FAILED 전이 + run_count 증가 + updated 갱신 + log summary append.
- next: 전 space 스캔해 status=READY && type!=epic && executor!=human
  중 created 오름차순 최상위 1건을 자동 선택 후 run 호출.
- run 함수에 claudeRunner 주입 파라미터 추가 (테스트 모킹용).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** 실제 git repo fixture에서 REVIEW/FAILED 경로 통과. lock release 항상 보장.

---

## Task 13: `kanban approve` + `kanban abort` + `kanban retry` 구현 (TDD)

**Purpose:** spec §11.2 approve/abort/retry 의미론을 CLI 커맨드로.

**Files:**
- Modify: `packages/cli/src/commands/{approve,abort,retry}.ts`
- Create: `packages/cli/tests/commands/{approve,abort,retry}.test.ts`

**Depends on:** Task 12.

- [ ] **Step 1: `approve` 구현**

`runApprove(ctx, id, { rebase })`:
1. 이슈 로드 → status === REVIEW 아니면 reject.
2. working_dir 결정.
3. worktree git status --porcelain clean 확인.
4. working_dir에서 merge_into 브랜치 determine (frontmatter.merge_into || 엔진이 resolveBaseRef로 구한 기본값 — origin/HEAD의 short 이름).
5. `git fetch origin --prune`.
6. working_dir의 로컬 merge_into를 `origin/<merge_into>`로 ff 갱신 (`git checkout <merge_into>` + `git merge --ff-only origin/<merge_into>`). divergent면 reject.
7. `git merge --ff-only kanban/<id>`. 실패하고 `rebase=true`면 worktree에서 `git rebase origin/<merge_into>` 후 재시도.
8. 성공 시 cleanupWorktree (remove --force + branch -D).
9. frontmatter status=DONE + completed=now + updated=now + log append.

Write `packages/cli/src/commands/approve.ts` (핵심 로직):

```typescript
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { CliContext } from '../context';
import { findIssueFile, loadIssue, writeIssueStatus, appendLogEntry } from '../issue-io';
import {
  createGitRunner, fetchOrigin, getOriginUrl, resolveBaseRef,
  getStatusPorcelain, mergeFfOnly, cleanupWorktree, worktreePath,
} from '@kanban-task-engine/core';

export interface ApproveOptions { rebase?: boolean; }

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function runApprove(ctx: CliContext, issueId: string, opts: ApproveOptions = {}): Promise<void> {
  const file = await findIssueFile(ctx.vault, issueId);
  if (!file) throw new Error(`Issue not found: ${issueId}`);
  const issue = await loadIssue(file);
  if (issue.frontmatter.status !== 'REVIEW') throw new Error(`${issueId} is ${issue.frontmatter.status}, not REVIEW`);

  const workingDir = expandHome(issue.frontmatter.working_dir ?? path.join('~/Projects', String(issue.frontmatter.project)));
  const wtPath = worktreePath(workingDir, issueId);
  const repoRunner = createGitRunner(workingDir);
  const wtRunner = createGitRunner(wtPath);

  // clean check on worktree
  const dirty = await getStatusPorcelain(wtRunner);
  if (dirty.trim()) throw new Error(`worktree dirty: ${dirty}`);

  // merge_into
  const origin = await getOriginUrl(repoRunner);
  if (origin) await fetchOrigin(repoRunner);
  const mergeIntoRaw = issue.frontmatter.merge_into ?? (await resolveBaseRef(repoRunner, Boolean(origin)));
  const mergeInto = mergeIntoRaw.replace(/^origin\//, '');

  // Ensure local merge_into is ff-updated to origin/<merge_into>.
  if (origin) {
    await repoRunner.run(['checkout', mergeInto]);
    const ok = await mergeFfOnly(repoRunner, `origin/${mergeInto}`);
    if (!ok) throw new Error(`local ${mergeInto} divergent from origin/${mergeInto}; reconcile manually`);
  } else {
    await repoRunner.run(['checkout', mergeInto]);
  }

  // ff-merge kanban/<id> into merge_into
  let merged = await mergeFfOnly(repoRunner, `kanban/${issueId}`);
  if (!merged && opts.rebase) {
    await wtRunner.run(['rebase', origin ? `origin/${mergeInto}` : mergeInto]);
    merged = await mergeFfOnly(repoRunner, `kanban/${issueId}`);
  }
  if (!merged) throw new Error(`ff-only merge of kanban/${issueId} into ${mergeInto} failed`);

  // cleanup
  await cleanupWorktree(repoRunner, { workingDir, issueId, force: true, deleteBranch: true });

  const ts = new Date().toISOString();
  await writeIssueStatus(file, { status: 'DONE', completed: ts, updated: ts });
  await appendLogEntry(file, ts, `approve: merged kanban/${issueId} → ${mergeInto} (ff-only), worktree cleaned.`);
  console.log(`${issueId}: DONE`);
}
```

- [ ] **Step 2: `abort` 구현**

`runAbort(ctx, id, { discard })`:
1. status in {REVIEW, FAILED} 아니면 reject.
2. 기본은 worktree 유지. `discard=true`이면:
   - merge_into(default) 결정.
   - `git merge-base --is-ancestor kanban/<id> origin/<merge_into>` 통과 시에만 cleanupWorktree.
   - 실패 시 worktree 유지 + 경고.
3. status=READY + updated 갱신 + log append.

Write `packages/cli/src/commands/abort.ts`:

```typescript
import path from 'path';
import os from 'os';
import type { CliContext } from '../context';
import { findIssueFile, loadIssue, writeIssueStatus, appendLogEntry } from '../issue-io';
import {
  createGitRunner, getOriginUrl, fetchOrigin, resolveBaseRef,
  getMergeBaseIsAncestor, cleanupWorktree,
} from '@kanban-task-engine/core';

export interface AbortOptions { discard?: boolean; }

function expandHome(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function runAbort(ctx: CliContext, issueId: string, opts: AbortOptions = {}): Promise<void> {
  const file = await findIssueFile(ctx.vault, issueId);
  if (!file) throw new Error(`Issue not found: ${issueId}`);
  const issue = await loadIssue(file);
  const s = issue.frontmatter.status;
  if (s !== 'REVIEW' && s !== 'FAILED') throw new Error(`${issueId} is ${s}, not REVIEW|FAILED`);

  const workingDir = expandHome(issue.frontmatter.working_dir ?? path.join('~/Projects', String(issue.frontmatter.project)));
  const runner = createGitRunner(workingDir);

  let discarded = false;
  if (opts.discard) {
    const origin = await getOriginUrl(runner);
    if (origin) await fetchOrigin(runner);
    const mergeIntoRaw = issue.frontmatter.merge_into ?? (await resolveBaseRef(runner, Boolean(origin)));
    const mergeInto = mergeIntoRaw.startsWith('origin/') ? mergeIntoRaw : (origin ? `origin/${mergeIntoRaw}` : mergeIntoRaw);
    const ancestor = await getMergeBaseIsAncestor(runner, `kanban/${issueId}`, mergeInto);
    if (ancestor) {
      await cleanupWorktree(runner, { workingDir, issueId, force: true, deleteBranch: true });
      discarded = true;
    } else {
      console.warn(`${issueId}: --discard declined (kanban/${issueId} not ancestor of ${mergeInto}); worktree retained`);
    }
  }

  const ts = new Date().toISOString();
  await writeIssueStatus(file, { status: 'READY', updated: ts });
  await appendLogEntry(file, ts, `abort → READY (${discarded ? 'worktree discarded' : 'worktree retained'}).`);
  console.log(`${issueId}: READY${discarded ? ' (discarded)' : ''}`);
}
```

- [ ] **Step 3: `retry` 구현**

`runRetry(ctx, id)`:
1. status in {FAILED, REVIEW} 아니면 reject.
2. cleanupWorktree (force, deleteBranch) — **ancestor 체크 없이** 강제.
3. status=READY + updated 갱신 + log.

Write `packages/cli/src/commands/retry.ts`:

```typescript
import path from 'path';
import os from 'os';
import type { CliContext } from '../context';
import { findIssueFile, loadIssue, writeIssueStatus, appendLogEntry } from '../issue-io';
import { createGitRunner, cleanupWorktree } from '@kanban-task-engine/core';

function expandHome(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function runRetry(ctx: CliContext, issueId: string): Promise<void> {
  const file = await findIssueFile(ctx.vault, issueId);
  if (!file) throw new Error(`Issue not found: ${issueId}`);
  const issue = await loadIssue(file);
  const s = issue.frontmatter.status;
  if (s !== 'FAILED' && s !== 'REVIEW') throw new Error(`${issueId} is ${s}, not FAILED|REVIEW`);

  const workingDir = expandHome(issue.frontmatter.working_dir ?? path.join('~/Projects', String(issue.frontmatter.project)));
  const runner = createGitRunner(workingDir);
  try {
    await cleanupWorktree(runner, { workingDir, issueId, force: true, deleteBranch: true });
  } catch (e) {
    console.warn(`retry: cleanup partial (${(e as Error).message}); continuing`);
  }

  const ts = new Date().toISOString();
  await writeIssueStatus(file, { status: 'READY', updated: ts });
  await appendLogEntry(file, ts, 'retry → READY (worktree/branch force-removed).');
  console.log(`${issueId}: READY (retry)`);
}
```

- [ ] **Step 4: 통합 테스트**

Write `packages/cli/tests/commands/approve.test.ts` — 실제 git repo fixture + kanban 브랜치에 commit 하나 만들어둔 뒤 approve가 DONE으로 전이하는지 검증.

Write `packages/cli/tests/commands/abort.test.ts` — REVIEW 상태에서 abort, --discard 경로(ancestor 통과/실패) 양쪽.

Write `packages/cli/tests/commands/retry.test.ts` — FAILED에서 retry, worktree 존재 여부 무관하게 READY 도달.

(시간 관계상 본 plan에서는 최소 하나의 happy-path 테스트만 명시하고, edge case는 구현자가 실제 구현 중 추가한다.)

`packages/cli/tests/commands/approve.test.ts` 최소 구현:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execa } from 'execa';
import { runApprove } from '../../src/commands/approve';
import { parseRegistryYaml } from '@kanban-task-engine/core';

describe('runApprove', () => {
  it('ff-merges kanban/<id> into local default branch and cleans worktree', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-'));
    await execa('git', ['init', '-b', 'main'], { cwd: repo });
    await execa('git', ['config', 'user.email', 'x@x'], { cwd: repo });
    await execa('git', ['config', 'user.name', 'x'], { cwd: repo });
    await fs.writeFile(path.join(repo, 'r'), 'r');
    await execa('git', ['add', '.'], { cwd: repo });
    await execa('git', ['commit', '-m', 'base'], { cwd: repo });

    // create branch and commit (simulate worktree result)
    await execa('git', ['checkout', '-b', 'kanban/VC-001'], { cwd: repo });
    await fs.writeFile(path.join(repo, 'a'), 'a');
    await execa('git', ['add', '.'], { cwd: repo });
    await execa('git', ['commit', '-m', 'a'], { cwd: repo });
    await execa('git', ['checkout', 'main'], { cwd: repo });
    // worktree must actually exist — add it
    const wtRoot = path.join(repo, '.worktrees', 'kanban', 'VC-001');
    await execa('git', ['worktree', 'add', wtRoot, 'kanban/VC-001'], { cwd: repo });

    // vault
    const v = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    await fs.mkdir(path.join(v, 'issues/vibe-coding/flow-weaver'), { recursive: true });
    await fs.mkdir(path.join(v, 'issues/vibe-coding/_epics'), { recursive: true });
    await fs.writeFile(path.join(v, 'registry.yaml'),
`spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
`);
    const issuePath = path.join(v, 'issues/vibe-coding/flow-weaver/VC-001-t.md');
    await fs.writeFile(issuePath,
`---
id: VC-001
title: t
type: task
status: REVIEW
executor: claude-code
project: flow-weaver
created: 2026-04-23
updated: 2026-04-23
working_dir: ${repo}
merge_into: main
run_count: 1
---

## 목적
p.

## 컨텍스트
c.

## Acceptance Criteria
- [x] a.

## 실행 힌트
h.

## 로그
`);
    const yaml = await fs.readFile(path.join(v, 'registry.yaml'), 'utf-8');
    await runApprove({ vault: v, registry: parseRegistryYaml(yaml) }, 'VC-001');
    const after = await fs.readFile(issuePath, 'utf-8');
    expect(after).toContain('status: DONE');
    expect(after).toContain('completed:');
    // main should have the commit
    const log = (await execa('git', ['log', '--oneline'], { cwd: repo })).stdout;
    expect(log).toContain('a');
  });
});
```

(abort/retry 테스트도 유사하게 작성. 핵심 경로만 커버하면 된다.)

- [ ] **Step 5: GREEN + 커밋**

```bash
cd ~/Projects/kanban-task-engine/packages/cli && pnpm test 2>&1 | tail -30
cd ~/Projects/kanban-task-engine
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): kanban approve + abort + retry

- approve: REVIEW → DONE. worktree clean check → fetch origin →
  local merge_into를 origin/<merge_into>로 ff 갱신(divergent면 reject)
  → git merge --ff-only kanban/<id> → cleanupWorktree → completed 기입.
  --rebase 옵션 지원 (ff 실패 시 rebase 후 재시도).
- abort: REVIEW|FAILED → READY. 기본 worktree 유지. --discard는
  merge-base --is-ancestor 통과 시에만 worktree/branch 제거.
- retry: FAILED|REVIEW → READY. worktree/branch 무조건 force-remove
  (spec §11.2 "처음부터 다시" 신호).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit criteria:** 각 커맨드가 상태 전이 규칙을 지키고 git 상태가 예상대로 변한다.

---

## Task 14: 전체 회귀 검증

**Files:** 없음 (read/run).

**Depends on:** Tasks 1-13.

- [ ] **Step 1: 전 패키지 빌드**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r build 2>&1 | tail -20
```
Expected: 전부 성공.

- [ ] **Step 2: 전 패키지 테스트**

Run:
```bash
cd ~/Projects/kanban-task-engine && pnpm -r test 2>&1 | tail -60
```
Expected: 전부 green.

- [ ] **Step 3: `kanban --help` 수동 확인**

Run:
```bash
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js --help
```
Expected: 7개 서브커맨드(run/next/approve/abort/retry/sync/board) 리스트.

- [ ] **Step 4: git 상태**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: untracked `test-crlf.js`, `test_write_shell.txt` 외 빈 출력.

**Exit criteria:** 이후 Task 15(dogfood) 진입 조건 확보.

---

## Task 15: vibe-coding dogfood — registry 재작성 + 실티켓 1건 end-to-end

**Purpose:** 실제 vault에 신규 registry를 적용하고 VC-001 테스트 티켓 1건을 READY → RUNNING → REVIEW → DONE 전 사이클을 통과시켜 Plan 3가 end-to-end로 성립함을 확정. vault는 `~/.openclaw/workspace-kanban/kanban` 아직 없다면 기존 `~/.openclaw/kanban/`을 일시 사용 (spec §16의 이동은 후속 plan에서 수행).

**Files:**
- Modify: `~/.openclaw/kanban/registry.yaml` (또는 `~/.openclaw/workspace-kanban/kanban/registry.yaml`)
- Create: `~/.openclaw/kanban/issues/vibe-coding/kanban-task-engine/VC-001-sample-readme-touch.md`
- Commit in vault repo (engine repo 아님).

**Depends on:** Task 14.

- [ ] **Step 1: vault 위치 확인**

Run:
```bash
ls ~/.openclaw/workspace-kanban/kanban/registry.yaml 2>/dev/null || ls ~/.openclaw/kanban/registry.yaml
```
Expected: 둘 중 하나의 registry.yaml 발견. 본 Task는 발견된 경로를 `$VAULT`로 아래에서 치환.

- [ ] **Step 2: 기존 `registry.yaml` 백업**

Run:
```bash
VAULT=~/.openclaw/kanban   # (발견한 경로로 치환)
cp $VAULT/registry.yaml $VAULT/registry.yaml.bak
```

- [ ] **Step 3: 신규 registry.yaml 작성**

vault의 `registry.yaml`을 spec §15 예시로 완전 교체(최소 vibe-coding 단일 space부터 시작해도 OK):

```yaml
spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      ai-cli-orch-wrapper:
        path: issues/vibe-coding/ai-cli-orch-wrapper
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
      cc-openclaw-harness:
        path: issues/vibe-coding/cc-openclaw-harness
      flow-weaver:
        path: issues/vibe-coding/flow-weaver
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
```

필요한 디렉토리 생성:
```bash
mkdir -p $VAULT/issues/vibe-coding/{_epics,kanban-task-engine,flow-weaver,ai-cli-orch-wrapper,cc-openclaw-harness}
mkdir -p $VAULT/issues/openclaw/_epics
mkdir -p $VAULT/boards
```

- [ ] **Step 4: `KANBAN_HOME` 내보내기 + `kanban sync` 첫 실행**

Run:
```bash
export KANBAN_HOME=$VAULT
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js sync
```
Expected: `synced vibe-coding: 0 issues, ...`, `synced openclaw: 0 issues, ...`. `boards/vibe-coding.md` 등 생성 확인.

- [ ] **Step 5: 실티켓 VC-001 작성 (READY 상태로)**

Write `$VAULT/issues/vibe-coding/kanban-task-engine/VC-001-sample-readme-touch.md`:

```markdown
---
id: VC-001
title: sample — kanban-task-engine README 상단 문구 한 줄 다듬기
type: chore
status: READY
executor: claude-code
project: kanban-task-engine
priority: P3
created: <TODAY>
updated: <TODAY>
run_count: 0
working_dir: ~/Projects/kanban-task-engine
merge_into: main
---

## 목적

dogfood 첫 티켓. 엔진 실행 계약이 실제 repo에서 end-to-end로 동작하는지 검증한다.

## 컨텍스트

kanban-task-engine 루트 README.md 상단 소개 문장이 과거형이다. 한 줄만 현재 시제 + 매끈한 표현으로 다듬는다. 과한 변경 금지 — 1~2줄 내로 제한.

## Acceptance Criteria

- [ ] `README.md` 최상위 설명 단락이 현재 시제로 교체됨
- [ ] 다른 파일 변경 없음 (git diff가 README.md에만 국한)
- [ ] 한 개의 commit으로 작업 완료

## 실행 힌트

- 변경 후 `git diff --stat`으로 범위 확인.
- 테스트는 돌릴 필요 없음 (README만 건드림).

## 로그
```

`<TODAY>`는 실제 작성 날짜(예: `2026-04-23`).

- [ ] **Step 6: sync로 READY 검증 → run 실행**

Run:
```bash
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js sync
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js run VC-001
```

Expected:
- sync가 WARN 없이 통과 (본문 4섹션 다 채워졌음).
- run이 lock 획득 → worktree `~/Projects/kanban-task-engine/.worktrees/kanban/VC-001/` 생성 → claude 호출.
- **이 단계에서 `claude` CLI가 실제로 호출됨**. 세션 내에서 1회 실행. claude가 실패하면 FAILED로 기록되고 본 Task에서 로그로 원인 디버깅.

- [ ] **Step 7: 상태 확인**

Run:
```bash
cat $VAULT/issues/vibe-coding/kanban-task-engine/VC-001-*.md | head -40
ls $VAULT/runs/*/VC-001/
cat $VAULT/events/*.jsonl | tail -5
cd ~/Projects/kanban-task-engine/.worktrees/kanban/VC-001 && git log --oneline -3
```
Expected:
- frontmatter status가 REVIEW(또는 FAILED — 실패 시 재시도).
- `runs/<today>/VC-001/run-1.{log,json}` 존재.
- `events/<today>.jsonl`에 `RUNNING → REVIEW`(또는 FAILED) 라인.
- worktree에 README.md만 건드린 1개 커밋.

- [ ] **Step 8: approve → DONE**

Run:
```bash
cd ~/Projects/kanban-task-engine/.worktrees/kanban/VC-001 && git status
# 깨끗하면
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js approve VC-001
```
Expected:
- `main`에 VC-001 커밋 fast-forward.
- worktree와 `kanban/VC-001` 브랜치 삭제.
- 이슈 frontmatter `status: DONE`, `completed: <ts>`.
- **engine repo 기준**에서 README.md가 변경됨 (이 변경은 사용자 판단으로 commit을 push하거나 되돌린다 — dogfood 산출물이므로 유지 권장).

- [ ] **Step 9: 실패 경로 1회 의도적 재현**

Write `$VAULT/issues/vibe-coding/kanban-task-engine/VC-002-bad-precondition.md`:

```markdown
---
id: VC-002
title: 의도적 READY precondition 실패
type: chore
status: READY
executor: claude-code
project: kanban-task-engine
priority: P3
created: <TODAY>
updated: <TODAY>
---

## 목적

의도적으로 컨텍스트/AC/실행 힌트를 비워 READY 전이가 거절되는지 확인.

## 로그
```

Run:
```bash
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js run VC-002
```
Expected: 즉시 FAILED. `## 로그`에 "READY precondition failed: missing sections 컨텍스트, Acceptance Criteria, 실행 힌트" 기록.

Run:
```bash
node ~/Projects/kanban-task-engine/packages/cli/dist/bin.js retry VC-002
```
Expected: status=READY 복귀 (worktree 없으므로 cleanup은 warning 한 줄). 이후 사용자가 본문을 채우고 재시도 가능.

- [ ] **Step 10: vault 커밋**

vault는 독립 git repo. vault 디렉토리에서 커밋:

```bash
cd $VAULT
git add registry.yaml issues/ boards/ runs/ events/
git commit -m "$(cat <<'EOF'
chore: Plan 3 dogfood — registry 신규 스키마 + VC-001/VC-002 첫 실행 기록

- registry.yaml을 Plan 1 spec §15 신규 스키마로 교체 (vibe-coding /
  openclaw space 등록, idPrefix/epics/epicBoard 포함).
- issues/vibe-coding/kanban-task-engine/VC-001: kanban run → approve
  사이클이 실제 engine repo에서 동작함을 확인.
- issues/vibe-coding/kanban-task-engine/VC-002: READY precondition
  실패 → retry 경로 확인.
- runs/ / events/ 에 실행 기록 누적.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: engine repo 최종 상태 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git log --oneline -20
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: Plan 3의 Task 2-13 커밋 + VC-001이 approve되며 생긴 main 커밋(선택). untracked 파일 2개 외 빈 상태.

**Exit criteria:**
- 실제 vault에서 `kanban run` → `kanban approve` 한 사이클 성공.
- FAILED + retry 경로도 1회 확인.
- 실행 기록이 vault repo에 커밋됨.

---

## Self-Review

### 1. Spec coverage

| spec 요구 | 반영 Task |
|-----------|-----------|
| §15 registry (신규 스키마: type/idPrefix/issues/epics/board/epicBoard/projects) | Task 2 |
| §8 "VC-###" 3자리 zero-padding + 999 초과 자연 확장 | Task 3 |
| §11.1 step 1-4 (fetch origin → baseRef → worktree add) | Tasks 4, 8 |
| §11.1 step 5-10 (prompt, headless claude, REVIEW/FAILED 분기, run_count, log, event, lock) | Tasks 5, 6, 7, 9, 12 |
| §11.2 approve (ff-only + merge_into fetch + rebase 옵션 + cleanup + completed) | Task 13 (approve) |
| §11.2 abort (기본 유지, --discard는 ancestor 체크) | Task 13 (abort) |
| §11.2 retry (ancestor 체크 없이 force 제거) | Task 13 (retry) |
| §12 8단계 Home flow CLI 표면 | Tasks 11-13 |
| §8.7 READY 본문 요구치 (sync 경고 + run 시 FAILED) | Tasks 11 (sync warn), 12 (run reject→FAILED) |
| 보드 재생성 + Epic 인덱스 | Task 11 |
| vibe-coding dogfood end-to-end | Task 15 |

worktree 경로가 항상 `<workingDir>/.worktrees/kanban/<id>/`로 고정 (Task 8 `worktreePath` 단일 정의), 중앙집중 경로 생성 없음 확인.

### 2. Placeholder scan

- "TBD/TODO" 없음.
- 모든 Step이 Read/Write/Bash 명령으로 구체화.
- 테스트 케이스가 실제 import할 export 이름을 사용 (`parseRegistryYaml`, `allocateNextId`, `runIssue`, `runApprove` 등).
- Task 15의 `<TODAY>` 플레이스홀더는 사람이 채우도록 명시됨 (실행 시점 날짜).

### 3. Type consistency

- `SpaceConfig` (Task 2)가 `scanExistingIds`(Task 3), `loadIssues`(Task 11), `next` 후보 수집(Task 12)에서 동일 구조.
- `ClaudeRunner`(Task 9 export)가 `runRun` 옵션(Task 12), dogfood(Task 15 default)에서 동일 시그니처.
- `GitRunner`(Task 4)가 worktree(Task 8), executor(Task 9), approve/abort/retry(Task 13)에서 동일 인터페이스로 소비.
- `LoadedIssue.frontmatter`(Task 12 issue-io)의 필드명이 Plan 2에서 확정된 `type/status/executor/working_dir/merge_into/run_count/created/updated/completed`와 일치.
- `RunMetadata.outcome`(Task 6)의 리터럴(`'REVIEW' | 'FAILED'`)이 `runIssue` 반환(Task 9)과 동일.
- Epic 제외 규칙이 `board-renderer`(Task 11)와 `next` 후보 수집(Task 12)에서 동일하게 `type === 'epic'`, `executor === 'human'` 체크.

Self-review 이슈 없음. Plan 실행 가능.

---

## Execution Handoff

**Plan complete and saved to `~/Projects/kanban-task-engine/docs/superpowers/plans/2026-04-23-kanban-worktree-cli-plan.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — task별 fresh subagent dispatch + 각 커밋 리뷰. Task 9/12/13처럼 통합 테스트가 git fixture를 실제로 돌리는 구간은 작은 subagent가 좋다.
2. **Inline Execution** — executing-plans로 checkpoint 단위 배치 실행. 단, Task 15(dogfood)는 실제 `claude` CLI가 호출되므로 사람이 직접 감독하는 게 안전.

실행 순서 권장: **Plan 1 → Plan 2 → Plan 3**. 본 Plan은 Plan 2가 확정한 스키마를 가정하며, Plan 2 없이는 `loadIssue`/`runIssue`/`sync`가 구 필드명과 충돌한다.
