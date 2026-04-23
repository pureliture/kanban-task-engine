# Kanban Spec Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** authoritative `kanban-control-plane-design.md`(엔진 repo)과 `kanban-engine-vibe-coding-design.md`(workspace repo) 두 spec 문서를 합쳐 하나의 일관된 규약으로 정렬한다. 이후 스키마 코드 마이그레이션(Plan 2)과 worktree 기반 실행 레이어(Plan 3)가 목표로 삼을 단일 정본을 확보한다.

**Architecture:** 순수 문서 편집. 코드 변경·마이그레이션·테스트 없음. 두 개의 git 저장소(`~/Projects/kanban-task-engine/`, `~/.openclaw/workspace/`)에서 각기 별도 커밋. authoritative spec(§5, §6.2, §8, §11, §12, §15 외 잔여)에 내 컨벤션(`type`/`epic`/`created`/`updated`/VC-### id/4섹션 본문/worktree+ff-only 흐름/`working_dir`·`merge_into`·`run_count`·`depends_on` 신규 필드/Epic 필터 차원 규약)을 흡수하고, vibe-coding spec을 "space profile" 수준으로 축약하여 authoritative를 참조하게 만든다. 결과적으로 필드명·섹션명·id 스킴·실행 의미론이 두 문서에서 **일치**한다.

**Tech Stack:** Markdown. Git (두 repo 분리 커밋). 도구: Edit, Read, Bash grep.

---

## 전제

- authoritative spec 파일: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- vibe-coding spec 파일: `~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md`
- engine repo: `~/Projects/kanban-task-engine/` (현재 branch `main`, untracked `test-crlf.js`/`test_write_shell.txt` 존재하지만 건드리지 않음).
- workspace repo: `~/.openclaw/workspace/` (현재 branch `main`, 최신 커밋 `846e02b docs: 칸반 엔진 spec - worktree 경로/config 스키마 확정`).
- engine repo 내 이미 구현된 TS 패키지들은 **이번 plan에서 수정하지 않는다**. 필드 리네임 코드 작업은 Plan 2 스코프.

## File Structure

**Modify:**

- `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
  - 편집 대상 섹션: §5 Terminology, §6.2 Home Issue Vault, §8 Markdown Issue Schema, §11 Automation Model, §12 Trigger Model, §14 Work Mode (본문 참조 한 줄), §15 Registry
  - 각 섹션별 구체적 변경은 Task별 상세 참조.
- `~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md`
  - 성격 재정의: 엔진-보편 내용 축약 + "vibe-coding space profile" 포지셔닝.
  - authoritative 참조 명시.

**Do not create** any new file.
**Do not touch** (verify unchanged only): `~/Projects/kanban-task-engine/docs/kanban-runtime.md` (이미 authoritative를 포인트하고 있어 수정 불필요).

---

## Task 1: Preflight — authoritative spec 현황 감사

**Purpose:** 편집 작업 전에 authoritative spec에서 **구 필드명/구 id 패턴/구 섹션명**이 등장하는 모든 위치를 확정한다. 이후 Task들은 이 감사 결과의 라인/섹션을 근거로 수정한다.

**Files:** `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (read-only).

- [ ] **Step 1: 구 필드명 grep**

Run:
```bash
grep -nE 'issueType|^parent:|createdAt|updatedAt|issue-auth-refresh|^## Goal|Implementation Tasks|syncTarget|jiraProject|jiraKey' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: 최소 다음 라인들이 히트:
- L252 `id: issue-auth-refresh-001`
- L254 `issueType: story`
- L256 `parent: board-auth-platform`
- L263 `syncTarget: jira`
- L264 `jiraProject: AUTH`
- L265 `jiraKey:`
- L266 `createdAt: 2026-04-20`
- L267 `updatedAt: 2026-04-20`
- L276 `## Goal`
- L286 `## Implementation Tasks`
- L305 `- \`issueType\``
- L309 `- \`createdAt\``
- L310 `- \`updatedAt\``
- L314 `- \`parent\``
- L317 `- \`syncTarget\``
- L318 `- \`jiraProject\``
- L319 `- \`jiraKey\``
- L324 `- \`Goal\``
- L326 `- \`Implementation Tasks\``
- L551 `Goal, Acceptance Criteria, Implementation Tasks, Notes`

- [ ] **Step 2: id prefix 규약 관련 라인 확인**

Run:
```bash
grep -nE 'id:|project:|space' ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md | head -40
```
Expected: §15 Registry의 space 정의들(openclaw/vibe-coding/stocks/web/personal/career) 확인. 현재 `idPrefix` 필드는 부재.

- [ ] **Step 3: 카테고리별 영향 섹션 목록화**

다음 섹션이 이번 plan에서 편집 대상임을 재확인(변경 영향 없으면 건드리지 않는다):
- §5 Terminology (용어만 재확인 — 편집 없음 예상)
- §6.2 Home Issue Vault (디렉토리 트리에 `_epics/` 추가)
- §8 Markdown Issue Schema (**대규모 교체**)
- §9 Status Model (불변 — 이미 일치)
- §10 Canonical JSON (문구 참조만 — 필드명 예시 없으면 무편집)
- §11 Automation Model (claude-code-executor 동작 worktree화 — 설명 추가)
- §12 Trigger Model (8단계 흐름 확장)
- §14 Work Mode (§551의 Goal/AC/IT/Notes 참조를 새 섹션명으로 교체)
- §15 Registry (각 space에 `idPrefix` 필드 추가)
- §16 Migration Strategy (**편집 없음** — 이 Plan이 스펙만 손대고 파일 이동은 하지 않음)
- §17 Implementation Slices (필드명 참조가 없으면 무편집)
- §18 Testing Strategy (필드명 참조가 없으면 무편집)
- §20 Acceptance Criteria (현행 유지)

확인 사항 정리 완료.

---

## Task 2: §6.2 Home Issue Vault — `_epics/` 디렉토리 규약 추가

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§6.2 디렉토리 트리)

