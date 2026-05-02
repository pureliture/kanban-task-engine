# Design Plugin Skills Usage Log

## Overview

kanban-task-engine 시각화 문서 작업에서 사용한 design plugin skills의 입력, 판단, 반영 위치를 기록합니다.

---

## 1. `/user-research`

**적용 시점:** Spec 작성 전 (Brainstorming Phase)
**입력:** "이 문서화의 주요 독자는 누구인가요?"
**판단:** 독자를 "미래의 나"와 "새로운 기여자/사용자" 두 세그먼트로 분리. 둘 다 P0 우선순위.
**반영 위치:**
- `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` 섹션 2 (대상 독자)
- README의 "What is this?" 섹션 (5분 이해 목표)

---

## 2. `/research-synthesis`

**적용 시점:** Spec 작성 중
**입력:** 기존 문서 (`docs/kanban-runtime.md`, `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`)와 코드베이스 조사 결과
**판단:** 아키텍처의 핵심 통찰 4가지를 추출 — Vault/Engine 분리, Markdown=SoT, 모드 emergent, Execution Loop
**반영 위치:**
- `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` 섹션 3 (핵심 Narrative)
- 다이어그램 annotation 3개

---

## 3. `/design-system`

**적용 시점:** 구현 전 (Plan Phase)
**입력:** "다이어그램의 색상, 폰트, 레이아웃 규칙을 정의"
**판단:**
- 영역별 색상: Vault(보라), Engine(녹색), External(파랑)
- 테두리 스타일: Vault/External=dashed, Engine=solid (색상 외 구분 요소)
- 아이콘: 각 영역 헤더에 🏠/⚙️/🌐 추가 (접근성)
- Grid 10px, 최대 40자/줄
**반영 위치:**
- `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` 섹션 6.2
- `docs/design/README.md` 색상 규칙 표
- 실제 draw.io XML의 fillColor/strokeColor 값
- 실제 SVG의 fill/stroke 값

---

## 4. `/ux-copy`

**적용 시점:** 구현 중
**입력:** "다이어그램 label, README 문구, 설명 텍스트"
**판단:**
- "Engine (Logic Only — no live state)" — live state가 없다는 점을 label에 직접 포함
- "Vault (Live Issue State — separate Git repo)" — Vault의 별도 저장소 특성 명시
- "Modes are emergent: recipe modules + policy" — emergent 개념을 한 문장으로
**반영 위치:**
- draw.io XML의 모든 box label
- SVG의 모든 text 요소
- `README.md` 섹션들
- `docs/design/README.md`

---

## 5. `/design-critique`

**적용 시점:** 리뷰 단계
**입력:** Brainstorming에서 보여준 HTML mockup
**판단:** "HTML mockup으로는 아키텍처가 한눈에 안 보임. 실제 draw.io에서는 boxes + arrows + color-coded zones로 훨씬 명확해야 함."
**반영 위치:**
- Spec의 draw.io 작성 규칙: "데이터 흐름 화살표가 중심"으로 수정
- draw.io XML에 directed edge를 중심으로 배치
- SVG에 arrow marker 추가

---

## 6. `/accessibility-review`

**적용 시점:** 리뷰 단계
**입력:** "WCAG 2.1 AA 충족 가능성"
**판단:**
- 색상만으로 정보 전달 금지 → dashed/solid border + 아이콘으로 보완
- 텍스트 대비 4.5:1 → 구현 시 검증 필요
- 복잡한 다이어그램은 text alternative 필요 → README에 "Architecture Detail (Text Version)" 섹션 추가
**반영 위치:**
- `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` 섹션 7 (접근성 기준)
- README의 `<details>/<summary>` 패턴 사용
- draw.io XML에 헤더 아이콘 추가
- SVG에 stroke-dasharray 적용

---

## 7. `/design-handoff`

**적용 시점:** 완료 단계
**입력:** 최종 산출물 정리
**판단:** "변경 파일, asset 경로, README 반영 위치, 검증 결과, follow-up만 간결하게 포함"
**반영 위치:**
- `docs/design/README.md` 수정 방법 섹션
- 이 usage log 문서 자체
- `README.md` 하단 "See docs/design/" 참조

---

## Summary

| Skill | 반영 파일 | 핵심 판단 |
|---|---|---|
| `/user-research` | spec 섹션 2, README | 독자 2 세그먼트, P0 |
| `/research-synthesis` | spec 섹션 3, 다이어그램 annotation | 4가지 핵심 통찰 |
| `/design-system` | spec 섹션 6.2, draw.io XML, SVG, docs/design/README.md | 색상/테두리/아이콘 규칙 |
| `/ux-copy` | draw.io label, SVG text, README | label에 핵심 메시지 직접 포함 |
| `/design-critique` | spec 화살표 규칙, draw.io XML, SVG | arrows 중심, HTML mockup 한계 인정 |
| `/accessibility-review` | spec 섹션 7, README, draw.io XML, SVG | WCAG 2.1 AA, text alternative |
| `/design-handoff` | docs/design/README.md, 이 로그 | 수정 방법, asset 경로 |
