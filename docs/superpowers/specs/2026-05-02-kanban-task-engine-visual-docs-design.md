# kanban-task-engine 시각화 문서 디자인 스펙

**Date:** 2026-05-02
**Status:** Draft → Pending Review
**Author:** Claude (Design Lead)
**Scope:** Root README 개선 + `docs/design/` one-page 시각화

---

## 1. 목적

`kanban-task-engine`의 목적, 동작 방식(아키텍처), 주요 유스케이스를 한 페이지에서 이해할 수 있도록 시각화 문서와 README를 설계한다.

---

## 2. 대상 독자

| 세그먼트 | 필요한 것 | 우선순위 |
|---|---|---|
| 미래의 나 (3개월 후) | "이게 뭐였지?" → 5분 안에 복원 | P0 |
| 새로운 기여자/사용자 | GitHub에서 처음 보고 아키텍처를 파악 | P0 |

---

## 3. 핵심 Narrative

> Markdown issue files가 human-readable source of truth이고, engine은 이를 canonical JSON으로 변환하여 adapter를 통해 외부 시스템과 통신한다. Engine repo는 로직만 담고, 실제 이슈 상태(live state)는 Vault에 살아있다.

핵심 메시지 (다이어그램에서 반드시 전달해야 함):

1. **Vault ↔ Engine 분리**: Engine repo에 live issue state가 없음
2. **Markdown = SoT**: `.md` 파일이 canonical JSON보다 상위
3. **"모드"는 emergent**: recipe의 `modules` + `policy` 조합으로 결정, 코드에 hardcoded switch 없음
4. **Execution Loop**: Worktree 기반 상태 전이 (READY → RUNNING → REVIEW → DONE)

---

## 4. 다이어그램 정보 구조

### 4.1 전체 레이아웃: 상하 계층