Epic이 일반 티켓과 섞이지 않도록 각 container space 하위에 `_epics/`를 두는 관례를 명시한다(프로젝트 횡단 허용을 위해 project 폴더 밖).

- [ ] **Step 1: 디렉토리 트리 교체**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

Replace the block (current lines ~107-137):

Old:
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

New:
```text
~/.openclaw/workspace-kanban/kanban/
├── .git/
├── README.md
├── KANBAN.md
├── registry.yaml
├── issues/
│   ├── openclaw/
│   │   └── _epics/
│   ├── vibe-coding/
│   │   ├── _epics/
│   │   ├── ai-cli-orch-wrapper/
│   │   ├── kanban-task-engine/
│   │   ├── cc-openclaw-harness/
│   │   └── flow-weaver/
│   ├── stocks/
│   │   └── _epics/
│   ├── web/
│   │   └── _epics/
│   ├── personal/
│   │   └── _epics/
│   └── career/
│       └── _epics/
├── boards/
│   ├── openclaw.md
│   ├── openclaw-epics.md
│   ├── vibe-coding.md
│   ├── vibe-coding-epics.md
│   ├── stocks.md
│   ├── stocks-epics.md
│   ├── web.md
│   ├── web-epics.md
│   ├── personal.md
│   ├── personal-epics.md
│   ├── career.md
│   └── career-epics.md
├── templates/
├── events/
├── canonical/
├── exports/
├── archive/
└── runtime/
```

- [ ] **Step 2: `_epics/` 설명 문단 추가**

디렉토리 트리 바로 아래 "The vault is a standalone git repository." 문장 앞에 다음 문단을 추가:

```markdown
Each space has an `_epics/` subdirectory that stores `type: epic` issue documents. Epics are never rendered as board cards; they exist only as a filter/aggregation dimension (see §8 and §11). Non-epic issues live under `issues/<space>/` directly for `single` spaces, or under `issues/<space>/<project>/` for `container` spaces with projects.

Each space has two board files: the main board (`boards/<space>.md`) and the Epic index (`boards/<space>-epics.md`). The main board is an Obsidian Kanban-compatible 6-column view over non-epic issues. The Epic index is a generated table (not a Kanban board) listing epics with progress counts.

```

- [ ] **Step 3: 변경 확인**

Run:
```bash
grep -nE '_epics/|-epics\.md' ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md | head -20
```
Expected: `_epics/` 6번, `-epics.md` 6번 출현(각 space별).

---

## Task 3: §8 Markdown Issue Schema — 전체 교체

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§8 전체)

§8은 이번 plan의 핵심 편집 지점이다. 예시 frontmatter, required/optional 필드 리스트, 본문 섹션 리스트를 모두 교체.

- [ ] **Step 1: §8 전체 블록 교체**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

Find the exact text `## 8. Markdown Issue Schema` and replace the entire section up to `## 9. Status Model` with:

```markdown
## 8. Markdown Issue Schema

The Markdown issue document is the control-plane document. It is edited by humans, OpenClaw, or other automation depending on policy. Each space registers an `idPrefix` in `registry.yaml` (§15). Issue ids follow `<PREFIX>-<zero-padded-seq>` where the sequence is a space-wide monotonic integer shared across all types (Jira issue-key parity).

### 8.1 Frontmatter (일반 티켓 예시)

```markdown
---
id: VC-006
title: 로그인 페이지 UI 스켈레톤
type: task
status: TODO
executor: claude-code
project: flow-weaver
epic: VC-005
priority: P2
assignee: ddalkak
created: 2026-04-23
updated: 2026-04-23
completed:
labels: []
depends_on: []
working_dir: ~/Projects/flow-weaver
merge_into:
run_count: 0
syncTarget:
jiraProject:
jiraKey:
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
- [ ] <검증 가능한 완료 조건 2>

## 실행 힌트

<수행 지침 — 스킬 이름, 테스트 명령, 제외 경로 등. 자유 서술>

## 로그

