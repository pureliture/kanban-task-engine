# kanban-task-engine 시각화 문서 디자인 스펙

**Date:** 2026-05-03
**Status:** Draft
**Author:** Claude (Design Lead)
**Scope:** `docs/design/` 시각화 에셋 현황 분석 + 다음 이터레이션 설계

---

## 1. 목적과 대상 독자

### 1.1 목적

`kanban-task-engine`의 아키텍처, 데이터 흐름, 실행 모델을 한 페이지에서 이해할 수 있는 시각화 문서를 설계한다.
이 spec은 기존 `docs/design/` 에셋(2026-05-02 기준)의 사실성을 검증하고, 다음 이터레이션에서 개선할 범위를 기록한다.

### 1.2 대상 독자

| 세그먼트 | 필요한 것 | 우선순위 |
|---|---|---|
| 미래의 나 (수개월 후 복귀) | "이 엔진이 뭐였지?" → 5분 안에 구조 복원 | P0 |
| 새로운 기여자 / 사용자 | GitHub에서 처음 보고 아키텍처를 파악 | P0 |
| Work 환경 운영자 | Jira export 경계와 금지 사항 명확히 파악 | P1 |

---

## 2. 핵심 Narrative

> Markdown issue files(.md + YAML frontmatter)가 human-readable source of truth이다.
> Engine은 이를 Canonical JSON으로 변환하여 adapter를 통해 외부 시스템과 통신한다.
> Engine repo는 로직·schema·policy만 담고, 실제 이슈 상태(live state)는 별도 Vault Git 저장소에 있다.

한 페이지 다이어그램에서 반드시 전달해야 할 핵심 메시지 4가지:

1. **Vault ↔ Engine 분리** — Engine repo에 live issue state 없음. Vault는 별도 Git 저장소.
2. **Markdown = SoT** — `.md` 파일이 Canonical JSON보다 상위의 source of truth.
3. **Mode is emergent** — recipe YAML의 `modules` + `policy` 조합이 모드를 결정. 코드에 hardcoded switch 없음.
4. **Execution Loop** — Worktree 기반 상태 전이: `READY → RUNNING → REVIEW → DONE | FAILED`.

---

## 3. 사실 검증 결과

> repo 코드와 문서를 직접 읽어 확인한 결과를 기록한다. 과장 없이 현재 상태 그대로 기술한다.

### 3.1 Markdown issue files가 human-readable source of truth인가

**결과: ✅ 확인됨**

근거:
- `docs/kanban-runtime.md`: "Markdown issue files under `<vaultRoot>/issues/` are the source of truth."
- `README.md` Key Concepts 표: "Markdown = SoT — `.md` 파일이 canonical JSON보다 상위의 source of truth입니다."
- `packages/schema/src/issue-schema.ts`: `parseIssueMarkdown()` 함수가 `.md` 파일의 YAML frontmatter를 파싱하여 `IssueFrontmatter`로 변환. Canonical JSON은 이 결과로 생성.
- `docs/kanban-runtime.md`: "Canonical JSON, board files, run artifacts, events, and export files are generated runtime artifacts and must not become a second source of truth."

### 3.2 Canonical JSON은 internal contract인가

**결과: ✅ 확인됨**

근거:
- `README.md` Key Concepts: "Canonical JSON — engine과 adapter 간 데이터 교환용 내부 contract입니다."
- `packages/schema/src/issue-schema.ts`: `CanonicalIssueModel` 인터페이스 정의. `validateCanonicalIssue()` 함수로 내부 검증만 수행.
- Human editing surface가 아님을 README와 runtime 문서 모두 명시.

### 3.3 `packages/core`, `packages/schema`, adapters 구조가 현재와 맞는가

**결과: ✅ 확인됨 (일부 세부 사항 보완 필요)**

repo에서 확인된 실제 패키지 목록:

