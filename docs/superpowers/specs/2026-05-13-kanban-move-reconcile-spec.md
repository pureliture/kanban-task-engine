# Phase 3 Kanban Move and Reconcile Spec

날짜: 2026-05-13
상태: Proposed
저장소: `~/Projects/kanban-task-engine`
Phase: 3 of `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`

## 1. 목적

Phase 3는 issue frontmatter status를 안전하게 변경하는 mutation layer를 완성한다. `kanban move`는 CLI에서 명시적으로 status를 바꾸고, `kanban reconcile-board`는 Obsidian Kanban board에서 사람이 이동한 card를 검증한 뒤 issue frontmatter에 반영한다.

이 phase가 끝나도 source of truth는 `issues/**/*.md`다. `boards/**/*.md`는 사람이 조작할 수 있는 projection이며, board 변경은 `reconcile-board --apply`가 stale/duplicate/transition checks를 통과할 때만 source of truth에 반영된다.

## 2. 사용한 하네스와 근거

| Harness | Phase 3 사용 방식 |
| --- | --- |
| `architecture` | Board movement를 직접 truth로 승격하지 않는 ADR과 mutation boundary를 고정한다. |
| `system-design` | Registry issue lookup, shared move service, board parser, diff/apply flow를 분리한다. |
| `testing-strategy` | State machine, stale conflict, duplicate card, CLI disposable-vault integration, docs gates를 분리한다. |
| `documentation` | `docs/kanban-runtime.md`에 move/reconcile 운영 contract와 smoke path를 추가한다. |
| `deploy-checklist` | 배포 전 mutation dry-run/apply smoke와 rollback trigger를 정의한다. |
| `tech-debt` | Phase 2 board scanning과 Phase 3 mutation scanning의 중복을 shared helper로 줄인다. |
| `context7` | Obsidian Kanban 조회를 시도했으나 quota 초과로 실패했다. Phase 3는 Phase 2에서 생성한 metadata comment를 primary contract로 삼아 외부 parser drift를 최소화한다. |
| `superpowers:test-driven-development` | Production code 전에 failing test를 작성한다. |
| `superpowers:subagent-driven-development` | 구현 task는 독립 write scope를 가진 workers에게 분배할 수 있게 설계한다. |
| `superpowers:verification-before-completion` | 완료 주장은 fresh verification output 뒤에만 한다. |

## 3. 범위

### 포함

- `kanban move <issue-id> <status> [--reason <text>] [--dry-run]`.
- Registry-aware issue id lookup across configured issue roots.
- Shared status mutation service that validates `@kanban-task-engine/schema` status and `StateMachine` transitions.
- `kanban reconcile-board --space <space> [--dry-run|--apply]`.
- Board parser for Phase 2 generated card metadata comments.
- Dry-run proposal output with issue id, source file, old status, proposed status, board lane, and reason.
- Apply mode that reuses the same move validation and write path as `kanban move`.
- Fail-closed handling for stale checksum, stale recorded status, unknown issue id, duplicate cards, invalid lanes, and untracked human-created cards.
- Disposable vault runtime smoke for `new -> board --write -> move -> board edit -> reconcile --dry-run -> reconcile --apply`.

### 제외

- Creating a new issue from a manually-added board card.
- Deleting an issue when a board card is removed.
- Automatically executing agents from a board movement.
- Mutating live `workspace-kanban` without explicit operator approval.
- A custom Obsidian plugin.
- Reordering cards as source-of-truth priority changes.

## 4. ADR

### ADR-001: Issue frontmatter mutation은 하나의 shared move service가 담당한다

**Decision:** `kanban move`와 `reconcile-board --apply`는 동일한 core move service를 호출한다.

**Rationale:** 두 command가 status validation, state-machine checks, frontmatter serialization, log append, and dry-run formatting을 따로 구현하면 board-originated movement와 CLI movement의 safety contract가 갈라진다.

**Consequence:** Reconcile apply는 board parser/diff만 소유하고, 실제 mutation은 shared service로 위임한다.

### ADR-002: Reconcile parser는 card text가 아니라 generated metadata comment를 primary key로 쓴다

**Decision:** Board card identity는 `<!-- kanban-task-engine:id=... status=... checksum=... source=... generatedAt=... -->` comment에서 읽는다. Wikilink와 visible title은 사람 UX용이며 parser의 source of truth가 아니다.

**Rationale:** Obsidian에서 card title, alias, visual text는 사람이 쉽게 바꿀 수 있다. Phase 2가 생성한 metadata comment는 issue id, recorded status, checksum, source path를 안정적으로 담는다.

**Consequence:** Metadata가 없는 task-list card는 MVP에서 issue create가 아니라 conflict로 보고한다.