<append-only. 각 run마다 ISO-8601 타임스탬프 + 3~10줄 요약. executor가 RUNNING/REVIEW/FAILED 전이 시 자동 append>
```

### 8.2 Frontmatter (Epic 예시)

```markdown
---
id: VC-005
title: 온보딩 플로우 개편
type: epic
status: TODO
executor: human
project:
epic:
priority: P1
assignee: ddalkak
created: 2026-04-20
updated: 2026-04-20
completed:
labels: []
depends_on: []
working_dir:
merge_into:
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
- DONE: VC-007, VC-009
- RUNNING: VC-008
- READY: VC-010
- TODO: VC-011, VC-012
<!-- kanban:auto-render end -->

## 로그
```

Epic은 실행 대상이 아니다. `executor: human` 고정, `READY` 전이 불허, `TODO → RUNNING → DONE` 3개 상태만 실질 사용.

### 8.3 Required frontmatter fields

- `id`
- `title`
- `type`
- `status`
- `executor`
- `project` (type=`epic` 또는 `single` space에서는 빈 문자열 허용)
- `created`
- `updated`

### 8.4 Optional frontmatter fields

- `epic` (부모 Epic 포인터)
- `priority` (P0..P3)
- `assignee`
- `completed` (status=DONE 시 엔진이 자동 기입)
- `labels`
- `depends_on` — MVP는 metadata-only (상태 전이 차단에 사용하지 않음; sync가 경고만 표시)
- `working_dir` (executor cwd override; 미지정 시 `~/Projects/<project>/`)
- `merge_into` (approve 시 merge 대상 브랜치; 미지정 시 프로젝트 repo default)
- `run_count` (엔진 자동 증가)
- `syncTarget`
- `jiraProject`
- `jiraKey`
- `automation` (trigger 및 allowedActions 블록; 레시피/정책 입력)

### 8.5 `type` enum

- `epic` — 다수 티켓을 묶는 상위 단위. 보드 카드가 아니며 필터 차원으로 기능. `#epic/<id>` 태그를 자식 카드 라인에 부여.
- `task` — 기본 작업 단위. 기능 구현·리팩터링 포함.
- `bug` — 결함 수정.
- `chore` — 유지보수 / 운영.
- `docs` — 문서 작업.

`story`, `spike`, `subtask`는 MVP에서 제외. 협업 레이어 확장 시 재도입 가능.

### 8.6 Required Markdown sections

일반 티켓:

- `목적`
- `컨텍스트`
- `Acceptance Criteria`
- `실행 힌트`
- `로그`

Epic 티켓:

- `목표`
- `범위`
- `성공 지표`
- `하위 티켓` (내부에 `<!-- kanban:auto-render start/end -->` 마커 필수)
- `로그`

### 8.7 READY 전이의 본문 요구치

`executor: claude-code`(또는 기타 기계 executor)인 일반 티켓이 `status: READY`로 전이되려면 `목적`, `컨텍스트`, `Acceptance Criteria`, `실행 힌트` 네 섹션이 모두 비어 있지 않아야 한다. `kanban sync`/`kanban run`이 이 요구치를 검증하며 미충족 시 READY 전이를 거부하거나 즉시 FAILED 처리한다. `executor: human` 티켓은 이 요구치에서 면제된다.

### 8.8 Body section parsing

The parser only supports the constrained template above. Free-form documents are allowed elsewhere in the vault, but they are not parsed as issues unless they match the schema. `하위 티켓` 섹션의 `<!-- kanban:auto-render start/end -->` 마커 사이는 `kanban sync`가 재생성하는 영역으로, 사람이 손으로 유지하지 않는다.
```

- [ ] **Step 2: §8 구 필드/섹션 잔재 확인**

Run:
```bash
grep -nE 'issueType|createdAt|updatedAt|issue-auth-refresh|^## Goal|Implementation Tasks|^- `Goal`|^- `parent`|^- `syncTarget`' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected (§8 영역): §8 내부에서 위 패턴의 hit이 **전무**해야 함. §11/§12/§14에 잔재가 남아 있어도 이 task에서는 허용 (후속 task에서 정리).

---

## Task 4: §11 Automation Model — claude-code-executor의 worktree 동작 명시

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§11 끝에 문단 추가)

§11의 module 후보 리스트와 recipe 예시는 유지하되, `claude-code-executor`와 `state-transition`이 함께 수행하는 **worktree 기반 실행 규약**을 설명 문단으로 명시.

- [ ] **Step 1: §11 끝에 worktree 규약 문단 추가**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

§11 `## 11. Automation Model` 섹션의 Example Work Jira export recipe 코드 블록 (끝에 `externalSync: atlassian-only` 등이 포함된 블록) **다음 줄**에 다음 문단을 추가:

