# Visual Docs Redesign — 설계 스펙

**Date:** 2026-05-07
**Status:** Revised (post-review 2026-05-07)
**Scope:** `docs/design/` 시각화 에셋 redesign — HTML / drawio / SVG 동기화 + use-case 신규

---

## 1. 목표

사람이 보는 시각화 자료와 LLM이 보는 상세 문서를 분리한다.

- **사람용**: HTML/drawio/SVG 시각화 — `one-page` (개선) + `use-case` (신규)
- **LLM용**: 기존 md (`kanban-runtime.md`, specs 등) — 새로 만들지 않음

gray box 원칙: 색상 구역은 유지하되 패키지명·클래스명·함수명은 제거하고 역할 중심으로 표현한다.

---

## 2. 파일 범위

`one-page` 자산은 기존을 in-place 개선. `use-case` 자산은 신규.

| 파일 | 작업 |
|---|---|
| `docs/design/kanban-task-engine-one-page.html` | 개선 (in-place) |
| `docs/design/kanban-task-engine-one-page.drawio` | HTML 변경에 맞춰 동기화 |
| `docs/design/kanban-task-engine-one-page.svg` | drawio에서 re-export |
| `docs/design/kanban-use-case.html` | 신규 |
| `docs/design/kanban-use-case.drawio` | 신규 |
| `docs/design/kanban-use-case.svg` | drawio에서 export |
| `README.md` | use-case.svg embed 추가 (architecture preview 다음 섹션) |
| `docs/design/README.md` | 새 use-case asset 등록 + 색상 규칙은 그대로 |
| `scripts/verify_docs/` | use-case asset 검증 추가 |

---

## 3. one-page.html 개선 스펙

### 3.1 아키텍처 구역 (상단 row)

색상 시스템 유지:
- 🟣 Vault: `#F3E5F5` bg + `#9C27B0` dashed
- 🟢 Engine: `#E8F5E9` bg + `#4CAF50` solid
- 🔵 External: `#E3F2FD` bg + `#2196F3` dashed

**Vault 구역** — 3개 박스 (세로):

| 박스 | 형식 | 설명 |
|---|---|---|
| Markdown Issues | `.md` | Source of Truth · 사람이 직접 읽고 쓰는 파일 |
| Boards | `.md` | 어떤 이슈가 어느 컬럼에 있는지 |
| Recipes | `.yaml` | 누가 어떤 도구로 실행할지 (예: Codex로 실행 / Jira export만) |

**Engine 구역** — 가로 4칸 배치 (flex row):

| 박스 | 설명 |
|---|---|
| Core | 상태 전이 · 실행 루프 |
| Schema | .md ↔ JSON 계약 |
| Adapters | Jira · GitHub · Codex 연결 |
| CLI | `kanban run` 진입점 |

- 부제: "로직만 · 데이터 없음"
- `flex:1`로 Vault/External 사이 공간 채움

**External 구역** — 2개 박스 (세로):

| 박스 | 설명 |
|---|---|
| Codex | Home 실행기 |
| Jira · GitHub | Work 연동 |

- 모든 텍스트에 `color:#1a1a1a` 명시 (상속 색 누락 방지)

### 3.2 Annotation row

2개 유지:
- "Engine repo에 이슈 데이터 없음 — Vault가 별도 Git 저장소"
- "어떤 모드로 동작할지는 Recipe 파일이 결정 (코드에 switch 없음)"

### 3.3 Issue Lifecycle 패널

**8개 전이 모두 표시한다.** `VALID_ISSUE_TRANSITIONS (8)` contract와 drift 금지.

Layout: forward 흐름 (5박스 화살표 row) + reverse/error 흐름 (compact note row).

```
Forward:  TODO ──→ READY ──→ RUNNING ──→ REVIEW ──→ DONE
                                  │           │
                                  ↓           │
                               FAILED         │
Reverse:  TODO ←────── READY    │             │
                                ↑             │
          FAILED ─ retry ─ ─→ READY           │
                                              │
                              REVIEW ←─── retry (REVIEW → RUNNING)
```

8개 전이 식별:
1. `TODO → READY` (전진 · 준비)
2. `READY → TODO` (후퇴 · 되돌리기)
3. `READY → RUNNING` (전진 · `--execute`)
4. `RUNNING → REVIEW` (전진 · exit 0 + 변경)
5. `RUNNING → FAILED` (전진 · exit non-0 / no-change)
6. `REVIEW → DONE` (전진 · approve)
7. `REVIEW → RUNNING` (후퇴 · retry)
8. `FAILED → READY` (후퇴 · retry)

패널 하단에 텍스트로 명시: `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)` — `verify-docs.py status drift check` 통과용.

뱃지 색상:
- TODO / REVIEW: `#FFF3CD` bg + `#E6A817` border + `color:#5c3d00`
- READY / DONE: `#E8F5E9` bg + `#43A047` border + `color:#2e7d32`
- RUNNING: `#BBDEFB` bg + `#1E88E5` border + `color:#1565C0`
- FAILED: `#FFEBEE` bg + `#E53935` border + `color:#b71c1c`

### 3.4 제거 항목

현재 one-page.html에서 다음을 제거:

