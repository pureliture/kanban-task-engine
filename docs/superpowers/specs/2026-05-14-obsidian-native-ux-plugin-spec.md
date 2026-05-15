# Phase 3 Obsidian-native UX Plugin Spec

날짜: 2026-05-14
상태: Accepted
저장소: `~/Projects/kanban-task-engine`
상위 결정: `docs/design/phase-3-obsidian-native-ux.html`

## 1. 목적

이 문서는 Phase 3 범위인 `kanban-task-engine` repo-local Obsidian companion plugin의 정본 spec이다. 목표는 사람이 매일 쓰는 UX를 CLI에서 Obsidian으로 옮기되, Markdown issue vault를 source of truth로 유지하고, 기존 CLI/Core runtime contract를 깨지 않는 것이다.

이 문서는 spec이다. implementation plan은 이 문서가 검토 및 고정된 뒤 별도로 작성한다.

## 2. 조사 근거

Context7는 2026-05-14 현재 월간 quota 초과로 조회가 불가능했다. 따라서 아래 공식 문서와 repo 최신 `origin/main` worktree를 기준으로 작성했다.

| 근거 | 확인 내용 | Spec 반영 |
| --- | --- | --- |
| [Obsidian Developer Docs](https://docs.obsidian.md/) | Obsidian plugin/theme 공식 개발 문서의 entry point. | Phase 3는 Obsidian plugin으로 구현한다. |
| [Build a plugin](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin) | plugin은 TypeScript API를 사용하며, 개발은 main vault가 아닌 별도 vault에서 해야 한다. sample plugin, `manifest.json`, reload 흐름을 안내한다. | dev/test는 disposable vault에서 수행한다. |
| [Vault](https://docs.obsidian.md/Plugins/Vault) | Vault는 Obsidian vault 파일 작업 API이며, write는 `Vault.modify()`, content 기반 변경은 `Vault.process()`를 사용한다. `Vault.process()`는 read/write 사이 변경 손실을 피하기 위해 선호된다. | plugin은 vault 파일을 직접 `fs`로 쓰지 않고 `ObsidianVaultPort`로 감싼 Vault API를 사용한다. |
| [Obsidian API README](https://github.com/obsidianmd/obsidian-api/blob/master/README.md) | plugin structure는 `manifest.json`, `main.js`, default `Plugin` subclass이고, `App`은 `Vault`, `Workspace`, `MetadataCache`를 제공한다. `Plugin`은 `addCommand`, `addRibbonIcon`, `addSettingTab`, `loadData/saveData` 등을 제공한다. | command palette, ribbon, setting tab, plugin data 저장을 spec에 포함한다. |
| [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | sample plugin은 TypeScript, `manifest.json`, `main.ts`, esbuild bundle, `addCommand`, `Modal`, settings tab 예제를 제공한다. | `packages/obsidian-plugin` scaffold와 build 산출물 형태를 정의한다. |
| [Obsidian CLI](https://obsidian.md/help/cli) | Obsidian CLI는 plugin command 실행, plugin reload, screenshot, dev console/error 확인을 제공하며 Obsidian 1.12 installer가 필요하다. | E2E 검증은 Obsidian CLI developer commands를 사용할 수 있지만, product UX 자체는 CLI에 의존하지 않는다. |
| `origin/main` code surface | `core`는 board projection/reconcile exports를 제공하고, CLI는 `new`, `normalize`, `board`, `move`, `reconcile-board`를 facade로 제공한다. | Phase 3는 CLI shell-out이 아니라 core use-case 재사용 방향으로 설계한다. |

## 3. 문제 정의

Phase 2까지는 다음 runtime loop가 검증되었다.

```text
kanban new
  -> kanban board --write
  -> Obsidian Kanban board render
  -> Obsidian GUI card move
  -> reconcile-board --dry-run
  -> reconcile-board --apply
  -> board --write
```

하지만 이 loop는 사람이 매일 쓰기에는 불편하다. 사용자는 Obsidian에서 작업을 보고, 만들고, 이동하고, 승인한다. 따라서 다음 gap이 남아 있다.

- 새 task를 만들 때 사람이 CLI로 이동하지 않아야 한다.
- rough note/card를 canonical issue로 승격하는 UX가 Obsidian 안에 있어야 한다.
- board move diff와 apply가 terminal output이 아니라 Obsidian modal에서 확인되어야 한다.
- `board --write` 재생성이 사용자가 이해 가능한 `Sync Board` 작업이어야 한다.
- GitHub/Jira 같은 외부 adapter가 붙을 때, publish/sync/conflict approval의 human control surface가 Obsidian 안에 있어야 한다.

## 4. 목표

1. 사람은 Obsidian 안에서 title 중심으로 task를 만들 수 있다.
2. 사람은 Obsidian 안에서 rough note를 canonical issue로 승격할 수 있다.
3. 사람은 Obsidian Kanban board에서 card를 이동한 뒤, Obsidian 안에서 diff를 preview하고 apply할 수 있다.
4. issue frontmatter가 source of truth라는 Phase 2 contract를 유지한다.
5. board/index는 generated projection으로 남긴다.
6. plugin은 repo-local companion plugin이며, 별도 SaaS나 외부 앱이 아니다.
7. plugin은 CLI를 shell-out하지 않고 core use-case를 직접 호출한다.
8. plugin은 Obsidian Vault API를 감싼 adapter를 통해 vault 파일을 읽고 쓴다.
9. GitHub/Jira 연동은 Phase 3 MVP 범위가 아니지만, 미래 sync/publish UI가 들어올 수 있는 extension point를 남긴다.
10. plan은 이 spec이 고정된 뒤 작성한다.

## 5. 범위 제외

- GitHub issue 생성, Jira issue 생성, remote sync apply.
- OpenClaw/Codex/Claude agent execution trigger.
- Obsidian community plugin directory 제출.
- mobile Obsidian 지원. Phase 3는 desktop Obsidian 전용으로 설계하고 검증한다.
- Dataview/Bases custom view 구현.
- Kanban plugin internals patching.
- board 파일을 source of truth로 승격.
- Obsidian GUI 변경을 자동으로 issue frontmatter에 apply.
- CLI 제거 또는 기존 CLI contract 변경.

## 6. 정본 결정

### ADR-001: repo-local Obsidian companion plugin을 만든다

**Decision:** `packages/obsidian-plugin`을 추가하고, Obsidian 사용자는 이 plugin을 vault의 `.obsidian/plugins/kanban-task-engine`에 설치해 사용한다.

**Rationale:** 기존 Obsidian Kanban/Dataview plugin은 표시와 조회를 담당할 수 있지만, `kanban-task-engine` 고유 기능인 ID 채번, canonical issue 생성, normalize, reconcile preview/apply는 모른다.

**Rejected:** 별도 웹앱, 별도 SaaS, 기존 Kanban plugin fork.

### ADR-002: plugin은 CLI를 shell-out하지 않는다

**Decision:** plugin은 `node packages/cli/dist/bin.js ...`를 호출하지 않는다. 대신 core use-case를 plugin-compatible API로 추출해 직접 호출한다.

**Rationale:** shell-out은 path, environment, Node version, Obsidian cache, stderr parsing에 취약하다. 또한 Obsidian Vault API의 cache/write semantics를 우회한다.

**Consequence:** Phase 3 구현 전 core use-case extraction이 필요하다.

### ADR-003: core use-case는 IO port를 통해 파일 시스템을 추상화한다

**Decision:** CLI와 plugin이 같은 business logic을 쓰도록 `VaultPort` 계열 interface를 둔다.

```ts
interface VaultPort {
  read(path: string): Promise<string>;
  cachedRead?(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  create(path: string, content: string): Promise<void>;
  process(path: string, updater: (content: string) => string): Promise<string | void>;
  listMarkdownFiles(root?: string): Promise<string[]>;
}
```

**Adapters:**

- `NodeFsVaultPort`: CLI/runtime tests에서 사용.
- `ObsidianVaultPort`: Obsidian plugin에서 `app.vault`를 감싼다.

**Rationale:** Obsidian 공식 Vault 문서는 content 기반 변경에 `Vault.process()`를 선호한다. plugin이 Node `fs`를 직접 쓰면 Obsidian cache와 충돌할 수 있다.

### ADR-004: issue frontmatter만 authoritative state다

**Decision:** Obsidian board lane 이동은 pending proposal이다. `Apply Board Moves` command가 성공해야 issue frontmatter가 바뀐다.

**Rationale:** Phase 2에서 이미 board는 generated projection이라는 contract를 검증했다. Plugin이 들어와도 이 contract를 깨지 않는다.

### ADR-005: external adapter UX는 extension point로만 둔다

**Decision:** Phase 3 MVP는 GitHub/Jira 직접 연동을 구현하지 않는다. 다만 future command group을 위한 UI/port boundary를 침범하지 않도록 `External Sync` 영역을 명시적으로 비워 둔다.

**Future examples:**

- `Kanban: Publish Current Issue to GitHub`
- `Kanban: Link Current Issue to Jira`
- `Kanban: Preview External Sync`
- `Kanban: Apply External Sync`

### ADR-006: Phase 3는 desktop Obsidian 전용이다

**Decision:** Phase 3 MVP는 desktop Obsidian만 지원한다. Mobile Obsidian은 설계, 검증, acceptance 범위에서 제외한다.

**Rationale:** 현재 목표는 `workspace-kanban` 운영 vault에서 사람이 실제로 쓰는 desktop workflow를 완성하는 것이다. Mobile 지원까지 포함하면 plugin packaging, UI constraints, filesystem/runtime differences가 scope를 흐린다.

**Consequence:** plan은 desktop Obsidian과 Obsidian CLI 기반 E2E에 집중한다.

### ADR-007: raw card promotion은 Phase 3에 포함하되 명시적 승격만 허용한다

**Decision:** 사람이 Kanban board에서 `+ Add a card`로 만든 metadata 없는 card는 자동으로 issue가 되지 않는다. 사용자가 `Kanban Task Engine: Promote Raw Card` command를 실행하고 modal에서 확인해야 canonical issue로 승격된다.

**Rationale:** raw card는 ID, source path, checksum metadata가 없으므로 자동 승격하면 중복 생성, 잘못된 project 매핑, board-as-source-of-truth 문제가 생긴다. 하지만 Obsidian-first UX에서는 rough card 생성이 자연스럽기 때문에 명시적 승격 flow는 MVP에 포함한다.

**Consequence:** raw card promotion은 preview/confirm modal, target space/project 확인, duplicate-title warning, board regenerate를 포함해야 한다.

### ADR-008: New Task 후 기본 UX는 board에 머무른다

**Decision:** `New Task` 성공 후 기본 동작은 현재 board에 머무르는 것이다. 생성된 issue 열기는 notice/modal action 또는 settings option으로 제공한다.

**Rationale:** Obsidian Kanban UX에서는 board에서 여러 task를 빠르게 만드는 흐름이 자연스럽다. 상세 작성은 사용자가 필요할 때 issue를 열어 이어간다.

**Consequence:** default setting은 `openIssueAfterCreate: false`, `syncBoardAfterCreate: true`다.

### ADR-009: dev install은 symlink를 허용하되 official smoke/E2E는 copy install만 인정한다

**Decision:** 개발 inner loop에서는 plugin build output을 smoke vault에 symlink할 수 있다. 그러나 official smoke, E2E, acceptance evidence는 built artifacts를 vault의 `.obsidian/plugins/kanban-task-engine/`에 copy install한 상태에서만 인정한다.

**Rationale:** symlink는 빠른 개발 loop를 제공하지만 실제 설치 형태와 다르고 packaging 누락을 놓칠 수 있다. copy install은 사용자가 설치하는 형태에 가깝고 vault boundary와 artifact completeness를 더 잘 검증한다.

**Consequence:** plan은 `dev:link-plugin` 같은 optional helper와 `smoke:install-plugin` 같은 copy-based verifier를 분리해야 한다.

### ADR-010: 모든 command는 Command Palette에 등록하고, ribbon icon 하나는 안전한 menu/status panel만 연다

**Decision:** Phase 3 plugin은 모든 기능을 Obsidian Command Palette에 등록한다. 기본 ribbon icon은 하나만 노출하며, 직접 mutation을 실행하지 않고 Kanban Task Engine menu/status panel을 연다.

**Rationale:** Command Palette는 discoverability와 command automation에 좋고, ribbon icon은 사용자가 plugin의 존재를 발견하는 데 좋다. 하지만 ribbon에서 apply/sync 같은 mutation을 즉시 실행하면 실수 가능성이 커진다.

**Consequence:** `showRibbonActions` default는 `true`지만, ribbon action은 safe entrypoint only다. `Apply Board Moves`, `Promote Raw Card`, `Sync Board`는 modal/confirmation 또는 command flow를 거쳐야 한다.

## 7. 사용자 UX 계약

### 7.1 기본 원칙

- 사용자는 ID를 직접 입력하지 않는다.
- 사용자는 canonical frontmatter를 직접 작성하지 않는다.
- 사용자는 terminal diff를 읽지 않는다.
- 사용자는 Obsidian command palette, ribbon action, modal, notice로 피드백을 받는다.
- ribbon icon은 직접 write하지 않고 menu/status panel을 여는 safe entrypoint다.
- 실패는 조용히 무시하지 않고 Obsidian notice와 reviewable modal로 보여준다.

### 7.2 Command surface

| Command ID | Display name | UX | Required input | Writes |
| --- | --- | --- | --- | --- |
| `kanban-task-engine:new-task` | `Kanban Task Engine: New Task` | 제목만 입력해 새 issue 생성 후 board에 표시 | title, optional space/project/priority/executor | issue file, board/index |
| `kanban-task-engine:normalize-current-note` | `Kanban Task Engine: Normalize Current Note` | 현재 note를 canonical issue로 승격 또는 canonical target 생성 | active markdown file, optional space/project | issue file or current file |
| `kanban-task-engine:sync-current-board` | `Kanban Task Engine: Sync Current Board` | 현재 board/space projection 재생성 | active board or configured default space | board/index |
| `kanban-task-engine:preview-board-moves` | `Kanban Task Engine: Preview Board Moves` | board lane 변경을 modal diff로 표시 | active board or chosen space | none |
| `kanban-task-engine:apply-board-moves` | `Kanban Task Engine: Apply Board Moves` | preview diff 확인 뒤 issue status 반영 및 board 재생성 | confirmed diff | issue file, board/index |
| `kanban-task-engine:move-current-issue` | `Kanban Task Engine: Move Current Issue` | 현재 issue note의 status 전이 | active issue, target status | issue file, board/index optional |
| `kanban-task-engine:promote-raw-card` | `Kanban Task Engine: Promote Raw Card` | metadata 없는 board card를 확인 후 canonical issue로 승격 | selected/active raw card, space/project confirmation | issue file, board/index |

### 7.3 Modal UX

#### New Task Modal

Required:

- title text input.

Defaults from settings:

- space.
- project.
- priority.
- executor.

Optional controls:

- status, default `TODO`.
- labels.
- open created issue after create.
- sync board after create.

Success result:

- Obsidian Notice: `Created VC-001`.
- User remains on the board by default.
- Created issue can be opened through an action or by enabling the `openIssueAfterCreate` setting.
- Board card is visible after sync.

#### Promote Raw Card Modal

Must show:

- detected raw card title.
- detected lane/status.
- target space.
- target project.
- generated ID preview.
- duplicate-title warning when similar canonical issue titles already exist.

Must not:

- create an issue without user confirmation.
- delete the raw card before the regenerated board is written.
- infer acceptance criteria, executor intent, or external sync target.

#### Reconcile Preview Modal

Must show:

- issue id.
- title.
- source issue path.
- old status.
- proposed new status.
- conflict status.

Must block Apply when:

- generated metadata checksum is stale.
- source issue file is missing.
- proposed transition violates state machine.
- duplicate card/id exists in board.
- board metadata was edited by hand.

## 8. Plugin settings

Settings are stored with Obsidian plugin data (`loadData`/`saveData`), not in issue frontmatter.

```ts
interface KanbanTaskEnginePluginSettings {
  defaultSpace: string;
  defaultProject?: string;
  defaultPriority: 'P0' | 'P1' | 'P2' | 'P3';
  defaultExecutor: string;
  syncBoardAfterCreate: boolean;
  openIssueAfterCreate: boolean;
  showRibbonActions: boolean;
  requireApplyPreview: true;
}
```

Constraints:

- `requireApplyPreview` is always `true` in Phase 3.
- `openIssueAfterCreate` defaults to `false`.
- `syncBoardAfterCreate` defaults to `true`.
- `showRibbonActions` defaults to `true`, but only exposes the safe menu/status panel entrypoint.
- Settings must not store tokens, API keys, or external credentials.
- Future GitHub/Jira credentials must not be introduced through this settings object without a new security spec.

## 9. Package layout

Phase 3 introduces one package and one core use-case layer.

```text
packages/
  core/
    src/
      use-cases/
        authoring.ts
        board-sync.ts
        board-reconcile.ts
        issue-move.ts
      ports/
        vault-port.ts
        node-fs-vault-port.ts
  cli/
    src/commands/*
  obsidian-plugin/
    manifest.json
    package.json
    tsconfig.json
    esbuild.config.mjs
    src/
      main.ts
      settings.ts
      commands.ts
      vault-adapter.ts
      modals/
        new-task-modal.ts
        reconcile-preview-modal.ts
```

Rules:

- `packages/cli` remains a facade over `packages/core/use-cases`.
- `packages/obsidian-plugin` must not import CLI command handlers.
- `packages/obsidian-plugin` may import core pure/use-case APIs only if they do not require Node `fs`.
- shared markdown parsing, registry resolution, path validation, checksum, projection, and reconciliation logic stay in `core`.

## 10. Core API requirements

The plan must extract or introduce plugin-safe functions equivalent to current CLI commands.

```ts
type CreateIssueUseCase = (input: {
  vault: VaultPort;
  space: string;
  project?: string;
  title: string;
  priority?: string;
  executor?: string;
  now?: Date;
}) => Promise<{
  issueId: string;
  issuePath: string;
  boardPath?: string;
}>;

type PreviewBoardMovesUseCase = (input: {
  vault: VaultPort;
  space: string;
}) => Promise<{
  changes: BoardMoveProposal[];
  conflicts: BoardMoveConflict[];
}>;

type ApplyBoardMovesUseCase = (input: {
  vault: VaultPort;
  space: string;
  expectedChanges: BoardMoveProposal[];
}) => Promise<{
  applied: BoardMoveProposal[];
  boardPath: string;
}>;
```

API rules:

- All paths are vault-relative unless explicitly named `absolutePath`.
- Use-case functions return structured results, not formatted CLI strings.
- CLI commands own text/JSON formatting.
- Obsidian plugin owns modal/notice formatting.

## 11. Data safety and concurrency

### 11.1 Write safety

- New issue creation must fail if target path already exists.
- Issue updates must use `VaultPort.process()` where possible.
- Board regenerate may replace generated board/index files but must preserve the generated projection warning.
- No write may escape the vault root.
- Symlink escape handling remains the responsibility of the adapter and existing path validation; the plugin spec must not weaken it.

### 11.2 Obsidian cache safety

- Display-only reads may use `cachedRead`.
- Read-modify-write operations must use `read` or `process` semantics.
- Plugin must not assume `MetadataCache` is the source of truth; it can be used as an optimization or UI helper only.

### 11.3 Conflict safety

Apply must stop when:

- board projection checksum is stale.
- source issue changed since board generation.
- card was duplicated.
- generated metadata comment is missing for an existing issue move.
- transition is invalid.
- target issue path cannot be resolved through registry.

## 12. Runtime and E2E contract

### 12.1 Required local runtime

- Obsidian app with community plugins enabled.
- Desktop Obsidian only.
- Obsidian Kanban plugin installed/enabled in the smoke vault.
- Obsidian CLI available for E2E automation, when GUI verification is required.
- Disposable vault for plugin development and smoke testing.
- Official smoke/E2E must use copy-installed plugin artifacts, not symlinked source/build paths.

### 12.2 Obsidian CLI test affordances

Official Obsidian CLI supports command execution, plugin reload, screenshot, console/error inspection. Phase 3 E2E may use:

```bash
obsidian plugin:reload id=kanban-task-engine
obsidian commands filter=kanban-task-engine
obsidian command id=kanban-task-engine:new-task
obsidian dev:screenshot path=...
obsidian dev:errors
```

These commands are test harnesses. The user-facing product must work from Obsidian UI without terminal use.

## 13. Test strategy

Implementation plan must use TDD and include these tests.

| Layer | Tests |
| --- | --- |
| Core unit | use-case functions with `InMemoryVaultPort`; ID allocation, path safety, no-overwrite, normalize, board render, preview/apply conflicts. |
| Core integration | `NodeFsVaultPort` with disposable vault fixtures matching registry and issue layout. |
| CLI regression | Existing CLI commands still pass and call extracted use-cases. |
| Plugin unit | settings defaults, command registration, modal validation, vault adapter path mapping. |
| Plugin bundle | `pnpm --filter @kanban-task-engine/obsidian-plugin build` emits `main.js`, `manifest.json`, optional `styles.css`. |
| Plugin install | Copy built artifacts into disposable vault `.obsidian/plugins/kanban-task-engine/`; symlink install is dev-only and not acceptance evidence. |
| Obsidian smoke | Disposable vault install, plugin reload, command list, New Task command, board render screenshot. |
| GUI reconcile | Create issue in Obsidian, move card in Kanban UI, preview diff, apply, board regenerate, verify status alignment. |
| Raw promotion | Create a raw Kanban card, run explicit promote command, confirm modal, verify issue creation and board regeneration. |
| Docs | `pnpm test:docs`, `pnpm docs:verify`, and updated runbook/examples. |

## 14. Documentation requirements

Phase 3 implementation must update:

- `docs/design/phase-3-obsidian-native-ux.html`: status and implementation evidence.
- `docs/kanban-runtime.md`: Obsidian plugin install/use smoke.
- `docs/deploy-checklist.md`: plugin build and GUI smoke gates.
- `docs/design/README.md`: plugin UX visual doc links.
- `packages/obsidian-plugin/README.md`: local install, development, safety model.

## 15. Deploy readiness

Pre-merge gates:

- `pnpm install --frozen-lockfile`.
- `pnpm -r build`.
- `pnpm -r test`.
- `pnpm test:docs`.
- `pnpm docs:verify`.
- Plugin package build.
- Disposable vault plugin smoke.
- Obsidian GUI smoke if local Obsidian runtime is available.

Rollback triggers:

- plugin writes outside vault.
- plugin applies board move without preview.
- plugin makes board file authoritative.
- plugin uses CLI shell-out for MVP commands.
- plugin stores credentials or tokens.
- plugin silently ignores failed writes.
- plugin changes existing CLI contract.

## 16. Acceptance criteria

MVP is complete only when all of these are true.

1. User can create a task from Obsidian by entering only a title.
2. Created issue receives generated ID and required frontmatter.
3. Created task appears on the Obsidian Kanban board after sync.
4. User can normalize the current rough note from Obsidian.
5. User can move an existing generated card in Obsidian Kanban and preview the proposed status change in Obsidian.
6. User can apply the proposed move only after preview confirmation.
7. After apply and board sync, issue frontmatter, board lane, and card metadata status match.
8. CLI commands still work against the same vault.
9. Disposable vault GUI E2E passes.
10. Documentation explains that long-term GitHub/Jira integration belongs behind core/adapters, not inside plugin UI logic.
11. Raw card promotion works only through explicit user confirmation.
12. New Task keeps the user on the board by default and offers opening the issue as an option.
13. Official smoke/E2E evidence uses copy-installed plugin artifacts.
14. Ribbon icon opens only a safe menu/status panel and does not directly apply writes.

## 17. Open questions before implementation plan

All product and verification-shape decisions required before planning are now fixed.

Implementation plan may choose exact script names and UI copy, but it must preserve the decisions above.

## 18. Plan gate

Implementation plan may be generated because:

- this spec was reviewed,
- blocking corrections were applied,
- user fixed the remaining decisions on 2026-05-15.