```markdown

### 11.1 Worktree Execution Contract (`claude-code-executor`)

Home 모드에서 `claude-code-executor` 모듈은 아래 계약을 준수한다. Work 모드에서는 이 모듈이 recipe에서 비활성화되므로 해당하지 않는다.

**입력:** `status: READY`인 issue 한 건. lock은 `kanban/runtime/current.lock` (space 무관 단일 lock). 이미 존재하면 실행 거절.

**Worktree 생성:**

1. Working directory 결정: frontmatter `working_dir` 또는 `~/Projects/<project>/`.
2. Remote 확인: `git -C <working_dir> remote get-url origin` 성공이고 `--no-fetch` 미지정이면 `git fetch origin --prune`.
3. Base ref 결정: remote 있으면 `git symbolic-ref --short refs/remotes/origin/HEAD` → 실패 시 `main`→`master` fallback. remote 없으면 로컬 default.
4. Worktree 생성: `git worktree add -b kanban/<id> <working_dir>/.worktrees/kanban/<id>/ <base-ref>`. 경로는 **작업 대상 repo 내부**로 고정. 중앙집중(`~/.openclaw/.worktrees/` 등) 금지.

**실행:**

5. 프롬프트 조립: `목적 / 컨텍스트 / Acceptance Criteria / 실행 힌트` 4섹션 + 프로토콜 꼬리(commit 지침, acceptance 체크박스 재평가 지침, 로그 append 지침).
6. `claude -p @prompt.md` headless 호출. stdout/stderr은 `kanban/runs/<date>/<id>/<run-N>.log`. 타임아웃 기본 30분.

**상태 전이 (RUNNING → REVIEW / FAILED):**

7. exit 0 + worktree에 신규 커밋 존재 → `status: REVIEW`.
8. exit 0 + 커밋 없음 → `status: REVIEW`, 로그에 `no changes produced` 경고.
9. exit != 0 또는 timeout → `status: FAILED`, stderr 꼬리 로그 저장.
10. `run_count` 증가, `updated` 갱신, `kanban/events/<date>.jsonl`에 전이 이벤트 append, lock 해제.

### 11.2 Approval / Abort / Retry

- `approve`: `status: REVIEW` → `DONE`. 조건:
  - worktree `git status --porcelain` clean.
  - `merge_into`(없으면 default branch) 로컬 브랜치를 `origin/<merge_into>`로 ff 갱신 (divergent면 거절).
  - `git merge --ff-only kanban/<id>` 성공 필수. ff 불가 + `--rebase` 지정 시 worktree에서 `git rebase origin/<merge_into>` 후 재시도.
  - 성공 시 worktree/브랜치 제거, `completed` 타임스탬프 기입.
- `abort`: `status: REVIEW|FAILED` → `READY`. 기본은 worktree 유지. `--discard` 지정 시 `git merge-base --is-ancestor` 통과 시에만 worktree/브랜치 제거.
- `retry`: `status: FAILED|REVIEW` → `READY`. worktree/브랜치를 **ancestor 체크 없이 강제 제거** (명시적 "처음부터 다시" 신호). 본문 수정이 필요하면 retry 전에 사람이 이슈를 편집한다.

자세한 CLI 표면과 lock/artifact 규약은 후속 plan(Layer 3)에서 확정한다. 여기서는 **상태 전이 의미론과 worktree 경로 규약**만을 정본으로 박는다.

```

- [ ] **Step 2: §11 변경 확인**

Run:
```bash
grep -nE 'Worktree Execution Contract|11\.1|11\.2' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: §11.1, §11.2 헤딩 각각 1회 히트.

---

## Task 5: §12 Trigger Model — 8단계 흐름을 worktree 기반으로 확장

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§12)

§12의 기존 8단계 흐름을 유지하되, 각 단계에서 §11.1/§11.2의 실행 규약이 어떻게 엮이는지를 명시한다.

- [ ] **Step 1: §12 기존 Home flow 블록 교체**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

Replace the text block in §12:

Old:
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

New:
```text
1. Issue is created with status=TODO.
2. Human grooms the body (목적/컨텍스트/Acceptance Criteria/실행 힌트) and transitions to READY (card drag or frontmatter edit + `kanban sync`).
3. Human (or policy-approved automation) issues an explicit Run command (`kanban run <id>` or `kanban next`).
4. `claude-code-executor` acquires the lock, creates `<working_dir>/.worktrees/kanban/<id>/` from `origin/<default>` tip (after `git fetch`), transitions status READY → RUNNING.
5. Executor invokes the configured backend (`claude -p` headless for Home claude-code; OpenClaw/ACP and others are out of MVP scope).
6. Executor appends a timestamped summary to the issue's `로그` section and writes structured artifacts to `kanban/runs/<date>/<id>/<run-N>.{log,json}`. Run metadata records base/head commits and acceptance checkbox ratio.
7. `state-transition` moves RUNNING → REVIEW (exit 0) or RUNNING → FAILED (non-zero/timeout), emits a `kanban/events/<date>.jsonl` line, releases the lock.
8. Human inspects worktree + log and issues `kanban approve <id>` (ff-only merge + worktree cleanup → DONE) or `kanban abort <id>` (→ READY, worktree retained unless `--discard`).
```

- [ ] **Step 2: §12 이후 참고 문단 유지 확인**

다음 두 문단은 **유지**한다 (교체하지 말 것):

```text
This avoids the earlier overly strong rule where moving a card to a work column immediately started execution.