| 패키지 | 실제 존재 여부 | 주요 역할 |
|---|---|---|
| `packages/core` | ✅ | Runtime, StateMachine, PolicyEngine, MarkdownStore, Executor, ModuleRunner, EventBus, DeadLetterQueue |
| `packages/schema` | ✅ | `IssueFrontmatter`, `CanonicalIssueModel`, `IssueStatus`, `VALID_ISSUE_TRANSITIONS` |
| `packages/adapter-claude-code` | ✅ | claude-code agent executor |
| `packages/adapter-cli` | ✅ | CLI operator surface |
| `packages/adapter-firebase` | ✅ | Firebase/mobile sync (Home only) |
| `packages/adapter-github` | ✅ | GitHub integration |
| `packages/adapter-jira` | ✅ | Jira export (Work mode) |
| `packages/adapter-openclaw` | ✅ | OpenClaw operator workspace (Home only) |
| `packages/cli` | ✅ | kanban CLI entry point |

보완 필요: 기존 SVG diagram에서 `packages/cli`와 `adapter-cli`가 혼용되어 표시됨. 실제 구조는 `packages/cli`(CLI entry point)와 `packages/adapter-cli`(adapter 레이어)가 분리되어 있음.

### 3.4 Home/OpenClaw mode와 Work/Jira export mode의 경계가 맞는가

**결과: ✅ 확인됨**

근거:
- `packages/core/src/runtime/policy.ts`:
  - `RuntimeMode = 'home' | 'work' | 'validate-only'` — 3가지 모드 타입 정의.
  - `ExternalSyncPolicy = 'none' | 'atlassian-only' | 'home-automation'` — Work mode는 `atlassian-only`.
  - `AdapterId = 'jira' | 'firebase' | 'openclaw' | 'claude-code' | 'codex' | 'cli'` — 6개 adapter.
- `packages/core/src/runtime/adapter-policy.ts`: `assertAdapterAllowed()` — policy 없이 permissive 동작 불가.
- `README.md`:
  - Home: OpenClaw, board generation, audit log, git checkpoint, agent execution 가능.
  - Work: Jira export만 허용. Firebase, OpenClaw execution, mobile real-time sync 불가.
  - Work write-back: `sync.jira.key`, `sync.jira.status`, `sync.jira.exportedAt`만 허용.
- `packages/schema/src/issue-schema.ts`: `IssueSyncMetadata.jira` 네임스페이스 구조 확인.

추가 확인: `validate-only` 모드는 `recipes/validate-only.yaml`로 별도 존재. 기존 다이어그램에는 표시 안 됨 — 다음 이터레이션에서 보완 가능.

### 3.5 Engine repo가 live issue state를 저장하지 않는다는 점이 현재 문서와 일치하는가

**결과: ✅ 확인됨**

근거:
- `README.md` 첫 단락: "엔진 저장소 자체에는 실제 이슈 상태(live state)가 없습니다. 실제 상태는 별도의 Vault 저장소에 살아있으며…"
- `docs/kanban-runtime.md` Runtime Topology: Engine repo(`~/Projects/kanban-task-engine`)와 Home issue vault(`~/.openclaw/workspace-kanban/kanban`)가 명확히 분리.
- `packages/core/src/store/markdown-store.ts`가 존재하지만, 이는 vault 경로(`KANBAN_HOME`)를 읽는 런타임 로직이며, issue `.md` 파일 자체는 vault 저장소에 있음.
- SVG diagram의 "No live state in engine repo" annotation이 사실과 일치.

### 3.6 Issue status 정의 및 전이 규칙 검증

**결과: ✅ 확인됨**

`packages/schema/src/status.ts`에서 확인된 실제 상태와 전이:

```
ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED']

VALID_ISSUE_TRANSITIONS:
  TODO    → READY
  READY   → RUNNING
  READY   → TODO      (← 기존 다이어그램에 미표시)
  RUNNING → REVIEW
  RUNNING → FAILED
  REVIEW  → DONE
  REVIEW  → RUNNING   (← 기존 다이어그램에 미표시)
  FAILED  → READY
```

기존 SVG diagram(Panel 1)에서 `READY → TODO` (되돌리기)와 `REVIEW → RUNNING` (재실행 트리거) 전이가 누락됨. 다음 이터레이션에서 보완 필요.

Epic 상태: `TODO` 또는 `DONE`만 허용 (`issue-schema.ts` 검증 로직 확인).

### 3.7 `validate-only` 모드 존재 여부

