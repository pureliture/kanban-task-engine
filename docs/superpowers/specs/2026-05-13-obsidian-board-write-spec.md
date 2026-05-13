# Phase 2 Obsidian Board Write Spec

날짜: 2026-05-13
상태: Proposed
저장소: `~/Projects/kanban-task-engine`
Phase: 2 of `docs/superpowers/plans/2026-05-12-obsidian-cli-control-plane-umbrella-plan.md`

## 1. 목적

Phase 2는 `kanban board --write`를 실제 operator UX로 완성한다. CLI는 외부 Markdown vault의 issue frontmatter를 읽어 Obsidian Kanban plugin이 열 수 있는 board file과 Dataview가 조회할 수 있는 index file을 쓴다.

이 phase가 끝나도 source of truth는 `issues/**/*.md`다. `boards/**/*.md`는 사람이 보기 위한 generated projection이며, board drag/drop 결과를 source of truth로 반영하는 기능은 Phase 3 `reconcile-board`의 책임이다.

## 2. 사용한 하네스와 근거

| Harness | Phase 2 사용 방식 |
| --- | --- |
| `architecture` | Board file을 source of truth로 승격하지 않는 ADR을 명시한다. |
| `system-design` | Vault boundary, data flow, renderer/writer/CLI 책임을 분리한다. |
| `testing-strategy` | Renderer unit, writer integration, CLI disposable-vault smoke, docs gate를 분리한다. |
| `documentation` | `docs/kanban-runtime.md`와 `docs/deploy-checklist.md`에 board write smoke를 추가한다. |
| `deploy-checklist` | 배포 전 board projection smoke와 rollback trigger를 정의한다. |
| `tech-debt` | CLI-local board rendering 확장을 제한하고 core-owned projection service로 이동한다. |
| `context7` | 조회를 시도했으나 quota 초과로 실패했다. Fallback은 upstream `obsidian-community/obsidian-kanban` repo와 Dataview 공식 문서다. |
| `superpowers:test-driven-development` | Production code 전에 failing test를 작성한다. |
| `superpowers:subagent-driven-development` | 구현 task는 독립 write scope를 가진 subagent에게 분배할 수 있게 설계한다. |
| `superpowers:verification-before-completion` | 완료 주장은 fresh verification output 뒤에만 한다. |

## 3. 외부 문서 확인 결과

Obsidian Kanban plugin upstream은 markdown-backed board를 사용한다. Repo source에서 `frontmatterKey = 'kanban-plugin'`이고 기본 frontmatter는 `kanban-plugin: board`다. Parser는 lane을 markdown heading으로 읽고, lane 아래 markdown task list items를 card로 읽는다.

Dataview 공식 문서는 YAML frontmatter fields가 Dataview field로 자동 제공되며, DQL `TABLE`, `FROM`, `WHERE`, `SORT` 구조로 Markdown files를 조회한다고 설명한다. Phase 2는 Dataview output을 read-only projection으로만 생성한다.

## 4. 범위

### 포함

- `kanban board --write --space <space>`가 registry의 `board`와 `epicBoard` path에 파일을 쓴다.
- `kanban board --write --all`이 모든 registry space의 projection을 쓴다.
- `kanban board --space <space>`는 해당 space의 read-only board markdown을 stdout으로 출력할 수 있다.
- 기존 `kanban board` stdout behavior는 깨지지 않는다.
- Main board는 non-epic issues만 포함한다.
- Dataview index는 issue frontmatter fields를 조회한다.
- Mutating board write는 explicit `KANBAN_HOME` 없이는 실패한다.

### 제외

- Obsidian GUI 자동 실행.
- Custom Obsidian plugin.
- Board drag/drop 변경을 issue frontmatter에 반영.
- Board에서 card 추가/삭제를 issue 생성/삭제로 해석.
- Agent execution trigger.
- Live `workspace-kanban` mutation without explicit operator approval.

## 5. ADR

### ADR-001: Board projection은 core-owned pure rendering과 writer service가 담당한다

**Decision:** Obsidian Kanban renderer, Dataview renderer, projection checksum, registry-driven write orchestration은 `packages/core/src/boards/**`에 둔다. CLI command는 argument parsing과 result formatting만 담당한다.