Modes may later allow stronger behavior, such as "auto-run READY issues for selected spaces", but that must be expressed as a recipe/policy change rather than hardcoded into the engine.
```

확인: Step 1 수행 후에도 위 문단 2개가 §12 내에 남아 있음을 `grep "auto-run READY issues"` 등으로 확인.

Run:
```bash
grep -n "auto-run READY issues\|overly strong rule" \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: 각 패턴이 1회씩 히트.

---

## Task 6: §14 Work Mode — 본문 섹션 참조 업데이트

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§14의 한 문장)

§14 말미의 "Goal, Acceptance Criteria, Implementation Tasks, Notes" 문구를 새 섹션명으로 교체.

- [ ] **Step 1: §14 본문 섹션 참조 교체**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

Replace:

Old:
```markdown
Allowed Work write-back is limited to local Markdown metadata fields that record export results, such as `jiraKey`, `jiraStatus`, and `exportedAt`. Jira must not rewrite Goal, Acceptance Criteria, Implementation Tasks, Notes, or other document body sections.
```

New:
```markdown
Allowed Work write-back is limited to local Markdown metadata fields that record export results, such as `jiraKey`, `jiraStatus`, and `exportedAt`. Jira must not rewrite `목적`, `컨텍스트`, `Acceptance Criteria`, `실행 힌트`, `로그`, or other document body sections (same constraint applies to Epic sections: `목표`, `범위`, `성공 지표`, `하위 티켓`).
```

- [ ] **Step 2: 잔재 확인**

Run:
```bash
grep -n 'Goal, Acceptance Criteria, Implementation Tasks' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: 출력 없음 (구 문구 완전 제거).

---

## Task 7: §15 Registry — 각 space에 `idPrefix` 필드 추가

**Files:**
- Modify: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (§15 예시 YAML)

Jira-style id를 위한 per-space prefix를 registry 스키마에 못 박는다.

- [ ] **Step 1: §15 Registry 예시 교체**

Edit `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`:

Replace the YAML block in §15:

Old:
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

New:
```yaml
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
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
  stocks:
    type: single
    idPrefix: ST
    issues: issues/stocks
    epics: issues/stocks/_epics
    board: boards/stocks.md
    epicBoard: boards/stocks-epics.md
  web:
    type: single
    idPrefix: WB
    issues: issues/web
    epics: issues/web/_epics
    board: boards/web.md
    epicBoard: boards/web-epics.md
  personal:
    type: single
    idPrefix: PS
    issues: issues/personal
    epics: issues/personal/_epics
    board: boards/personal.md
    epicBoard: boards/personal-epics.md
  career:
    type: single
    idPrefix: CR
    issues: issues/career
    epics: issues/career/_epics
    board: boards/career.md
    epicBoard: boards/career-epics.md
```

- [ ] **Step 2: §15 설명 문단 보강**

예시 YAML 바로 앞의 설명 문장 "The vault registry maps spaces and projects." 바로 다음에 아래 문단을 추가:

```markdown
Each space declares `idPrefix`, which is used as the frontmatter `id` prefix (`<idPrefix>-<zero-padded-seq>`). Sequences are space-wide monotonic integers shared across all `type` values (`epic`, `task`, `bug`, `chore`, `docs`). `epics:` and `epicBoard:` entries are mandatory for every space even when no epics exist yet (the generator tolerates empty folders and empty indexes).

```

- [ ] **Step 3: 변경 확인**

Run:
```bash
grep -nE 'idPrefix|epicBoard|epics: issues' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: `idPrefix:` 6회, `epicBoard:` 6회, `epics: issues` 6회.

---

## Task 8: 전체 잔재 grep + 정합성 최종 스캔

**Files:** `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` (read-only 확인)

Task 2~7 편집 이후에도 구 필드명·구 섹션명이 남아 있는지 전체 스캔.

- [ ] **Step 1: 구 필드명/섹션명 grep**

Run:
```bash
grep -nE 'issueType|^\s*parent:|createdAt|updatedAt|issue-auth-refresh|^## Goal\b|Implementation Tasks|Execution Log|^- `Goal`|^- `parent`|^- `issueType`|^- `createdAt`|^- `updatedAt`' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: **출력 없음**. 잔재 있으면 해당 라인을 맥락 보고 개별 수정 후 재실행.

- [ ] **Step 2: 새 섹션명/필드명 존재 확인**

Run:
```bash
grep -nE '^## 목적|^## 컨텍스트|^## 실행 힌트|^## 로그|^## 목표|^## 범위|^## 성공 지표|^## 하위 티켓' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: 각 헤딩이 최소 1회 히트 (§8.1/§8.2 예시 내부).

- [ ] **Step 3: §9 Status Model 불변 확인**