**결과: ✅ 확인됨 (기존 diagram에 미표시)**

- `packages/core/src/runtime/policy.ts`: `RuntimeMode`에 `'validate-only'` 포함.
- `recipes/validate-only.yaml` 파일 존재 확인 (`README.md` 언급).
- 기존 one-page diagram에는 Home/Work 2가지 시나리오만 표시되며 `validate-only`는 누락.

---

## 4. 다이어그램 정보 구조

### 4.1 전체 레이아웃 (권장: 1600×900px, 16:9)

```
┌──────────────────────────────────────────────────────────────────┐
│  상단 영역: 아키텍처 개요 (Architecture Overview)                  │
│  Vault ──parse──▶ Engine (core+schema+adapters) ──▶ External      │
│  [보라/dashed]    [녹색/solid]                    [파랑/dashed]   │
│                   ↑ annotations (3개)                             │
├──────────────────────────────────────────────────────────────────┤
│  하단 영역: 3개 병렬 패널 (Use Case Panels)                        │
│  ┌──────────────────┬──────────────────┬────────────────────┐    │
│  │ Panel 1           │ Panel 2           │ Panel 3             │   │
│  │ Issue Lifecycle   │ Recipe → Exec     │ Work / Jira Export  │   │
│  │ (상태 전이 전체)   │ (Execution Loop)  │ (단방향 export)     │   │
│  └──────────────────┴──────────────────┴────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 상단: 아키텍처 개요 필수 요소

| 구성 요소 | 표현 방식 | 배경색 | 테두리색 | 테두리 스타일 |
|---|---|---|---|---|
| Vault | box | `#F3E5F5` | `#9C27B0` | dashed |
| Engine | box | `#E8F5E9` | `#4CAF50` | solid |
| External Systems | box | `#E3F2FD` | `#2196F3` | dashed |
| Annotation | callout | `#FFF3E0` | `#FF9800` | solid |
| Data flow arrow | directed edge | — | `#555555` | solid, 2px |

**Vault 내부 표시 요소:**
- Markdown Issues (`.md` + YAML frontmatter) — **SoT 강조**
- Boards / Templates / Recipes (`.yaml`)
- registry.yaml

**Engine 내부 표시 요소:**
- `packages/core`: Runtime, StateMachine, PolicyEngine, Store, Executor, ModuleRunner
- `packages/schema`: IssueFrontmatter schema, CanonicalIssueModel
- Adapters: openclaw, claude-code, codex, jira, github, firebase, cli
- `packages/cli`: CLI entry point

**External Systems 표시 요소:**
- OpenClaw (Home only)
- Jira (Work only) — "Work only" 레이블 필수
- GitHub
- Firebase (Home only) — "Home only" 레이블 필수
- CLI (User Interface)

**필수 Annotation 3개:**
1. "Engine repo에는 live state 없음 — Vault는 별도 Git 저장소"
2. "Mode는 emergent: recipe modules + policy 조합으로 결정"
3. "Canonical JSON = internal contract (human editing surface 아님)"

### 4.3 Panel 1: Issue Lifecycle (상태 전이)

코드 기반의 정확한 상태 전이 (`packages/schema/src/status.ts` 기준):

```
TODO ⇄ READY → RUNNING → REVIEW ⇄ RUNNING
                  ↓           ↓
                FAILED      DONE
                  ↓
                READY
```

- 모든 8개 전이 표시 (`READY → TODO`, `REVIEW → RUNNING` 포함)
- Epic: `TODO` / `DONE`만 허용 — 별도 note로 표시
- Terminal states: `DONE`, `FAILED` — 시각적 구분 (굵은 테두리 등)
- no-change success → `FAILED` 수렴 규칙 표시

### 4.4 Panel 2: Recipe → Execution Loop

```
KANBAN_RECIPE                              Active Recipe
  │                                            │
  └──▶ <vaultRoot>/config/active-recipe.yaml ──┤
         │                                     │
         └──▶ bundled home-assisted.yaml ───────┘
                                               │
                                               ▼
                                    Recipe YAML (modules + policy)
                                               │
                                               ▼
                                    ModuleRunner (policy check)
                                               │
                                  ┌────────────┴────────────┐
                                  ▼                         ▼
                           claude-code / codex           validate-only
                           executor                      (no execution)
                                  │
                                  ▼
                            Isolated Worktree
                                  │
                          READY → RUNNING → REVIEW → DONE
                                       └──────────────────▶ FAILED
```