**Rationale:** `packages/cli/src/vault.ts`에는 이미 CLI-local issue traversal과 board rendering이 있다. Phase 2에서 이를 더 키우면 Phase 3 `move`/`reconcile-board`와 동일한 issue interpretation을 맞추기 어렵다.

**Consequence:** Phase 2는 board write path부터 core service를 사용한다. 기존 run/next lifecycle이 쓰는 CLI-local loader는 이번 phase에서 전면 제거하지 않고, tech-debt로 남겨 Phase 3에서 줄인다.

### ADR-001a: Read-only stdout과 write mode는 같은 Obsidian renderer contract를 공유한다

**Decision:** `kanban board --space <space>`와 `kanban board --write --space <space>`는 같은 core Obsidian board renderer를 사용한다. 기존 bare `kanban board`의 stdout behavior는 호환성 때문에 남기되, 새 `--space` read-only path는 write mode와 같은 file-shape contract를 출력한다.

**Rationale:** `packages/cli/src/vault.ts`의 legacy renderer는 `type: kanban-board` frontmatter를 내고, Phase 2 renderer는 `kanban-plugin: board`를 내야 한다. 새 command surface가 두 renderer로 갈라지면 operator와 tests가 서로 다른 board contract를 보게 된다.

**Consequence:** Acceptance tests는 `board --space vibe-coding` stdout과 `board --write --space vibe-coding` file output이 같은 `kanban-plugin: board` renderer를 공유함을 검증한다. Legacy bare `board` renderer 제거는 Phase 3 tech-debt로 남긴다.

### ADR-002: Main board는 Obsidian Kanban file, `epicBoard`는 Dataview index file이다

**Decision:** Registry의 `board` path는 Obsidian Kanban board file로 쓴다. Registry의 `epicBoard` path는 Dataview index file로 쓴다.

**Rationale:** 기존 control-plane design은 `boards/<space>-epics.md`를 Kanban board가 아닌 table/index로 정의했다. 별도 registry field를 추가하지 않고도 Phase 2의 Dataview projection을 저장할 수 있다.

**Consequence:** `boards/<space>-epics.md`는 이름은 유지하지만 내용은 Dataview index다. 문서에는 이를 "epic/index projection"으로 명확히 적는다.

### ADR-003: Card는 issue body를 복제하지 않고 wikilink와 metadata comment만 갖는다

**Decision:** Card format은 다음 형태를 사용한다.

```markdown
- [ ] [[issues/vibe-coding/kanban-task-engine/VC-001-example|VC-001 Example]] `P0` <!-- kanban-task-engine:id=VC-001 status=READY checksum=sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd source=issues/vibe-coding/kanban-task-engine/VC-001-example.md generatedAt=2026-05-13T00:00:00.000Z -->
```

**Rationale:** Obsidian link graph와 rename UX에는 wikilink가 유리하고, reconciliation에는 stable issue id와 recorded status/checksum이 필요하다. Markdown link와 wikilink를 동시에 넣으면 card text가 복잡해지고 parser surface가 넓어진다.

**Consequence:** Phase 3 parser는 `kanban-task-engine:id=... status=... checksum=...` comment를 primary metadata로 읽는다. Wikilink path는 사람 UX용이다.

### ADR-004: Card checksum은 board projection checksum이다

**Decision:** Card metadata의 `checksum`은 `sync.checksum`이나 canonical task checksum이 아니라 Phase 2 board projection checksum이다. Input은 최소한 `id`, `title`, `type`, `status`, `priority`, `project`, `epic`, `updated`, `relativePath`를 stable stringify한 값이다. Output은 `sha256:<64-hex>` 형식이다.

**Rationale:** Existing `computeChecksum(CanonicalTaskModel)`는 sync metadata와 canonical model을 위한 checksum이다. Board reconciliation에는 issue note가 board generation 이후 바뀌었는지만 감지하면 충분하며, CLI-local/canonical model 변환 차이에 의존하면 Phase 2가 불필요하게 커진다.

**Consequence:** Phase 3 stale detection은 board projection checksum을 다시 계산해 비교한다. Later sync checksum과 이름이 충돌하지 않도록 implementation에서는 `projectionChecksum` 또는 `computeBoardProjectionChecksum` 같은 이름을 사용한다.

### ADR-005: Write mode는 invalid issue를 skip하지 않는다