Run:
```bash
grep -nA2 'The shared status model' ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md | head -15
```
Expected: TODO/READY/RUNNING/REVIEW/DONE/FAILED 순서 유지.

- [ ] **Step 4: §17 Implementation Slices 문구 점검**

§17의 Slice 3, Slice 5, Slice 9, Slice 10 부분에 구 필드명(`issueType`, `createdAt` 등)이 inline으로 박혀 있지 않은지 확인.

Run:
```bash
sed -n '/## 17. Implementation Slices/,/## 18/p' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md \
  | grep -E 'issueType|createdAt|Goal|Implementation Tasks'
```
Expected: 출력 없음. 히트 있으면 개별 수정.

---

## Task 9: authoritative spec 편집 커밋 (engine repo)

**Files:**
- Commit in: `~/Projects/kanban-task-engine/`
- Staged: `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`

- [ ] **Step 1: git status 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
```
Expected: `M docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`만 + untracked `test-crlf.js`, `test_write_shell.txt` (이 두 개는 건드리지 않는다).

- [ ] **Step 2: 변경 diff 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git diff --stat docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: 수백 줄 단위 변경 (삽입/삭제 모두).

- [ ] **Step 3: 커밋**

Run:
```bash
cd ~/Projects/kanban-task-engine
git add docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
git commit -m "$(cat <<'EOF'
docs: control-plane spec을 신규 스키마 규약으로 정합화

vibe-coding 1차 dogfood를 위한 design과 충돌하던 필드명/본문 섹션/id 스킴을
authoritative spec에 흡수. 주요 변경:

- §8 스키마 전면 교체: type/epic/created/updated, VC-###/OC-###/... per-space
  idPrefix, 본문 4섹션(목적/컨텍스트/AC/실행 힌트) + Epic 전용 4섹션
  (목표/범위/성공 지표/하위 티켓), 신규 optional 필드(working_dir/merge_into/
  run_count/depends_on)
- §6.2 vault 트리에 space별 _epics/ 와 boards/<space>-epics.md 추가
- §11.1/§11.2 claude-code-executor의 worktree 실행·approve·abort·retry
  의미론 명시 (ff-only, fetch-origin-first, retry=force-discard, worktree는
  작업 대상 repo의 .worktrees/kanban/<id>/ 내부 고정)
- §12 Home flow 8단계를 worktree 기반 실행으로 구체화
- §14 Work Mode 본문 섹션 참조 갱신
- §15 Registry 각 space에 idPrefix/epics/epicBoard 필드 추가

후속 Plan 2(스키마 코드 마이그레이션), Plan 3(실행 계층 구현)의 단일 정본.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 커밋 검증**

Run:
```bash
cd ~/Projects/kanban-task-engine && git log -1 --stat
```
Expected: 최신 커밋이 `docs: control-plane spec을 신규 스키마 규약으로 정합화` 메시지로 1 file changed.

---

## Task 10: vibe-coding spec 재분류 — "space profile"로 축약

**Files:**
- Modify: `~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md`
- Commit in: `~/.openclaw/workspace/`

이 문서는 이제 authoritative spec 위에 "vibe-coding space를 어떻게 dogfood로 띄우는지"만을 담는다. 엔진-보편 규약(필드명, 상태 머신, worktree 의미론 등)은 authoritative로 이전됐으므로 중복 제거.

- [ ] **Step 1: 현재 파일 내용 Read**

Run: `Read ~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md`
확인 목적: 교체 대상 파일의 현재 헤더와 구조를 Task 실행자가 한 번 본다.

- [ ] **Step 2: 파일 전체를 space profile 형태로 교체**

Write `~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md` with the following content (전체 대체):

