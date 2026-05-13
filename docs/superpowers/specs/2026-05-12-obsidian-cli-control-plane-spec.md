# Obsidian CLI Control Plane Spec

날짜: 2026-05-12
상태: Proposed
저장소: `~/Projects/kanban-task-engine`

## 1. 목적

이 문서는 `kanban-task-engine`을 사람이 실제로 쓸 수 있는 Markdown-first Kanban control plane으로 만들기 위한 정본 runtime contract다. 목표는 `kanban new`, `kanban normalize`, `kanban board --write`, `kanban move`, `kanban reconcile-board`, Obsidian smoke, Codex/OpenClaw E2E의 요구사항을 implementation plan보다 먼저 고정하는 것이다.

이 문서는 다음 문서를 대체하지 않고 확장한다.

- `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`: vault layout, Home/Work control-plane 배경.
- `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`: schema, policy, execution, adapter hardening의 최신 정본.
- `docs/kanban-runtime.md`: operator runtime guide.
- `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`: 이 spec을 실행 단계로 나누는 상위 계획.

## 2. 문제 정의

현재 엔진은 schema, lifecycle, agent execution의 일부를 제공하지만, 사람이 Obsidian과 CLI만으로 issue lifecycle을 시작하고 운영하는 authoring surface가 부족하다.

확인된 gap:

- `kanban new`가 없어 사람이 ID와 기본 frontmatter를 직접 채워야 한다.
- `kanban normalize`가 없어 rough note를 정식 issue 형태로 승격하는 deterministic path가 없다.
- `kanban board --write`가 없어 Obsidian Kanban/Dataview projection을 vault에 쓰는 UX가 약하다.
- `kanban move`가 없어 안전한 status mutation을 CLI로 직접 수행할 수 없다.
- `kanban reconcile-board`가 없어 Obsidian Kanban board drag/drop 결과를 issue frontmatter로 반영할지 검증할 방법이 없다.
- Obsidian plugin runtime에서 사람이 실제로 쓸 수 있는지 smoke-tested되지 않았다.

## 3. 목표

1. LLM 없이도 ticket 생성, ID 채번, frontmatter 기본값, status 변경, board projection, board reconciliation이 동작한다.
2. Markdown issue file을 유일한 source of truth로 유지한다.
3. Obsidian Kanban/Dataview는 사람이 쓰는 UX projection으로 제공한다.
4. Obsidian board 변경은 자동 truth가 아니라 `reconcile-board`의 dry-run/apply gate를 통과해야 issue frontmatter에 반영된다.
5. CLI mutation은 registry, schema, state machine, vault path safety를 통과한 뒤에만 write한다.
6. Codex/OpenClaw agent execution은 authoring/board/move/reconcile이 검증된 뒤 별도 E2E phase에서 확인한다.

## 4. 범위 제외

- Custom Obsidian plugin을 만들지 않는다.
- Obsidian board drag/drop이 agent execution을 자동으로 시작하게 하지 않는다.
- Dataview를 source of truth로 만들지 않는다.
- generated board 파일을 canonical state로 취급하지 않는다.
- LLM을 `new`, `normalize`, `board --write`, `move`, `reconcile-board`의 필수 의존성으로 추가하지 않는다.
- Jira, Firebase, OpenClaw adapter policy를 이 spec에서 새로 설계하지 않는다. 해당 계약은 2026-05-02 hardening spec을 따른다.

## 5. 정본 결정

### ADR-001: `kanban new`는 ticket 생성 명령이다

**Decision:** `kanban new`는 board 생성이 아니라 Markdown issue/ticket 생성 명령이다.

**Consequences:**

- ID 채번, 기본 frontmatter, body section scaffold, registry path resolution은 `kanban new` 책임이다.
- board 파일 생성은 `kanban board --write` 책임이다.

### ADR-002: `kanban new`는 write-by-default, `--dry-run`은 preview다