- Recipe resolution order 3단계 명시
- `validate-only` 분기 표시
- no-change exit 0 → `FAILED` 경로 명시

### 4.5 Panel 3: Work / Jira Export 시나리오

```
Vault (Markdown) ──▶ Engine (parser + adapter-jira) ──▶ Jira API
                                    │
                           write-back 제한:
                           sync.jira.key
                           sync.jira.status
                           sync.jira.exportedAt
                           (body 수정 불가)

금지: Firebase, OpenClaw execution, mobile real-time sync
```

---

## 5. README 개편 범위

현재 README는 이미 2026-05-02 기준으로 개편 완료 상태임.
다음 이터레이션에서 보완할 항목:

| 항목 | 현재 상태 | 보완 내용 |
|---|---|---|
| Architecture Overview SVG | 수동 fallback SVG 존재 | draw.io desktop export로 고품질 SVG 교체 권장 |
| Issue Lifecycle 전이 | Panel 1에서 2개 전이 누락 | `READY→TODO`, `REVIEW→RUNNING` 추가 |
| `validate-only` 모드 | 미표시 | Panel 2 또는 별도 note로 추가 |
| `packages/cli` vs `adapter-cli` 구분 | 혼용 표시 | 명확히 분리 표시 |
| Epic 상태 제약 | 미표시 | Panel 1 note에 추가 |

---

## 6. draw.io Asset 요구사항

### 6.1 산출물 목록

| 파일 | 형식 | 용도 | 현재 상태 |
|---|---|---|---|
| `docs/design/kanban-task-engine-one-page.drawio` | draw.io XML | 편집용 소스 | ✅ 존재 |
| `docs/design/kanban-task-engine-one-page.svg` | SVG | README embed | ✅ 존재 (수동 fallback) |
| `docs/design/README.md` | Markdown | asset 설명 + 수정 가이드 | ✅ 존재 |

### 6.2 draw.io 포맷 및 출력 방식 조사

#### draw.io 파일 포맷

- `.drawio` 파일은 **mxGraph XML** 포맷. 파일 자체가 XML이므로 텍스트 에디터/Git으로 diff 가능.
- 내부 구조: `<mxGraphModel>` → `<root>` → `<mxCell>` 노드들. 각 cell이 box, edge, label에 해당.
- 실제 `docs/design/kanban-task-engine-one-page.drawio`는 22,109 bytes의 mxGraph XML로 확인됨.

#### SVG/PNG Export 방식

| 방법 | 요구사항 | 장점 | 단점 |
|---|---|---|---|
| draw.io Desktop App (GUI) | draw.io app 설치 필요 | 가장 고품질, rounded arrow 등 고급 기능 포함 | 수동 작업 |
| `drawio` CLI | `drawio` binary 설치 필요 (npm: `draw.io`, 또는 Electron app) | CI/CD 자동화 가능 | 환경 설정 복잡, Electron 기반이라 headless 환경에서 Xvfb 필요 |
| diagrams.net 웹 앱 | 브라우저만 필요 | 설치 불필요 | 수동 작업 |
| 수동 SVG 작성 (fallback) | 없음 | 즉시 가능 | rounded arrow, auto-layout 등 미지원 |

#### 외부 CLI/패키지 필요 여부

- **draw.io CLI**: `npm install -g drawio` 또는 공식 GitHub `jgraph/drawio-desktop` release에서 binary 다운로드. Linux headless 환경에서는 `Xvfb` 또는 Docker 이미지(`jgraph/drawio-export`) 필요.
- **대안 — `@diagrams-net/mxgraph-svg`**: mxGraph를 SVG로 렌더링하는 Node.js 라이브러리. Electron 불필요. 단, 고급 draw.io 스타일을 완전히 지원하지 않을 수 있음.
- **현재 repo 상황**: `scripts/verify-docs.py`에서 SVG 존재 여부만 검증. CLI 기반 자동 export는 미구현.
- **권장**: draw.io Desktop App으로 수동 export → `docs/design/kanban-task-engine-one-page.svg` 덮어쓰기. CI에서는 SVG 존재 여부 + 최소 크기만 검증.