**Decision:** `kanban board --write`는 대상 space에 invalid issue file이 하나라도 있으면 non-zero로 실패하고 board/index file을 쓰지 않는다. Read-only stdout mode는 기존 behavior 보존을 위해 warnings를 출력하거나 skip할 수 있지만, write mode는 source-of-truth projection 완전성을 우선한다.

**Rationale:** Board file은 generated projection이지만 사람이 workflow를 판단하는 UX다. Invalid source issue를 조용히 누락한 board를 쓰면 generated artifact가 vault state를 거짓으로 대표한다.

**Consequence:** Core projection writer는 selected issue roots를 schema/parser로 검증하고, warnings/fatal errors가 있으면 any write 전에 실패한다. 이 실패는 CLI test와 disposable vault smoke에서 검증한다.

### ADR-006: Empty lane에는 dummy card를 쓰지 않는다

**Decision:** Empty status lane은 heading만 둔다. `- No issues` 같은 placeholder list item을 쓰지 않는다.

**Rationale:** Obsidian Kanban plugin은 list item을 card로 해석한다. Placeholder card는 사람이 이동하거나 reconcile parser가 오인할 수 있다.

## 6. System Design

### 6.1 Data flow

```text
KANBAN_HOME/registry.yaml
  -> core board projection service
  -> issue roots from registry
  -> parse issue frontmatter from issues/**/*.md
  -> filter non-epic issues for board
  -> render Obsidian Kanban board
  -> render Dataview index
  -> atomic write to registry board paths
  -> CLI summary stdout
```

### 6.2 File responsibility

| File | Responsibility |
| --- | --- |
| `packages/core/src/boards/obsidian-board-renderer.ts` | Pure Obsidian Kanban markdown renderer and projection checksum. |
| `packages/core/src/boards/dataview-index-renderer.ts` | Pure Dataview DQL index renderer. |
| `packages/core/src/boards/board-projection.ts` | Registry-driven issue scanning and safe projection writes. |
| `packages/core/src/boards/board-generator.ts` | Keep existing stdout board renderer compatible; may delegate shared types/constants. |
| `packages/core/src/store/registry.ts` | Parse typed registry space paths for issue roots, `board`, and `epicBoard`; reject unsafe registry paths. |
| `packages/core/src/index.ts` | Export Phase 2 board projection API. |
| `packages/cli/src/commands/board.ts` | Parse `--write`, `--space`, `--all`; call core projection service; preserve read-only stdout. |
| `packages/cli/tests/obsidian-board.test.ts` | CLI integration and disposable vault smoke. |
| `docs/kanban-runtime.md` | Operator usage and acceptance levels. |
| `docs/deploy-checklist.md` | Deploy gate and rollback trigger updates. |

### 6.2.1 Registry path contract

Phase 2 must use the typed core registry loader, not CLI-local ad-hoc registry parsing, for write-mode projection.

Each selected registry space must expose:

- `issues` or `projects.*.path` as vault-relative issue roots,
- `board` as the vault-relative Obsidian Kanban projection target,
- `epicBoard` as the vault-relative Dataview index projection target.

All registry paths must be normalized and contained under `KANBAN_HOME`. Absolute paths, `..` traversal, empty paths, paths resolving outside the vault root, and unsafe board/index targets fail before any issue read or file write. Missing `board` or `epicBoard` for a selected space fails before write. This phase does not add migration defaults for missing board paths.

### 6.2.2 Path safety

Board writer must resolve `registry.yaml` `board` and `epicBoard` paths through a vault-contained path resolver. It must reject absolute paths, `..`, NUL bytes, path separators that escape the vault, and symlink escapes. Generated files are runtime artifacts under `KANBAN_HOME`, not engine repo files.

### 6.3 Board output contract

Main board frontmatter:

```yaml
kanban-plugin: board
kanban-task-engine:
  generatedAt: "2026-05-13T00:00:00.000Z"
  space: vibe-coding
  source: issues
```

Board body:

- starts with `<!-- GENERATED PROJECTION by kanban-task-engine. issues/**/*.md are source of truth. Moving existing cards is a pending proposal until reconcile-board --apply. Do not create/delete cards or edit kanban-task-engine metadata. -->`,
- includes exactly one `## <status>` lane for each `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`,
- renders non-epic issues sorted by priority rank then id,
- includes wikilink to the issue note without `.md` extension,
- includes exactly one terminal `kanban-task-engine` HTML comment metadata per issue card,
- comment metadata includes `id`, recorded `status`, `checksum=sha256:<64-hex>`, vault-relative `source`, and `generatedAt`,
- does not include issue body content.