**Decision:** `kanban new`는 명령 이름 그대로 issue file을 생성한다. 단, `--dry-run`은 파일을 쓰지 않고 target path와 Markdown preview를 출력한다.

**Rationale:** `new`는 operator authoring UX의 시작점이다. write를 기본으로 하지 않으면 사람이 다시 파일을 복사해야 하며, LLM-free control plane 목표와 어긋난다.

**Safety:** write는 반드시 `KANBAN_HOME` 또는 명시 vault, registry space/project, path containment, no-overwrite check를 통과해야 한다.

### ADR-003: `normalize`는 의미를 발명하지 않는다

**Decision:** `kanban normalize`는 rough note를 정식 issue shape로 보정하지만, 목적/acceptance criteria/실행 힌트의 의미를 새로 발명하지 않는다.

**Consequences:**

- rough note에 없는 의미 정보는 명시적인 placeholder와 warning으로 남긴다.
- placeholder가 남은 machine-executed issue는 `READY` 전환 또는 execution preflight에서 차단된다.
- LLM authoring assistant는 이후 별도 기능으로 붙을 수 있지만, deterministic normalize의 필수 조건이 아니다.

### ADR-004: Obsidian board는 editable projection이다

**Decision:** Obsidian Kanban board는 사람이 읽고 움직일 수 있는 projection이다. 단, board 파일 자체는 source of truth가 아니며 `reconcile-board --apply`가 성공해야 issue frontmatter가 바뀐다.

**Consequences:**

- `board --write`는 issue frontmatter에서 board를 생성한다.
- 사람이 board에서 card를 이동하면 그 변경은 pending proposal이다.
- `reconcile-board --dry-run`은 proposal diff를 보여준다.
- `reconcile-board --apply`는 state machine과 conflict checks를 통과한 proposal만 적용한다.

## 6. Runtime Topology

```text
~/Projects/kanban-task-engine/
  Engine, schema, core services, CLI, tests, docs.
  Live issue state is not stored here.

~/.openclaw/workspace-kanban/
  Home operator workspace.

~/.openclaw/workspace-kanban/kanban/
  Home Markdown issue vault.
  Issues, boards, runtime artifacts, and events live here.
```

Source-of-truth hierarchy:

1. `issues/**/*.md`: authoritative human-readable issue state.
2. Canonical JSON: generated contract artifact.
3. `boards/**/*.md`: generated Obsidian projection and optional pending proposal source.
4. `runs/**`, `events/**`: runtime evidence.

## 7. Data Model Contract

### 7.1 Required issue frontmatter

`kanban new` and `kanban normalize --write` must ensure these fields exist:

```yaml
id: VC-001
title: Example title
type: task
status: TODO
priority: P2
executor: human
project: kanban-task-engine
created: "2026-05-12T00:00:00.000Z"
updated: "2026-05-12T00:00:00.000Z"
```

Optional fields may include:

```yaml
assignee: ""
labels: []
epic: ""
depends_on: []
due_date: ""
working_dir: ""
merge_into: ""
automation:
  policy_id: default
  onEnter: []
  allowedActions: []
```

### 7.2 Required task body sections

Generated or normalized task-like issues must include:

```markdown
# <title>

## 목적

## 컨텍스트

## Acceptance Criteria

## 실행 힌트

## 로그
```

If `normalize` lacks semantic content for a required section, it must insert an explicit placeholder line:

```markdown
<!-- kanban:placeholder reason="missing-section-content" -->
- 작성 필요
```

Machine execution readiness must treat this placeholder as a blocker even though the Markdown shape is formalized.

### 7.3 ID allocation

ID allocation must:

- load `<vaultRoot>/registry.yaml`,
- resolve the target space,
- use the target space `idPrefix`,
- scan existing issue and epic files under that space,
- choose `max(existing sequence) + 1`,
- format with at least three digits,
- write atomically with no overwrite,
- retry or fail safely if a concurrent file creation wins the same id.

Container spaces require `--project <project>`. Single spaces do not.