```
┌─────────────────────────────────────────────────────────────┐
│  상단: 아키텍처 개요 (Architecture Overview)                  │
│  - Vault → Engine → External 시스템 흐름                     │
│  - 데이터 흐름 화살표 중심, 영역은 색상으로 구분               │
├─────────────────────────────────────────────────────────────┤
│  하단: 3개 병렬 패널 (Use Case Panels)                       │
│  ┌──────────────┬────────────────┬─────────────────┐       │
│  │ 패널 1        │ 패널 2          │ 패널 3           │       │
│  │ 이슈 생명주기  │ Recipe →       │ Work 시나리오    │       │
│  │ (C)           │ Execution Loop │ (D)             │       │
│  │               │ (B → A)        │                 │       │
│  └──────────────┴────────────────┴─────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 상단: 아키텍처 개요

**필수 요소:**

| 구성 요소 | 표현 방식 | 색상 |
|---|---|---|
| Vault | Dashed border box | 보라 계열 (#9C27B0) |
| Engine | Solid border box | 녹색 계열 (#4CAF50) |
| External Systems | Dashed border box | 파랑 계열 (#2196F3) |
| 화살표 (데이터 흐름) | Directed edge | 검정/회색 |

**Vault 내부:**
- Markdown Issues (.md + YAML frontmatter)
- Boards & Templates
- Recipes (.yaml — mode label + modules + policy)

**Engine 내부 (서브 다이어그램, 간소하게):**
- `packages/core`: Runtime, State Machine, Policy, Store, Executor
- `packages/schema`: Frontmatter schema, Canonical JSON model
- Adapters: openclaw, claude-code, jira, cli, github

**External Systems / Interfaces:**
- 외부 서비스: OpenClaw, Jira, GitHub
- 사용자 인터페이스: CLI (`adapter-cli`는 외부 서비스가 아닌 엔진의 CLI 표면)

**주석(annotation):**
- "Engine repo에는 live state가 없음 — Vault는 별도 Git 저장소"
- "모드는 recipe의 module/policy 조합으로 결정 (emergent property)"
- "Canonical JSON은 internal contract, human editing surface 아님"
- "Markdown ↔ Canonical JSON 변환은 Engine의 Parser/Store에서 수행"

### 4.3 하단 패널

**패널 1: 이슈 생명주기 (Issue Lifecycle)**
- 생성(Template) → 파싱 → Canonical 변환 → 실행 → 완료/실패 → 보관
- 시간 순서대로 좌→우 흐름
- 핵심 상태만 표시 (DRAFT → OPEN → IN_PROGRESS → DONE | FAILED)
- FAILED는 DONE과 동일 선상의 terminal 상태로 표시

**패널 2: Recipe → Execution Loop**
- Recipe YAML (`mode` label + `modules` + `policy`) → Module Loader → Policy Check → Executor
- **Emergent Mode 시각화**: Recipe의 module/policy 조합이 "모드"를 결정함을 화살표 흐름으로 표시
- Worktree 기반: `claude-code-executor`가 별도 worktree에서 작업
- 상태 전이: READY → RUNNING → REVIEW → DONE

**패널 3: Work 시나리오 (Jira Export)**
- Vault의 Markdown → Engine → `adapter-jira` → Jira API
- One-way export (read-only from engine perspective)
- Corporate vault 분리 개념 (선택적)

---

## 5. README 개편 범위

### 5.1 현재 README 상태

현재 `README.md`는 기본적인 프로젝트 설명만 포함하고 있으며, 아키텍처 시각화가 없음.

### 5.2 개편 내용

| 섹션 | 내용 |
|---|---|
| 1. What is this? | 2-3문장으로 프로젝트 목적 설명 |
| 2. Architecture Overview | 상단 다이어그램 SVG embed + 짧은 설명 |
| 3. How it works | 하단 패널 링크 + 핵심 흐름 요약 |
| 4. Key Concepts | Vault/Engine 분리, Markdown=SoT, 모드 emergent, Canonical JSON |
| 5. Getting Started | 설치, CLI 사용법 (간단히) |
| 6. Project Structure | packages/ 구조 설명 |
| 7. Documentation | `docs/` 내부 링크 |

---

## 6. draw.io Asset 요구사항

### 6.1 산출물 목록

| 파일 | 형식 | 용도 |
|---|---|---|
| `docs/design/kanban-task-engine-one-page.drawio` | draw.io XML source | 편집용 소스 |
| `docs/design/kanban-task-engine-one-page.svg` | SVG (또는 PNG) | README embed, 브라우저 표시 |
| `docs/design/README.md` | Markdown | design asset 설명, 사용법 |

### 6.2 draw.io 작성 규칙

- **Grid**: 10px
- **Font**: JetBrains Mono 또는 Inter (고정폭 대체)
- **Colors**:
  - Vault 영역: `#F3E5F5` (배경), `#9C27B0` (테두리)
  - Engine 영역: `#E8F5E9` (배경), `#4CAF50` (테두리)
  - External 영역: `#E3F2FD` (배경), `#2196F3` (테두리)
  - Annotation: `#FFF3E0` (배경), `#FF9800` (테두리)
- **Arrow style**: rounded, 2px stroke, 방향 표시
- **Label**: 각 box 내 1-2줄, 넘치면 서브 패널로 이동. 최대 줄당 40자 제한 (README embed 시 가독성)
- **Layer**: Background → Boxes → Arrows → Labels → Annotations 순
- **Accessibility icons**: 각 영역 헤더에 아이콘 추가 (🏠 Vault, ⚙️ Engine, 🌐 External) — 색상 외 구분 요소

### 6.3 Export

- draw.io source를 직접 작성 (XML)
- SVG export: draw.io desktop app 또는 `drawio` CLI 사용
- CLI 사용 불가 시 SVG를 직접 작성 (fallback)
- PNG는 SVG를 rasterize하여 생성

---

## 7. 접근성 기준 (Accessibility Criteria)