Generated board files must end with one continuous Obsidian Kanban settings footer. The inner fence must be a plain triple-backtick fence with no language info string, because upstream `extractSettingsFooter()` parses the fenced body directly as JSON. `metadata-keys` must use the upstream `DataKey[]` object shape:

````markdown
%% kanban:settings
```
{"kanban-plugin":"board","metadata-keys":[{"metadataKey":"status","label":"","shouldHideLabel":false,"containsMarkdown":false},{"metadataKey":"priority","label":"","shouldHideLabel":false,"containsMarkdown":false},{"metadataKey":"project","label":"","shouldHideLabel":false,"containsMarkdown":false},{"metadataKey":"epic","label":"","shouldHideLabel":false,"containsMarkdown":false},{"metadataKey":"updated","label":"","shouldHideLabel":false,"containsMarkdown":false}]}
```
%%
````

### 6.4 Dataview index contract

Index file is plain Markdown for Dataview, not an Obsidian Kanban board. It must not include `kanban-plugin: board` frontmatter or a `%% kanban:settings` footer. It starts with the same generated warning and includes at least:

```dataview
TABLE status, priority, project, epic, updated
FROM "issues/vibe-coding"
WHERE type != "epic"
SORT status ASC, priority ASC, updated DESC
```

For spaces with `epics` path, the same file should also include an epics table:

```dataview
TABLE status, priority, updated
FROM "issues/vibe-coding/_epics"
WHERE type = "epic"
SORT updated DESC
```

## 7. CLI Contract

Usage:

```bash
kanban board
kanban board --space <space>
kanban board --write --space <space>
kanban board --write --all
```

Argument rules:

- `--write` requires exactly one of `--space <space>` or `--all`.
- `--space` requires a value.
- `--all` and `--space` together are invalid.
- `--all` without `--write` is invalid in Phase 2.
- Unknown flags fail before read/write.
- `--write` requires explicit `KANBAN_HOME`.
- Read-only `kanban board` keeps current stdout output.
- Read-only `kanban board --space <space>` prints the Obsidian board renderer output without writing.

Write stdout:

```text
wrote vibe-coding board: boards/vibe-coding.md
wrote vibe-coding index: boards/vibe-coding-epics.md
issues: 2
```

## 8. Failure Behavior

- Missing or invalid `registry.yaml` fails before write.
- Unknown space fails before write.
- Unsafe registry path fails before write.
- Absolute, traversal, NUL-containing, or symlink-escaping `board`/`epicBoard` paths fail before write.
- In write mode, issue files with invalid frontmatter or schema-invalid Markdown fail the command before any board/index write.
- In read-only stdout mode, invalid issue files may be reported as warnings while preserving current non-mutating behavior.
- The writer must render and validate every selected target before committing writes.
- File writes are atomic per target file. Cross-file writes are not claimed as filesystem-atomic.
- If one target write fails, the command exits non-zero, reports every succeeded and failed target, and a rerun must be sufficient to regenerate a consistent projection from `issues/**/*.md`.
- `--write --all` should process spaces deterministically by registry order.

## 9. Test Strategy

### Unit tests

- Obsidian renderer emits `kanban-plugin: board`.
- Renderer emits all six status lanes.
- Empty lanes do not contain dummy cards.
- Renderer excludes `type: epic`.
- Cards include wikilink, issue id, recorded status, source path, generated timestamp, and deterministic `sha256:<64-hex>` projection checksum.
- Obsidian renderer emits a continuous `%% kanban:settings` footer with plain backtick fences, no `json` fence info string, and `metadata-keys` as Obsidian Kanban `DataKey[]` objects.
- Dataview renderer emits issue and epic queries with registry paths and does not emit `kanban-plugin: board` or `%% kanban:settings`.

### Integration tests