### 7.4 File naming

New files use:

```text
<id>-<slugified-title>.md
```

The full path is resolved from registry, not from user-provided raw paths:

```text
issues/<space>/<project>/<id>-<slug>.md
issues/<space>/<id>-<slug>.md
```

The resolver must reject path traversal, absolute paths, unsafe issue ids, and writes outside `vaultRoot`.

## 8. CLI Contract

All commands use `KANBAN_HOME=<vaultRoot>` by default and may support a repo-standard explicit vault option if the existing CLI context exposes it. Commands must fail closed when no vault is configured.

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
--label <label>              repeatable
--assignee <name>
--working-dir <path>
--merge-into <branch>
--dry-run
--json
```

Default behavior:

- writes one new issue file,
- status defaults to `TODO`,
- type defaults to `task`,
- priority defaults to `P2`,
- executor defaults to `human`,
- created/updated use the current timestamp,
- stdout prints issue id and relative path.

Failure behavior:

- unknown space fails before write,
- missing project for container space fails before write,
- invalid project fails before write,
- invalid title fails before write,
- unsafe target path fails before write,
- existing target file fails before write.

### 8.2 `kanban normalize`

Usage:

```bash
kanban normalize <path> --check
kanban normalize <path> --write --space <space> [--project <project>]
```

Default behavior:

- `--check` reads the file and reports whether it can be normalized without writing.
- `--write` rewrites the file into formal issue shape.
- If the file has an id, preserve it after validation.
- If the file has no id, allocate one using `--space` and optional `--project`.
- If the file has no title, derive the title from first heading or filename.
- If required semantic sections are missing, insert explicit placeholders and emit warnings.

Failure behavior:

- invalid existing id fails before write,
- path outside vault fails before write,
- ambiguous target space/project fails before write,
- `--write` refuses to overwrite unrelated frontmatter keys unless they are preserved or explicitly mapped.

### 8.3 `kanban board`

Usage:

```bash
kanban board [--space <space>] [--all]
kanban board --write [--space <space>|--all]
```

Default behavior:

- without `--write`, print the requested board markdown to stdout,
- with `--write`, write generated board and index files under registry-defined `boards/` paths.

Obsidian Kanban board output:

```markdown
---
kanban-plugin: board
kanban-task-engine:
  generatedAt: "2026-05-12T00:00:00.000Z"
  space: vibe-coding
---

## TODO