### ADR-003: Board file은 stale-safe proposal queue다

**Decision:** Board lane status와 current issue status가 다르면 proposal로 본다. 단, recorded status와 recorded checksum이 current issue projection과 일치하지 않으면 stale conflict로 실패한다.

**Rationale:** Issue가 board generation 이후 CLI나 agent에 의해 바뀌었는데 오래된 board movement를 적용하면 data loss가 생긴다.

**Consequence:** Operator는 stale conflict 발생 시 `kanban board --write --space <space>`로 board를 regenerate한 뒤 다시 이동해야 한다.

### ADR-004: Apply mode는 partial success를 피한다

**Decision:** `reconcile-board --apply`는 모든 proposals가 valid일 때만 writes를 수행한다. 하나라도 duplicate, stale, illegal transition, unknown issue conflict가 있으면 아무 issue도 쓰지 않는다.

**Rationale:** Board movement는 사람이 한 번에 여러 card를 움직일 수 있다. 일부만 적용하면 board와 issue state가 더 헷갈린다.

**Consequence:** Apply 전에 dry-run과 같은 conflict matrix를 계산하고, zero-conflict일 때만 mutation batch를 시작한다.

### ADR-005: Epic movement는 strict allowlist를 둔다

**Decision:** `type: epic` issue는 Phase 3에서 `READY`, `RUNNING`, `REVIEW`, `FAILED`로 이동할 수 없다. `TODO`와 `DONE`만 허용 여부를 명시적으로 테스트한다.

**Rationale:** Epic은 task execution lifecycle과 다르다. Epic을 RUNNING/FAILED로 이동시키면 agent runtime state와 섞인다.

**Consequence:** Epic lifecycle 확장은 별도 spec에서 다룬다.

## 5. System Design

### 5.1 Data flow: `kanban move`

```text
CLI args
  -> parse issue id, target status, reason, dry-run
  -> load registry.yaml through vault-contained resolver
  -> list issue files from configured issue roots
  -> locate exactly one issue by frontmatter id
  -> parse issue markdown and frontmatter
  -> validate target status and transition
  -> dry-run patch or atomic frontmatter write
  -> append issue log entry
  -> print old status, new status, and issue path
```

### 5.2 Data flow: `kanban reconcile-board`

```text
registry space
  -> resolve boards/<space>.md
  -> parse headings as board lanes
  -> parse task-list cards and metadata comments
  -> locate current issue frontmatter for each metadata id
  -> recompute board projection checksum from current issue fields
  -> produce proposals where lane status differs from current status
  -> fail conflicts before write
  -> apply all proposals through shared move service
```

### 5.3 File responsibility

| File | Responsibility |
| --- | --- |
| `packages/core/src/issues/registry-issue-source.ts` | Shared registry-aware issue file listing, issue id lookup, and issue projection conversion used by board projection and movement. |
| `packages/core/src/movement/issue-mover.ts` | Shared dry-run/apply status mutation service. |
| `packages/core/src/boards/reconcile-board.ts` | Board parser, conflict detection, proposal generation, and apply orchestration. |
| `packages/core/src/boards/board-projection.ts` | Reuse shared issue source helper instead of owning private scanning logic. |
| `packages/core/src/store/write-back.ts` | Reuse or narrow frontmatter write helpers; do not add broad unsafe field mutation. |
| `packages/core/src/index.ts` | Export Phase 3 public APIs. |
| `packages/cli/src/commands/move.ts` | CLI surface for shared move service. |
| `packages/cli/src/commands/reconcile-board.ts` | CLI surface for dry-run/apply reconciliation. |
| `packages/cli/src/index.ts` | Register `move` and `reconcile-board`; update help text. |
| `packages/core/tests/registry-issue-source.test.ts` | Shared issue source tests. |
| `packages/core/tests/issue-mover.test.ts` | Move service unit/integration tests. |
| `packages/core/tests/reconcile-board.test.ts` | Board parser, proposal, conflict, and apply tests. |
| `packages/cli/tests/move-reconcile.test.ts` | CLI disposable-vault integration tests. |
| `docs/kanban-runtime.md` | Operator contract and smoke steps. |
| `docs/deploy-checklist.md` | Mutation deploy checklist. |

## 6. CLI Contract

### 6.1 `kanban move`

```bash
kanban move <issue-id> <status> [--reason <text>] [--dry-run]
```

Success output:

```text
would move VC-001 TODO -> READY: issues/vibe-coding/kanban-task-engine/VC-001-example.md
```

or:

```text
moved VC-001 TODO -> READY: issues/vibe-coding/kanban-task-engine/VC-001-example.md
```

Failure output examples:

```text
Unknown issue id: VC-999
Invalid issue status: STARTED
Invalid transition: READY -> DONE for issue VC-001
Epic status movement is not allowed: VC-100 -> RUNNING
```

### 6.2 `kanban reconcile-board`

```bash
kanban reconcile-board --space <space> [--dry-run]
kanban reconcile-board --space <space> --apply
```

Dry-run is the default when neither `--dry-run` nor `--apply` is provided.

No-change output:

```text
no board changes for vibe-coding
```

Proposal output:

```text
board changes for vibe-coding:
- VC-001 TODO -> READY from boards/vibe-coding.md
```

Apply output:

```text
applied board changes for vibe-coding:
- moved VC-001 TODO -> READY: issues/vibe-coding/kanban-task-engine/VC-001-example.md
```

Conflict output:

```text
board reconciliation failed for vibe-coding:
- stale card VC-001: recorded status TODO, current status READY
- duplicate card VC-002 appears 2 times
- unmanaged card in READY lane is missing kanban-task-engine metadata
```

## 7. Conflict Matrix

| Condition | Dry-run result | Apply result |
| --- | --- | --- |
| Board file missing | Fail | Fail before write |
| Invalid lane heading status | Fail | Fail before write |
| Task-list card missing metadata | Conflict | Fail before write |
| Metadata id is unknown | Conflict | Fail before write |
| Metadata id appears more than once | Conflict | Fail before write |
| Metadata source is outside vault | Conflict | Fail before write |
| Recorded status differs from current issue status | Stale conflict | Fail before write |
| Recorded checksum differs from recomputed projection checksum | Stale conflict | Fail before write |
| Board lane equals current status | No proposal | No write for that card |
| Board lane differs and transition is legal | Proposal | Apply through move service |
| Board lane differs and transition is illegal | Conflict | Fail before write |
| Epic moves to `READY`, `RUNNING`, `REVIEW`, or `FAILED` | Conflict | Fail before write |
| Removed card for existing issue | Ignored in MVP | No deletion |

## 8. Testing Strategy

### Unit tests

- `registry-issue-source` rejects path traversal, symlink escapes, duplicate ids, and invalid frontmatter.
- `issue-mover` accepts legal transitions and rejects illegal transitions before write.
- `reconcile-board` parses Phase 2 generated board markdown and detects exact proposals.
- `reconcile-board` fails stale checksum/status conflicts.
- `reconcile-board --apply` proves all-or-nothing behavior by checking no issue changed when any conflict exists.

### CLI integration tests

- `move --dry-run` prints proposed patch and leaves file unchanged.
- `move` writes `status`, `updated`, `completed` for `DONE`, and appends a log entry.
- `reconcile-board --dry-run` reads a modified board file and prints proposals.
- `reconcile-board --apply` writes issue frontmatter only for legal proposal batches.
- `reconcile-board --apply` refuses stale board files after the issue was changed outside the board.

### Runtime smoke

Use a disposable vault only:

```bash
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js new --space vibe-coding --project kanban-task-engine "Move smoke"
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --space vibe-coding
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js move VC-001 READY
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --space vibe-coding
# edit boards/vibe-coding.md by moving VC-001 under RUNNING
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js reconcile-board --space vibe-coding --dry-run
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js reconcile-board --space vibe-coding --apply
```

Expected result:

- `move` updates the issue note, not the generated board.
- `board --write` regenerates the board from source issues.
- `reconcile-board --dry-run` reports the board movement as a proposal.
- `reconcile-board --apply` updates issue frontmatter only after all conflicts are clear.

## 9. Documentation and Deploy Contract

- `docs/kanban-runtime.md` must distinguish CLI mutation, generated projection, and board reconciliation.
- `docs/deploy-checklist.md` must include a disposable-vault mutation smoke before release.
- PR summary must separate unit/integration tests, disposable runtime smoke, Obsidian GUI smoke, and live vault mutation status.
- Rollback is a git revert for engine code plus restoring issue files from the disposable/live vault backup used during smoke. Generated board files can be regenerated from issue frontmatter.

## 10. Acceptance Gate

Required before Phase 3 completion claim:

```bash
pnpm --filter @kanban-task-engine/schema test -- tests/status.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/state-machine.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/registry-issue-source.test.ts tests/issue-mover.test.ts tests/reconcile-board.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/move-reconcile.test.ts
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm docs:verify
pnpm eval:hardening
```

Runtime acceptance:

- Disposable vault `move` mutates issue frontmatter.
- Disposable vault `reconcile-board --dry-run` reports exact diff after a board lane edit.
- Disposable vault `reconcile-board --apply` mutates issue frontmatter and can be followed by `board --write`.
- Stale board conflict is demonstrated by changing the issue after board generation and before reconcile.
- No live vault mutation is claimed unless separately approved and logged.
