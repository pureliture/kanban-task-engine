# Visual Docs Redesign — 설계 스펙

**Date:** 2026-05-07
**Status:** Approved
**Scope:** `docs/design/kanban-task-engine-one-page.html` 개선 + `docs/design/kanban-use-case.html` 신규

---

## 1. 목표

사람이 보는 문서와 LLM이 보는 문서를 분리한다.

- **사람용**: HTML 시각화 파일 2개 (one-page, use-case)
- **LLM용**: 기존 md 파일들 (`kanban-runtime.md`, specs 등) — 새로 만들지 않음

gray box 원칙: 색상 구역은 유지하되 패키지명·클래스명·함수명은 제거하고 역할 중심으로 표현한다.

---

## 2. 파일 범위

| 파일 | 작업 | 비고 |
|---|---|---|
| `docs/design/kanban-task-engine-one-page.html` | 개선 (in-place) | 기존 파일 덮어쓰기 |
| `docs/design/kanban-use-case.html` | 신규 생성 | Home Assisted 시나리오 |

---

## 3. one-page.html 개선 스펙

### 3.1 아키텍처 구역 (상단 row)

색상 시스템은 유지한다:
- 🟣 Vault: 보라 dashed border
- 🟢 Engine: 녹색 solid border
- 🔵 External: 파랑 dashed border

**Vault 구역** — 3개 박스:

| 박스 | 형식 | 설명 |
|---|---|---|
| Markdown Issues | `.md` | Source of Truth · 사람이 직접 읽고 쓰는 파일 |
| Boards | `.md` | 어떤 이슈가 어느 컬럼에 있는지 |
| Recipes | `.yaml` | 누가 어떤 도구로 실행할지 (예: Codex로 실행 / Jira export만) |

**Engine 구역** — 2×2 그리드:

| 박스 | 설명 |
|---|---|
| Core | 상태 전이 · 실행 루프 |
| Schema | .md ↔ JSON 계약 |
| Adapters | Jira · GitHub · Codex 연결 |
| CLI | `kanban run` 진입점 |

- 부제: "로직만 · 데이터 없음"
- flex:1 로 Vault/External 사이 공간 채움

**External 구역** — 2개 박스:

| 박스 | 설명 |
|---|---|
| Codex | Home 실행기 |
| Jira · GitHub | Work 연동 |

- 모든 텍스트에 `color:#1a1a1a` 명시 (상속 문제 방지)

### 3.2 Annotation row

2개 유지:
- "Engine repo에 이슈 데이터 없음 — Vault가 별도 Git 저장소"
- "어떤 모드로 동작할지는 Recipe 파일이 결정 (코드에 switch 없음)"

### 3.3 Issue Lifecycle 패널

상태 뱃지 흐름만 표시 (전이 테이블 제거):

```
TODO → READY → RUNNING → REVIEW → DONE
              FAILED ← exit non-0 / 변경사항 없음 · retry → READY
```

뱃지 색상:
- TODO / REVIEW: `#FFF3CD` bg + `#E6A817` border + `color:#5c3d00`
- READY / DONE: `#E8F5E9` bg + `#43A047` border + `color:#2e7d32`
- RUNNING: `#BBDEFB` bg + `#1E88E5` border + `color:#1565C0`
- FAILED: `#FFEBEE` bg + `#E53935` border + `color:#b71c1c`

### 3.4 제거 항목

현재 one-page.html에서 다음을 제거한다:

- 8개 전이 규칙 테이블 (transitions-grid)
- Panel 2 (Recipe → Execution Loop 상세)
- Panel 3 (Work Mode Jira Export 상세)
- Footer 색상 코드 안내

---

## 4. kanban-use-case.html 신규 스펙

### 4.1 시나리오

**Home Assisted** — Vault의 이슈가 AI CLI에 의해 처리되고, 사람이 최종 승인하는 흐름

executor: codex (초기 설정)

### 4.2 칸반 보드 레이아웃

5컬럼 가로 배치:

```
TODO | READY | RUNNING | REVIEW | DONE
```

FAILED는 보드 하단 별도 행으로 표시.

### 4.3 이슈 카드 구성

**TODO / READY 카드** (session 없음):
```
#N 이슈 제목
executor: codex
priority: ...
```

**RUNNING 카드** (session 생성됨):
```
#N 이슈 제목
▶ AI CLI 실행 중
session: run-YYYYMMDD-xxxx
kanban run #N
```

**REVIEW 카드** (session 기록됨):
```
#N 이슈 제목
AI CLI 완료 · exit 0
session: run-YYYYMMDD-xxxx
kanban approve #N
```

**DONE 카드** (session 완료):
```
#N 이슈 제목
✅ 완료
session: run-YYYYMMDD-xxxx
completed: YYYY-MM-DD
```

**FAILED 카드**:
```
#N 이슈 제목
exit non-0 — 변경사항 없음
session: run-YYYYMMDD-xxxx
kanban retry #N → READY 복귀
```

### 4.4 흐름 요약 (하단 Annotation)

```
1️⃣ kanban next     → TODO → READY
2️⃣ kanban run #N  → session 생성 · AI CLI 실행
3️⃣ exit 0 + 변경  → REVIEW (session ID 기록)
4️⃣ kanban approve → DONE · session 완료 기록
```

---

## 5. 공유 시각 언어

두 파일이 동일한 상태 뱃지 색상 시스템을 사용한다 (§3.3 참조).

---

## 6. 비범위

- Panel 2 (Recipe Loop), Panel 3 (Work Mode Jira Export) 상세 내용은 `kanban-runtime.md`에 이미 존재. 새 파일 미생성.
- SVG / drawio 파일 미수정.
- Work Mode, FAILED+retry, REVIEW→RUNNING 재작업 Use Case는 이번 범위 외.