```markdown
# vibe-coding Space Profile

- **Date**: 2026-04-23 (정합화 2026-04-23)
- **Authoritative engine spec**: `~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`
- **Status**: vibe-coding은 칸반 엔진의 1차 dogfood space.

이 문서는 vibe-coding space에 한정된 운영 프로파일이다. 필드 스키마·상태 머신·worktree 실행·approve/abort/retry 의미론 등 엔진-보편 규약은 authoritative spec을 따른다. 여기서는 vibe-coding에만 해당하는 선택들과 첫 dogfood 계획만 다룬다.

## 1. Space 정의

- registry.yaml의 `spaces.vibe-coding`:
  - `type: container`
  - `idPrefix: VC`
  - `projects`: `ai-cli-orch-wrapper`, `cc-openclaw-harness`, `flow-weaver`, `kanban-task-engine` (authoritative §15 참조)
- `issues/vibe-coding/_epics/` — Epic 전용 폴더(프로젝트 횡단 허용)
- 메인 보드: `boards/vibe-coding.md` (6-column Obsidian Kanban)
- Epic 인덱스: `boards/vibe-coding-epics.md` (Kanban 보드가 아닌 테이블)

## 2. `working_dir` 기본 규약

- 각 project 이름은 `~/Projects/<project>/`의 심볼릭 링크 또는 실제 repo를 가리킨다(`workspace-vibe-coding/projects/` symlink 규약과 일치).
- frontmatter `working_dir`가 없으면 엔진은 `~/Projects/<project>/`를 사용한다. 필요 시 티켓별로 override.

## 3. Executor 방침

- MVP: `executor: claude-code` 단독 사용.
- OpenClaw ACP 어댑터, 파일 watcher, cron 트리거는 **후순위**. authoritative §11 module 후보에는 존재하지만 vibe-coding dogfood 단계에서는 활성화하지 않는다.

## 4. 트리거 UX

- `kanban run <id>` / `kanban next` 수동 명령만 사용.
- 보드 카드 드래그는 `status` 동기화 용도 (실행 트리거 아님).
- `module-overrides.yaml`에서 `manual-command-trigger: enabled`만 켜고 `watcher: disabled`, `openclaw-executor: disabled` 유지.

## 5. 첫 dogfood 시나리오

vibe-coding 엔진 dogfood 진입 조건:

- Plan 2(스키마 코드 마이그레이션) 완료.
- Plan 3(worktree 실행 + CLI 정렬) 완료.

진입 후 1차 seed:

1. `boards/vibe-coding.md` + `boards/vibe-coding-epics.md` 생성 (빈 6-column/빈 테이블).
2. Epic 1개 (예: `VC-001 kanban-engine dogfood 준비`) 생성.
3. 하위 task 2~3건 (예: "sample README edit", "trivial refactor", "add a test") — 각 프로젝트별 안전한 작은 변경.
4. `kanban run <id>` → worktree 생성 → Claude Code headless 실행 → REVIEW 도달 → `kanban approve` 루프를 end-to-end로 확인.
5. 실패/재시도 경로도 한 번 의도적으로 태워본다 (본문 허술한 티켓으로 READY → FAILED → retry 경로).

## 6. 레거시 정리 참고

- `workspace-vibe-coding/issues/OC-001-login-page.md`, `OC-002-api-endpoint.md` — vibe-coding 이전 규약의 샘플. Plan 2 마이그레이션 스크립트가 이들을 처리할지 삭제할지는 Plan 2에서 결정.

## 7. 이 문서의 역할 변경 이력

- 2026-04-23(초안): engine-universal 설계까지 포함하는 중복 spec으로 작성됨.
- 2026-04-23(정합화): authoritative control-plane spec이 모든 engine-universal 규약을 흡수. 본 문서는 vibe-coding-only profile로 축약.
```

- [ ] **Step 3: 결과 용량/잔재 확인**

Run:
```bash
wc -l ~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md
grep -cE 'working_dir|merge_into|run_count|depends_on|Acceptance Criteria' \
  ~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md
```
Expected: 약 50~80 라인, 엔진-보편 필드명 hit 0회 또는 authoritative 참조 문맥에서만 (본문 구조 설명은 authoritative에 있음).

---

## Task 11: vibe-coding spec 편집 커밋 (workspace repo)

**Files:**
- Commit in: `~/.openclaw/workspace/`
- Staged: `docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md`

- [ ] **Step 1: git status 확인**

Run:
```bash
cd ~/.openclaw/workspace && git status --porcelain
```
Expected: `M docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md` 한 줄.

- [ ] **Step 2: 커밋**

Run:
```bash
cd ~/.openclaw/workspace
git add docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md
git commit -m "$(cat <<'EOF'
docs: vibe-coding spec을 space profile로 축약

엔진-보편 규약(스키마/상태 머신/worktree 실행/approve·abort·retry 의미론)은
authoritative control-plane spec으로 이전 완료. 본 문서는 이제 vibe-coding
space 한정 운영 프로파일만 담는다: idPrefix=VC, container space 구성,
executor=claude-code 단독, 수동 트리거 방침, 첫 dogfood 시나리오.

Authoritative: ~/Projects/kanban-task-engine/docs/superpowers/specs/
  2026-04-23-kanban-control-plane-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 커밋 검증**

Run:
```bash
cd ~/.openclaw/workspace && git log -1 --stat
```
Expected: 최신 커밋 메시지 `docs: vibe-coding spec을 space profile로 축약`, 1 file changed, 삭제가 삽입보다 많음(축약이므로).

---

## Task 12: 교차 정합성 최종 검증

**Files:** 두 spec 파일 read-only 비교.

- [ ] **Step 1: 두 문서에서 핵심 필드명이 일치하는지 교차 grep**

Run:
```bash
echo "=== authoritative ==="
grep -cE '\btype:|\bepic:|\bcreated:|\bupdated:|working_dir|merge_into|run_count|depends_on' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
echo "=== vibe-coding profile ==="
grep -cE '\btype:|\bepic:|\bcreated:|\bupdated:|working_dir|merge_into|run_count|depends_on' \
  ~/.openclaw/workspace/docs/superpowers/specs/2026-04-23-kanban-engine-vibe-coding-design.md