- Core projection writer writes registry `board` and `epicBoard` paths in a temp vault.
- Core projection writer rejects unsafe, missing, absolute, traversal, NUL-containing, outside-vault, and symlink-escaping registry `issues`, `board`, and `epicBoard` paths before writing.
- Core projection writer rejects backslash and duplicate-separator registry board/index targets before writing.
- Core projection writer preserves existing board/index content when validation or path resolution fails.
- CLI `board --write --all` reports partial target write failures without claiming disposable-vault green.
- CLI `board --write --space` writes one space.
- CLI `board --write --all` writes every space.
- CLI `board --space <space>` renders only the selected space in read-only stdout mode and performs no file writes.
- CLI rejects unknown `--space` before read/write.
- CLI rejects `--all` without `--write`.
- CLI `board --space` prints the same Obsidian board contract as write mode without writing.
- CLI rejects `--write` without explicit `KANBAN_HOME`.
- CLI rejects invalid flag combinations.
- CLI/core writer rejects invalid issue frontmatter before writing any board files.
- Existing read-only `board` stdout test remains green.

### Runtime smoke

After `pnpm -r build`, run the built CLI against a disposable vault. Do not use `pnpm --filter @kanban-task-engine/cli start`; the CLI package currently has no `start` script.

```bash
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --all
```

Expected:

- `boards/<space>.md` contains `kanban-plugin: board`.
- `boards/<space>.md` contains all six status lanes.
- `boards/<space>.md` card links point to `issues/**/*.md` notes through wikilinks.
- `boards/<space>-epics.md` contains Dataview `TABLE status, priority, project, epic, updated`.

## 10. Documentation and Deploy Checklist Requirements

`docs/kanban-runtime.md` must add:

- `kanban board --write --space <space>` and `kanban board --write --all` examples using built CLI,
- explanation that board/index files are generated projections,
- warning that Phase 2 proves file-shape readiness, not Obsidian GUI readiness.

`docs/deploy-checklist.md` must add a Deploy gate:

- [ ] After `pnpm -r build`, run `KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --all`.
- [ ] Confirm generated board files contain `kanban-plugin: board`, all six status lanes, no dummy cards, and `kanban-task-engine:id=... checksum=sha256:<64-hex>` metadata.
- [ ] Confirm generated index files contain Dataview queries and remain generated projections, not source-of-truth files.

Rollback triggers must include:

- `board --write` succeeds without explicit `KANBAN_HOME`.
- `board --write` writes outside the disposable vault or follows a symlink escape.
- Generated board/index files are edited or documented as source of truth.
- Generated cards omit issue id, source path, status, or projection checksum metadata.

## 11. Tech Debt Controls

| Debt | Phase 2 handling |
| --- | --- |
| CLI-local `vault.ts` still owns lifecycle issue loading | Do not expand it for write projection; new board write service lives in core. Retire remaining duplication in Phase 3. |
| Legacy bare `kanban board` can still render `type: kanban-board` | Keep it only for backward-compatible stdout smoke. New `board --space` and all write paths must use the core Obsidian renderer. |
| Obsidian parser not yet used in tests | Phase 2 validates file shape by renderer tests. Full parser/reconcile belongs to Phase 3. |
| GUI smoke not automated | Phase 4 owns Obsidian GUI smoke. Phase 2 must not claim GUI green. |
| Dataview query can only be validated as text in CI | Accept for Phase 2; Phase 4 validates human Obsidian workflow. |
| New CLI-local vault traversal/parser temptation | Do not add new traversal/parser logic in CLI. Reuse core registry, path, parser, and projection helpers for Phase 2 write and `--space` read-only paths. |

## 12. Acceptance Levels

Phase 2 may claim:

- Code-level green, after targeted core/CLI tests pass.
- Disposable vault green, after built CLI writes projection files in a temp vault.
- Obsidian file-shape green, after generated markdown matches the plugin/query syntax in tests.

Phase 2 must not claim:

- Obsidian GUI green.
- Live-adjacent vault green.
- Agent E2E green.

## 13. Verification Commands

Targeted:

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter @kanban-task-engine/core exec vitest run tests/board-generator.test.ts tests/obsidian-board-renderer.test.ts tests/board-projection.test.ts
pnpm --filter @kanban-task-engine/cli exec vitest run tests/index.test.ts tests/obsidian-board.test.ts
pnpm -r build
KANBAN_HOME=<disposable-vault> node packages/cli/dist/bin.js board --write --all
pnpm test:docs
pnpm docs:verify
```

Full gate:

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm docs:verify
git diff --check
```