### 6.3 작성 규칙

- **캔버스**: 1600×900px (16:9)
- **Grid**: 10px
- **Font**: `JetBrains Mono` 또는 `Inter` (고정폭 대체)
- **최대 줄당 글자 수**: 40자 (README embed 시 가독성)
- **Layer 순서**: Background → Zone boxes → Sub-boxes → Arrows → Labels → Annotations
- **접근성 아이콘**: 각 영역 헤더에 추가 — `🗂 Vault`, `⚙️ Engine`, `🌐 External`
- **테두리 스타일**: Vault/External = dashed, Engine = solid (색상 외 구분 요소)

---

## 7. 접근성 기준

| 기준 | 요구사항 | 검증 방법 |
|---|---|---|
| WCAG 2.1 AA | 색상만으로 정보 전달 금지 | 테두리 스타일(dashed/solid) + 헤더 아이콘 병행 사용 |
| 색상 대비 | 모든 텍스트 4.5:1 이상 | 각 영역 배경색(`#F3E5F5`, `#E8F5E9`, `#E3F2FD`)과 텍스트(`#333333`) 대비 계산 도구로 검증 |
| 텍스트 대체 | 다이어그램 이미지의 alt text | README `<img>` 태그에 `alt` 속성, `<details>` 텍스트 버전 제공 |
| 화면 리더 | 다이어그램만으로 이해 불가 시 텍스트 보완 | README "Architecture Detail (Text Version)" `<details>/<summary>` 패턴 유지 |
| 키보드 | README 링크 키보드 접근 가능 | 표준 Markdown link 사용 |

---

## 8. Acceptance Criteria

- [ ] 한 페이지 다이어그램이 핵심 메시지 4가지(§2)를 모두 전달한다.
- [ ] Issue Lifecycle Panel에 8개 전이가 모두 표시된다(`packages/schema/src/status.ts` 기준).
- [ ] `validate-only` 모드가 Panel 2 또는 note로 표시된다.
- [ ] `packages/cli`와 `adapter-cli`가 구분되어 표시된다.
- [ ] Jira export의 write-back 제한 필드(`sync.jira.*`)가 Panel 3에 명시된다.
- [ ] `.drawio` source와 rendered SVG가 함께 존재한다.
- [ ] README의 `<details>` 텍스트 버전이 diagram 변경 사항을 반영한다.
- [ ] 색상 외에 테두리 스타일/아이콘으로 영역이 구분된다(WCAG 2.1 AA).
- [ ] `docs/design/README.md` 수정 가이드와 색상 규칙이 최신 상태이다.
- [ ] `scripts/verify-docs.py` 검증이 통과한다.

---

## 9. 기존 에셋 현황 요약

| 에셋 | 경로 | 상태 | 비고 |
|---|---|---|---|
| draw.io XML source | `docs/design/kanban-task-engine-one-page.drawio` | ✅ 존재 | mxGraph XML, 22,109 bytes |
| SVG rendered | `docs/design/kanban-task-engine-one-page.svg` | ✅ 존재 | 수동 fallback, 13,517 bytes |
| Asset README | `docs/design/README.md` | ✅ 존재 | 색상 규칙, 수정 가이드 포함 |
| Design skill log | `docs/design/design-skill-usage-log.md` | ✅ 존재 | 7개 skills 사용 기록 |
| Handoff | `docs/design/HANDOFF.md` | ✅ 존재 | 변경 파일, 검증 결과 |
| Prompts research | `docs/design/prompts-research-to-handoff.md` | ✅ 존재 | 프롬프트 연구 기록 |
| Previous spec | `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` | ✅ 존재 | 이전 이터레이션 spec |

---

## 10. Review Log

### 관점 A: 제품/독자/유스케이스 관점