```
Expected: authoritative 측은 양의 counts(§8 예시로 여러 번 등장), vibe-coding 측은 낮거나 0 (엔진-보편 내용 축약 완료).

- [ ] **Step 2: authoritative에서 구 필드명 완전 제거 확인**

Run:
```bash
grep -cE 'issueType|^## Goal\b|Implementation Tasks|issue-auth-refresh' \
  ~/Projects/kanban-task-engine/docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
```
Expected: `0`.

- [ ] **Step 3: 두 repo의 git 상태가 clean인지 확인**

Run:
```bash
cd ~/Projects/kanban-task-engine && git status --porcelain
echo "---"
cd ~/.openclaw/workspace && git status --porcelain
```
Expected:
- engine repo: untracked `test-crlf.js`, `test_write_shell.txt`만 남아 있음 (modified 없음).
- workspace repo: 빈 출력.

- [ ] **Step 4: kanban-runtime.md가 여전히 authoritative를 포인트하는지 확인**

Run:
```bash
grep -n 'kanban-control-plane-design' ~/Projects/kanban-task-engine/docs/kanban-runtime.md
```
Expected: 1 line — "The authoritative design is `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`."

- [ ] **Step 5: 완료 보고 준비**

Plan 1 완료. Plan 2(스키마 코드 마이그레이션) 착수 전 체크 포인트:

- authoritative spec에 신규 스키마가 확정됨.
- vibe-coding spec은 profile로 축약됨.
- 두 repo 모두 clean.
- 엔진 코드는 아직 구 필드명(`issueType`/`parent`/`createdAt`/`updatedAt` 등)을 사용 중이며 Plan 2에서 리네임.

이 상태를 명시적으로 사용자에게 보고하고 Plan 2 작성 진입 승인을 받는다.

---

## Self-Review

### 1. Spec coverage

설계 대비 task 매핑:

| 합의된 변경사항 | 반영 Task |
|----------------|-----------|
| `type` / `epic` / `created` / `updated` 필드명 | Task 3 (§8.1/§8.2/§8.3/§8.4) |
| `working_dir` / `merge_into` / `run_count` / `depends_on` 신규 | Task 3 (§8.4) |
| VC-### per-space 시퀀스 | Task 3 (§8 서문) + Task 7 (§15 idPrefix) |
| 본문 4섹션(목적/컨텍스트/AC/실행 힌트) | Task 3 (§8.1/§8.6/§8.7) |
| Epic 본문 섹션(목표/범위/성공 지표/하위 티켓) | Task 3 (§8.2/§8.6) |
| Epic은 필터 차원 (보드 카드 아님) | Task 2 (§6.2 설명) + Task 3 (§8.5) |
| worktree + fetch-origin + ff-only | Task 4 (§11.1/§11.2) |
| retry = force-discard | Task 4 (§11.2) |
| 8단계 Home flow의 worktree 통합 | Task 5 (§12) |
| Work Mode 섹션 참조 갱신 | Task 6 (§14) |
| 각 space의 idPrefix/epicBoard 등록 | Task 7 (§15) |
| vibe-coding spec의 space profile 재분류 | Task 10 |

모든 변경 사항이 task에 매핑됨. 엔진 코드 수정은 Plan 2 스코프로 명시 제외.

### 2. Placeholder scan

- "TBD/TODO/implement later" 없음.
- "적절한 에러 처리" 같은 모호 문구 없음 — 모든 Step이 실제 Edit/Read/Bash 명령을 포함.
- 모든 교체 대상 텍스트가 본 plan 안에 명시됨(Old/New 블록).
- "Task N과 유사하게" 없음.

### 3. Type consistency

- idPrefix enum (OC/VC/ST/WB/PS/CR)이 Task 7의 모든 space와 §8 서문의 "space-wide monotonic integer"에서 일관.
- Task 2의 디렉토리 트리에 나열된 `_epics/`, `-epics.md`가 Task 7의 registry `epics:`/`epicBoard:` 경로와 일치.
- Task 4의 worktree 경로 `<working_dir>/.worktrees/kanban/<id>/`가 Task 5의 §12 Home flow 본문과 일치.
- Task 6에서 금지된 body section 목록(`목적/컨텍스트/AC/실행 힌트/로그` + Epic의 `목표/범위/성공 지표/하위 티켓`)이 Task 3의 §8.6에서 required로 지정된 리스트와 일치.
- 커밋 메시지의 변경 요약이 실제 Task들의 편집 결과와 일치.

Self-review 이슈 없음. Plan 실행 가능.

---

## Execution Handoff

**Plan complete and saved to `~/Projects/kanban-task-engine/docs/superpowers/plans/2026-04-23-kanban-spec-reconciliation.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — task별로 fresh subagent dispatch, task 간 리뷰, 빠른 이터레이션.
2. **Inline Execution** — 이 세션에서 executing-plans로 checkpoint 단위 배치 실행.

어느 쪽으로 진행할지 지정하면 다음 스킬을 호출한다.