| 기준 | 요구사항 | 검증 방법 |
|---|---|---|
| WCAG 2.1 AA | 색상만으로 정보 전달 금지 | 패널에 패턴/테두리 스타일 추가 |
| 색상 대비 | 모든 텍스트 4.5:1 이상 | 구현 시 각 영역 배경색-텍스트 대비 계산 |
| 텍스트 대체 | 이미지 내 모든 의미 요소에 alt text | README에 다이어그램 설명 추가 |
| 키보드 | README 링크가 키보드 접근 가능 | HTML `<img>`에 `alt` 속성 |
| 화면 리더 | 다이어그램만으로 이해 불가능할 때 텍스트 설명 보완 | README에 "Architecture Detail (Text Version)" 섹션 추가, `aria-describedby`로 연결 |
| 다중 감각 구분 | 색상 외에 테두리 스타일 + 아이콘으로 영역 구분 | Dashed/solid border + 헤더 아이콘 |

---

## 8. Acceptance Criteria

- [ ] 한 페이지 시각화가 목적, 아키텍처, 주요 유스케이스를 모두 보여준다.
- [ ] README만 읽어도 프로젝트가 무엇인지, 어디서 issue state가 살아있는지, engine repo가 무엇을 담당하는지 이해된다.
- [ ] `.drawio` source와 rendered asset이 함께 존재한다.
- [ ] design plugin의 7개 skills 사용 흔적과 반영 결과가 `docs/design/design-skill-usage-log.md`에 기록되어 있다.
- [ ] README와 docs 내부 링크가 깨지지 않는다.
- [ ] 다이어그램 label이 핵심 개념을 빠뜨리지 않는다.

---

## 9. Design Skills 사용 계획

| Skill | 적용 시점 | 반영 위치 |
|---|---|---|
| `/user-research` | Spec 작성 전 | 독자 세그먼트, 정보 우선순위 정의 |
| `/research-synthesis` | Spec 작성 중 | 현재 문서 조사 결과를 구조화된 insight로 정리 |
| `/design-system` | 구현 전 | 다이어그램 색상, 폰트, 레이아웃 규칙 정의 |
| `/ux-copy` | 구현 중 | 다이어그램 label, README 문구, 설명 텍스트 |
| `/design-critique` | 리뷰 단계 | 시각적 위계, 가독성, 일관성 검토 |
| `/accessibility-review` | 리뷰 단계 | WCAG 2.1 AA 기준 충족 확인 |
| `/design-handoff` | 완료 단계 | 최종 산출물 정리, 사용법 문서화 |

---

## 10. Review Log

### 10.1 Spec Review (예정)

최소 3개의 독립 리뷰 에이전트를 병렬로 사용:

- **Reviewer A**: 제품/독자/유스케이스 관점
- **Reviewer B**: 아키텍처/런타임 사실성 관점
- **Reviewer C**: 디자인/접근성/README 정보 구조 관점

모든 P0/P1 blocker는 spec에 반영한 뒤 다음 단계로 넘어간다.

### 10.2 Review Results

**Date:** 2026-05-02
**Status:** P0 blocker 없음. P1 반영 완료.

| Reviewer | 관점 | 결과 | 반영 내용 |
|---|---|---|---|
| A | 제품/독자/유스케이스 | Approve with changes | 1) Vault를 "separate Git repository"로 명시 2) Emergent Mode 화살표 흐름 강화 3) Markdown↔Canonical 변환 위치 명시 |
| B | 아키텍처/런타임 사실성 | Approve | 모든 사실 검증 통과. FAILED 상태를 Issue Lifecycle에 추가, CLI를 외부 서비스와 구분 |
| C | 디자인/접근성/README | Approve with changes | 1) 색상 대비 검증 추가 2) 아이콘/텍스트 라벨로 다중 감각 구분 3) 텍스트 오버플로우 규칙(40자 제한) 4) Long Description 패턴 |

---

## Appendix: 참고 자료

- `docs/kanban-runtime.md`: 런타임 설명
- `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`: 제어 평면 설계
- `packages/core/src/recipes/recipe-loader.ts`: Recipe 모드 검증 코드