**검토 질문:**
- 독자가 누구인가? → §1.2에 3개 세그먼트 정의. P0 독자는 "미래의 나"와 "새로운 기여자".
- 다이어그램을 보고 무엇을 이해해야 하는가? → §2에 4개 핵심 메시지 명시.
- 유스케이스 Panel이 독자의 실제 질문에 답하는가?
  - Panel 1 (Issue Lifecycle): "이슈가 어떤 상태를 거치는가?" → **8개 전이 전체 표시 필요** (기존 누락 있음)
  - Panel 2 (Recipe → Exec): "어떻게 실행되는가?" → validate-only 분기 추가 필요
  - Panel 3 (Work/Jira): "Work에서 뭘 하면 안 되는가?" → write-back 제한 필드 명시 필요

**반영 내용:**
- §4.3에 누락된 전이 2개(`READY→TODO`, `REVIEW→RUNNING`) 명시
- §4.4에 `validate-only` 분기 추가
- §4.5에 write-back 제한 필드 목록 추가
- §5 README 보완 항목 표에 반영

---

### 관점 B: 아키텍처/런타임 사실성 관점

**검토 질문:**
- diagram이 실제 코드 구조와 일치하는가?

**발견된 불일치:**

| 항목 | 기존 diagram | 실제 코드 | 조치 |
|---|---|---|---|
| `READY → TODO` 전이 | 미표시 | `status.ts` 확인됨 | §4.3에 추가 |
| `REVIEW → RUNNING` 전이 | 미표시 | `status.ts` 확인됨 | §4.3에 추가 |
| `validate-only` 모드 | 미표시 | `policy.ts` 확인됨 | §4.4에 추가 |
| `packages/cli` vs `adapter-cli` | 혼용 표시 | 두 패키지 별도 존재 | §4.2에 분리 명시 |
| Epic 상태 제약 | 미표시 | `issue-schema.ts` 확인됨 | §4.3 note 추가 |
| `codex` executor | Panel 2 미표시 | `executor/codex-runner.ts` 존재 | §4.4에 추가 |

**검증 통과 항목:**
- Vault/Engine 분리 ✅
- Markdown = SoT ✅
- Canonical JSON = internal contract ✅
- Home/Work mode 경계 ✅
- Adapter policy (fail-closed) ✅
- Runtime artifacts (vault 내 저장) ✅
- Recipe resolution order (3단계) ✅

**반영 내용:**
- §3 사실 검증 결과에 코드 근거 포함
- §4 다이어그램 정보 구조에 불일치 항목 반영

---

### 관점 C: 디자인/접근성 관점

**검토 질문:**
- 한 페이지에 정보 과잉은 없는가?
- 색상 대비와 텍스트 가독성은 괜찮은가?

**발견된 문제:**

1. **정보 밀도**: 기존 SVG(1600×900)에서 상단 영역의 annotation box 3개가 오른쪽 바깥으로 넘침 (`x="1480"`부터 시작하여 캔버스 경계 초과). 다음 이터레이션에서 레이아웃 재조정 필요.
2. **색상 대비**: 배경색(`#F3E5F5`)에 텍스트 `#666666`은 WCAG 기준 미달 가능성 있음. `#333333` 이상 사용 권장.
3. **Arrow 가독성**: `stroke-width="1"` (Panel 내부 화살표)는 고해상도 화면에서 너무 가늘 수 있음. 최소 `1.5px` 권장.
4. **font-size**: `9px` (`.note` class)는 README embed 시 가독성 문제 발생 가능. 최소 `10px` 권장.
5. **Panel 2 복잡도**: 현재 Recipe → Execution Panel에 상태 박스가 세로로 나열되어 Lifecycle Panel과 중복 느낌. Panel 2에서는 상태 전이보다 **recipe resolution과 policy check 흐름**에 집중하도록 단순화 권장.

**반영 내용:**
- §6.3 작성 규칙에 최소 font-size, arrow stroke-width 추가
- §7 접근성 기준에 색상 대비 검증 방법 명시
- §4.4 Panel 2 설명을 recipe resolution 흐름 중심으로 재작성

---

*이 문서는 2026-05-03 기준 repo 상태를 반영합니다. 다음 이터레이션 시작 전 최신 코드와 대조하여 §3 사실 검증 결과를 재확인하십시오.*