- [ ] [[issues/vibe-coding/kanban-task-engine/VC-001-example|VC-001 Example]] <!-- kanban-task-engine:id=VC-001 status=TODO checksum=<checksum> -->
```

Renderer requirements:

- include one lane for each normalized status,
- exclude `type: epic` from the main board,
- use links to source issue notes,
- include stable issue id metadata for reconciliation,
- include enough generated metadata to detect stale reconciliation,
- preserve a generated-file warning.

Dataview index output must provide a table/list over issue frontmatter fields:

```dataview
TABLE status, priority, project, epic, updated
FROM "issues/vibe-coding"
WHERE type != "epic"
SORT status ASC, priority ASC, updated DESC
```

### 8.4 `kanban move`

Usage:

```bash
kanban move <issue-id> <status> [--reason <text>] [--dry-run]
```

Default behavior:

- loads the issue by id,
- validates the target status,
- validates the transition through the shared state machine,
- updates issue frontmatter status and `updated`,
- appends a log entry,
- sets `completed` only when moving to `DONE`,
- prints old status, new status, and file path.

Failure behavior:

- unknown issue fails before write,
- illegal transition fails before write,
- moving an epic into `READY`, `RUNNING`, `REVIEW`, or `FAILED` fails before write,
- `--dry-run` prints the proposed patch and writes nothing.

### 8.5 `kanban reconcile-board`

Usage:

```bash
kanban reconcile-board --space <space> --dry-run
kanban reconcile-board --space <space> --apply
```

Default behavior:

- dry-run is the default if neither `--dry-run` nor `--apply` is provided,
- parses the registry board file for the target space,
- extracts issue id, board lane status, recorded status, and recorded checksum from card metadata,
- compares board lane status with current issue frontmatter status,
- reports proposed status changes.

Apply behavior:

- applies only proposed status changes that pass the same checks as `kanban move`,
- refuses stale cards when recorded status/checksum does not match current issue state,
- refuses ambiguous duplicate cards,
- refuses cards without issue id metadata,
- does not create or delete issues from board card additions/removals in the MVP.

## 9. Obsidian Contract

### 9.1 Kanban plugin

Generated board files must be compatible with the Obsidian Kanban plugin's markdown-backed board model:

- frontmatter includes `kanban-plugin: board`,
- lanes are markdown headings,
- cards are markdown task list items,
- linked issue pages remain the durable editing surface.

### 9.2 Dataview

Generated index files must use frontmatter-queryable fields only. Dataview output is read-only from the engine perspective; editing Dataview output is not a mutation path.

### 9.3 Human workflow

Supported human flows:

1. Create issue through CLI, edit details in Obsidian issue note, regenerate board.
2. Create rough note in Obsidian, normalize through CLI, edit details, regenerate board.
3. Move issue through CLI with `kanban move`.
4. Move card in Obsidian Kanban, run `reconcile-board --dry-run`, then `--apply` if the diff is correct.

Unsupported in MVP:

- creating an issue by adding a new card directly to the generated board,
- deleting an issue by deleting a card,
- automatic execution from card movement,
- custom Obsidian plugin commands.

## 10. Acceptance Levels

Each implementation report must label evidence using these levels:

| Level | Required evidence |
| --- | --- |
| Code-level green | Relevant unit/integration tests pass. |
| Disposable vault green | CLI commands mutate a temporary vault correctly. |
| Live-adjacent vault green | Commands work against an approved real-layout vault without production-risk mutation. |
| Obsidian file-shape green | Generated markdown matches plugin/query syntax and can be parsed by tests. |
| Obsidian GUI green | Obsidian displays generated Kanban/Dataview views. |
| Agent E2E green | Codex/OpenClaw execution runs through issue lifecycle and artifacts. |

No phase may claim runtime completion from code-level tests alone.

## 11. Test Strategy

Required test coverage:

- unit tests for ID allocation and file naming,
- unit tests for issue factory defaults,
- unit tests for normalize placeholder behavior,
- unit tests for Obsidian Kanban renderer,
- unit tests for Dataview index renderer,
- unit tests for board parser and reconciliation diff,
- CLI integration tests using temporary vaults,
- state-machine tests for `move` and `reconcile-board --apply`,
- docs verification for runbook and command examples,
- optional GUI smoke through `computer-use`.

Minimum verification before implementation phase completion:

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm docs:verify
git diff --check
```

Production runtime readiness additionally requires:

```bash
pnpm eval:hardening
pnpm eval:hardening -- --strict-architecture
pnpm eval:superpowers
```

## 12. Phase Ordering

Implementation must follow this order:

1. `kanban new` and `kanban normalize`.
2. `kanban board --write` and Dataview projection.
3. `kanban move` and `kanban reconcile-board`.
4. Obsidian file-shape and GUI smoke.
5. Codex/OpenClaw agent E2E.

The Phase 1 child plan must not be created until this spec is reviewed and accepted or explicitly amended.

## 13. Open Questions

These must be answered before implementation, either by updating this spec or by recording a child-plan decision:

1. Should `normalize --write` preserve the rough note path, or move/rename it into the registry-derived canonical issue path when allocating a new id?
2. Should generated board cards use Obsidian wikilinks exclusively, or markdown links plus metadata comments for maximum parser stability?
3. Should placeholder-bearing issues be blocked through schema validation, a readiness validator, or both?
4. Should `kanban move` allow operator override for unusual transitions, or should all non-state-machine moves require manual frontmatter edits in MVP?
