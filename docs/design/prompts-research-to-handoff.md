# kanban-task-engine 문서 개선 — Design Plugin 프롬프트

아래 6개 프롬프트는 `/research-synthesis` → `/design-system` → `/ux-copy` → `/design-handoff` → `/design-critique` → `/accessibility-review` 순서로 실행합니다.

---

## 1. `/research-synthesis`

```text
/research-synthesis

목표:
kanban-task-engine를 한 페이지짜리 draw.io 시각화 문서로 만들기 위한 핵심 메시지와 정보 구조를 정리해줘.

주의:
이건 사용자 인터뷰 synthesis가 아니라 repository documentation synthesis다. 아래 문서들을 source material로 보고, 프로젝트의 목적, 동작 방식, 안전 경계(architecture invariant), 대표 유스케이스를 뽑아줘.

참고 문서:
- README.md (현재 개선된 버전)
- docs/kanban-runtime.md
- docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md
- packages/core/src/recipes/recipe-loader.ts
- packages/schema/src/issue-schema.ts
- packages/core/src/state-machine.ts

산출물:
1. 한 문장 value proposition
2. 한 페이지에 반드시 들어갈 메시지 5개
3. 아키텍처 블록 목록 (Vault/Engine/External + 내부 컴포넌트)
4. 대표 유스케이스 4개
5. 절대 표현하면 안 되는 것 (misrepresentation 방지)
```

---

## 2. `/design-system`

```text
/design-system

방금 정리한 synthesis를 바탕으로 draw.io 한 페이지 시스템 맵용 visual system을 정의해줘.

요구사항:
- A4 landscape 또는 16:9 landscape 한 페이지
- 상하 계층: 상단 = 아키텍처 개요 (Vault → Engine → External), 하단 = 3개 병렬 패널
- Vault 영역은 dashed border + 보라 계열로 표현 (별도 저장소임을 강조)
- Engine 영역은 solid border + 녹색 계열로 표현 (로직만 담당)
- External 영역은 dashed border + 파랑 계열로 표현
- "모드는 emergent", "live state 없음", "Canonical JSON = internal contract"는 주황색 callout으로 표현
- 데이터 흐름 화살표와 execution 흐름 화살표를 구분
- 각 box 안 텍스트는 1~2줄, 40자 이하

산출물:
- color palette (hex 코드 포함)
- shape rules (box, callout, panel, lane)
- icon rules (헤더 아이콘)
- typography scale (제목/라벨/본문/annotation)
- lane/boundary/callout 규칙
```

---

## 3. `/ux-copy`

```text
/ux-copy

draw.io 다이어그램 안에 들어갈 짧은 한국어/영어 문구를 작성해줘.

조건:
- package 이름, adapter 이름, CLI 명령은 영어 원문 유지
- 한 box 안 문구는 1~2줄, 너무 길면 줄임
- "Markdown = source of truth"와 "Engine repo에 live state 없음" 경계는 반드시 포함
- "모드는 recipe의 module/policy 조합으로 결정" (emergent) 짧게 표현
- "Canonical JSON은 internal contract" 명시
- Execution Loop: READY → RUNNING → REVIEW → DONE
- FAILED는 terminal 상태로 DONE과 동등하게 표현

산출물:
- 페이지 제목
- subtitle
- 상단 아키텍처 영역 label (Vault / Engine / External)
- component label (각 box 내부 텍스트)
- safety/annotation 문구 3개
- use case 패널 문구 (3개 패널 제목 + 내부 흐름)
```

---

## 4. `/design-handoff`

```text
/design-handoff

이제 draw.io 제작자가 바로 만들 수 있는 handoff를 작성해줘.

산출물:
1. 페이지 크기와 layout grid (A4 landscape 또는 16:9)
2. 각 영역의 위치 좌표 (상단 아키텍처 영역 + 하단 3개 패널)
3. 각 box의 텍스트 (ux-copy에서 정한 문구)
4. connector 방향 (데이터 흐름 vs execution 흐름)
5. color/style rule (design-system에서 정한 팔레트)
6. export 파일명
   - docs/design/kanban-task-engine-one-page-v2.drawio
   - docs/design/kanban-task-engine-one-page-v2.svg

주의:
- Home/Work 모드를 코드상 분리하지 말 것 (emergent property로만 표현)
- engine repo에 live state가 있다고 표현하지 말 것
- 구현되지 않은 future adapter를 runtime에 넣지 말 것
- Vault와 Engine의 책임을 섞지 말 것
```

---

## 5. `/design-critique`

```text
/design-critique

다음 draw.io 초안을 리뷰해줘.

리뷰 기준:
- 프로젝트 목적이 10초 안에 이해되는가?
- Vault/Engine/External 책임이 명확히 분리되어 있는가?
- "Engine repo에 live state 없음"이 눈에 띄는가?
- "모드는 emergent"가 틀리게 표현되지 않았는가 (hardcoded switch처럼 보이지 않는가)?
- Execution Loop (READY → RUNNING → REVIEW → DONE)과 FAILED terminal 상태가 모두 보이는가?
- Issue Lifecycle, Recipe→Execution, Work Scenario(Jira Export) 유스케이스가 모두 보이는가?
- 구현되지 않은 흐름을 구현된 것처럼 표현하지 않았는가?

수정 제안을 우선순위별로 정리해줘.
```

---

## 6. `/accessibility-review`

```text
/accessibility-review

한 페이지 다이어그램의 접근성을 리뷰해줘.

확인할 것:
- 작은 글씨가 너무 많지 않은가?
- 색상만으로 의미를 구분하지 않는가? (dashed/solid border + 아이콘 보완)
- red/green colorblind 환경에서도 Vault/Engine/External 구분이 되는가?
- SVG export 후에도 텍스트가 읽히는가?
- 한 페이지 PDF/PNG로 봐도 정보 구조가 유지되는가?
- README에 text alternative가 있는가?
- 모든 색상 대비가 WCAG 2.1 AA 4.5:1을 충족하는가?
```