- 상세 transitions-grid 테이블 (8개 전이는 §3.3의 흐름 다이어그램으로 대체)
- Panel 2 (Recipe → Execution Loop 상세 박스)
- Panel 3 (Work Mode Jira Export 상세 박스)
- Footer 색상 코드 안내 (자명한 정보 제거)

### 3.5 Layout 기준

- 최소 viewport 폭: `1200px` (현재 viewport: `1600px`)
- 그 미만에서는 자연 스크롤 허용 (반응형 미요구)
- 텍스트 overflow 발생 시 `word-break:keep-all` + 박스 padding 증가

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

FAILED는 보드 하단 별도 행.

- 최소 viewport 폭: `1100px`
- 그 미만에서는 자연 스크롤 허용

### 4.3 이슈 카드 + CLI 매핑

CLI 계약 ([packages/cli/src/commands/run.ts](packages/cli/src/commands/run.ts), [docs/kanban-runtime.md](docs/kanban-runtime.md):43-45) 기준:

- `kanban next` — discovery-only (READY 이슈 selection 제안만)
- `kanban run <id>` — inspect-only (실행 안 됨)
- 실행 트리거는 `--execute` 필수, codex 사용은 `--agent codex` 필수
- TODO → READY는 frontmatter `status` 필드 편집 (CLI에서 직접 전이 명령 없음 — 운영자가 .md 편집)

**TODO 카드** (session 없음, status는 frontmatter):
```
#N 이슈 제목
executor: codex
priority: ...
```

**READY 카드** (frontmatter `status: READY` 편집됨):
```
#N 이슈 제목
executor: codex
↑ frontmatter status 편집으로 진입
```

**RUNNING 카드** (session 생성됨):
```
#N 이슈 제목
▶ AI CLI 실행 중
session: run-YYYYMMDD-xxxx
kanban run #N --execute --agent codex
isolated worktree
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
exit non-0 / 변경사항 없음
session: run-YYYYMMDD-xxxx
kanban retry #N → READY 복귀
```

### 4.4 흐름 요약 (하단 Annotation)

```
1️⃣ status: TODO → READY (frontmatter 편집)
2️⃣ kanban run #N --execute --agent codex  (session 생성, AI CLI 실행)
3️⃣ exit 0 + 변경 → REVIEW (session ID 기록)
4️⃣ kanban approve #N → DONE (session 완료 기록)
   실패 시: kanban retry #N → READY 복귀
```

---

## 5. drawio / SVG 동기화 (옵션 1)

HTML이 canonical 시각 언어. drawio/svg는 그에 맞춰 동기화한다.

### 5.1 one-page

- 현재 `kanban-task-engine-one-page.drawio` 수정:
  - Vault 박스 3개 (Markdown Issues / Boards / Recipes) — 형식 라벨 표시
  - Engine 박스 4개 (Core / Schema / Adapters / CLI) — 역할 설명만
  - External 박스 2개 (Codex / Jira · GitHub)
  - Lifecycle 패널: 5상태 흐름 + 3개 reverse/error 화살표 (총 8개 전이)
  - Panel 2/3 제거
- SVG re-export: drawio Desktop App `File → Export as → SVG`

### 5.2 use-case (신규)

- `kanban-use-case.drawio` 신규 작성:
  - 5컬럼 칸반 보드 + FAILED 별도 행
  - 각 컬럼에 예시 카드 (CLI + session ID 포함)
  - 흐름 요약 섹션
- `kanban-use-case.svg` export

### 5.3 verify-docs.py 확장

`scripts/verify_docs/`에 use-case asset 검증 추가:

- 필수 파일 목록에 `kanban-use-case.drawio`, `kanban-use-case.svg` 추가
- use-case drawio/svg 라벨 parity 체크 (예: `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`, `codex`, `kanban run`, `kanban approve`, `kanban retry`)
- README의 use-case embed link 검증 (architecture와 동일한 방식)

### 5.4 README.md

기존 architecture 섹션은 그대로 유지하고, 그 아래에 use-case section 추가:

```markdown
### 🎬 Use Case — Home Assisted 실행

<p align="center">
  <a href="docs/design/kanban-use-case.svg">
    <img src="docs/design/kanban-use-case.svg" alt="..." width="100%" />
  </a>
</p>
```

---

## 6. 공유 시각 언어

`one-page`와 `use-case`는 동일한 상태 뱃지 색상 시스템 사용 (§3.3). 색상 규칙은 `docs/design/README.md`의 기존 표 기준.

---

## 7. 검증

작업 완료 기준:

- [ ] `python3 scripts/verify-docs.py` PASS
- [ ] README.md의 architecture · use-case 두 SVG가 GitHub-rendered preview에서 정상 표시
- [ ] 8개 전이가 one-page에서 모두 식별 가능
- [ ] use-case의 모든 CLI 명령이 실제 CLI 계약과 일치 (`--execute --agent codex` 포함)
- [ ] HTML 두 개를 1200px / 1100px viewport에서 열었을 때 텍스트 overflow 없음

---

## 8. 비범위

- archive SVG (`kanban-task-engine-architecture-overview.svg`) 재설계는 이번 범위 외
- Work Mode 시각화, FAILED+retry 별도 시나리오, REVIEW→RUNNING 재작업 시나리오 use-case는 이번 범위 외 (one-page lifecycle에는 모두 표시되지만, kanban-use-case.html은 Home Assisted 단일 시나리오)
- mobile/tablet 반응형은 미요구
