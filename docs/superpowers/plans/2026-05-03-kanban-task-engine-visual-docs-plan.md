# kanban-task-engine 시각화 문서 구현 Plan

**Date:** 2026-05-03
**Status:** Active
**Author:** Claude (Design Lead)
**Base Spec:** `docs/design/2026-05-03-kanban-task-engine-visual-docs-design.md`
**Previous Plan:** `docs/superpowers/plans/2026-05-02-kanban-task-engine-visual-docs-plan.md`

---

## 목적

Phase 1 spec에서 확인된 기존 diagram의 불일치 항목을 수정하고,
README·draw.io source·SVG rendered asset·검증 스크립트를 이터레이션한다.

---

## 변경 범위 요약

| Scope | 파일 | 변경 유형 |
|---|---|---|
| A | `README.md` | 수정 (spec §5 반영) |
| B | `docs/design/kanban-task-engine-one-page.drawio` | 수정 (spec §4 불일치 반영) |
| B | `docs/design/kanban-task-engine-one-page.svg` | 수정 (drawio 변경 반영) |
| C | `scripts/verify-docs.py` | 수정 (검증 항목 강화) |
| D | `docs/design/2026-05-03-kanban-task-engine-visual-docs-design.md` | 신규 (spec, Phase 1 산출물) |

---

## Scope A: README.md 개선

### 선행 검증

- 기존 README: 아키텍처 개요 SVG embed(`![Architecture Overview]`), 7개 섹션 구조 이미 존재.
- 보완 필요 항목(spec §5 기준):
  1. `READY → TODO`, `REVIEW → RUNNING` 전이 — CLI 섹션 또는 Key Concepts에 미반영
  2. `validate-only` 모드 — Recipes 섹션에 존재하나 Mode 섹션에 미언급
  3. `packages/cli` vs `adapter-cli` 구분 — Project Structure에서 혼용

### 구현 단계

**Step A-1: 변경 전 백업 확인**
- `README.md` 현재 내용을 읽어 변경 위치 확정.

**Step A-2: 변경 적용**
- Home And Work Modes 섹션에 `validate-only` 모드 한 줄 추가.
- CLI 섹션에 `READY → TODO` 되돌리기, `REVIEW → RUNNING` 재실행 트리거 동작 추가.
- Project Structure에 `packages/cli` (CLI entry point)와 `adapter-cli` (adapter layer) 구분 명시.
- Architecture Overview `<details>` text version에 누락 전이 2개, `codex` executor 추가.

**Step A-3: 검증**
- `scripts/verify-docs.py` 실행 — `check_readme_links` PASS 확인.
- 내부 링크(`docs/design/`, `docs/superpowers/specs/`) 모두 확인.

### 완료 증거

- README에 `validate-only` 언급 존재.
- `READY → TODO`, `REVIEW → RUNNING` 전이가 CLI 또는 text version에 기술됨.
- `packages/cli`와 `adapter-cli`가 구분되어 표시됨.

### 실패 시 중단 조건

- `check_readme_links` FAIL → 링크 수정 후 재시도.
- README에 Architecture Overview SVG embed가 사라지면 중단.

---

## Scope B: draw.io source + SVG rendered asset 개선

### 선행 검증

- 기존 `.drawio`: 22,109 bytes mxGraph XML — 존재 확인됨.
- 기존 `.svg`: 13,517 bytes 수동 fallback SVG — 존재 확인됨.
- Phase 1에서 확인된 불일치(spec §3.6):
  1. `READY → TODO` 전이 누락
  2. `REVIEW → RUNNING` 전이 누락
  3. `validate-only` 모드 미표시
  4. `packages/cli` / `adapter-cli` 혼용
  5. `codex` executor 미표시
  6. annotation box 캔버스 경계 초과(x=1480)
  7. Panel 2 상태 박스 중복 → recipe resolution 흐름 중심으로 단순화
  8. `.note` class font-size 9px → 최소 10px
  9. Panel 내부 arrow stroke-width 1px → 1.5px

### draw.io XML 수정 전략

draw.io CLI가 없으므로 SVG를 직접 수정(수동 fallback 유지).
`.drawio` XML은 Panel 1 상태 전이 보완, annotation 위치 조정, Panel 2 단순화를 반영한다.

**Step B-1: `.drawio` XML 수정**
수정 항목:
- Panel 1: `READY → TODO`, `REVIEW → RUNNING` edge 추가. Epic note 추가.
- Panel 2: 상태 박스 제거, recipe resolution 3단계 흐름 추가. `codex` executor 추가. `validate-only` 분기 추가.
- 상단: `packages/cli`(entry point)와 `adapter-cli`(adapter layer) 구분 label 수정.
- Annotation: x 좌표를 1480 → 1300 이하로 이동하여 캔버스 내부 유지.

**Step B-2: SVG 수정**
`.drawio` 변경 사항을 SVG에도 반영.
수정 항목:
- `font-size: 9px` (.note) → `font-size: 10px`
- Panel 내부 arrow `stroke-width="1"` → `stroke-width="1.5"`
- Panel 1: 누락 전이 2개 추가 (polyline + label)
- Panel 2: recipe resolution 3단계 흐름으로 대체. `validate-only` 분기 추가. `codex` 추가.
- annotation box x 좌표 조정 (캔버스 내부)
- `packages/cli` / `adapter-cli` label 수정

**Step B-3: 검증**
- `scripts/verify-docs.py` `check_diagram_labels` PASS 확인.
- SVG 파일 head 확인 (`<svg xmlns`로 시작).
- annotation box가 `viewBox="0 0 1600 900"` 내부에 위치하는지 좌표 확인.

### 완료 증거

- `.drawio`에 `READY`, `TODO`, `REVIEW`, `RUNNING`, `DONE`, `FAILED`, `Worktree`, `Jira`, `codex`, `validate-only` 라벨 모두 존재.
- SVG `.note` font-size ≥ 10px.
- SVG annotation box x+width ≤ 1600.
- `check_diagram_labels` PASS.

### 실패 시 중단 조건

- `check_diagram_labels` FAIL이 수정 후에도 지속되면 해당 라벨 추가 후 재시도.
- SVG가 유효한 XML이 아니면 중단 후 원본 복구.

### 제한사항 (사전 기록)

- draw.io Desktop App export 없이 수동 SVG 유지.
  → draw.io의 rounded arrow, auto-layout, connector routing 미지원.
  → 다음 이터레이션에서 draw.io Desktop 또는 `jgraph/drawio-export` Docker로 개선 가능.

---

## Scope C: 검증 스크립트 강화

### 선행 검증

- `scripts/verify-docs.py`: 기존 파일 존재 확인.
- 현재 검증 항목: 파일 존재, README 링크, 내부 링크, diagram 라벨.
- 강화 필요 항목(spec §8 Acceptance Criteria 기준):
  1. `validate-only` 라벨 검증 추가
  2. `codex` 라벨 검증 추가
  3. SVG 최소 크기 검증 (1KB 이상)
  4. SVG `viewBox` 속성 존재 확인
  5. annotation이 캔버스 내부에 있는지 좌표 검증 (선택적)

### 구현 단계

**Step C-1: `scripts/verify-docs.py` 수정**
- `check_diagram_labels`의 `required_labels`에 `validate-only`, `codex` 추가.
- `check_svg_validity` 함수 추가: SVG 파일 크기 ≥ 1024 bytes, `<svg` 태그 포함.
- `main()`에 `check_svg_validity()` 호출 추가.

**Step C-2: 검증 실행**
- `python scripts/verify-docs.py` 실행.
- 모든 PASS 확인.

### 완료 증거

- `scripts/verify-docs.py`가 `=== ALL CHECKS PASSED ===` 출력.
- exit code 0 반환.

### 실패 시 중단 조건

- 검증 스크립트 자체에 Python syntax error → 수정 후 재시도.
- FAIL 항목이 있으면 해당 파일 수정 → 재시도.

---

## Plan Self-Review

### 실행 가능성 검토

| 항목 | 판단 | 근거 |
|---|---|---|
| draw.io CLI 없이 SVG 직접 수정 가능 | ✅ | 기존 SVG가 수동 작성 fallback — 동일 방식 유지 |
| README 수정이 기존 구조를 깨지 않음 | ✅ | 추가/수정만, 삭제 없음 |
| verify-docs.py Python 버전 의존성 | ✅ | pathlib, re, sys — stdlib only, 설치 불필요 |
| git commit/push는 사용자 승인 후 | ✅ | 이 plan에서는 파일 생성만, push 없음 |

### Backward Compatibility 검토

- `README.md`: 섹션 추가/수정만. 기존 SVG embed anchor 유지. 링크 깨짐 없음.
- `.drawio`: mxCell id 새로 추가만. 기존 cell id 변경 없음.
- `.svg`: 기존 요소 수정 + 새 요소 추가. `viewBox` 유지.
- `verify-docs.py`: 검증 항목 추가만. 기존 PASS 항목에 영향 없음.

### Repo Safety 검토

- destructive git 작업 없음.
- network 설치 없음.
- 권한 상승 없음.
- commit/push는 사용자 승인 후 진행.

### Blocker 없음

P0 blocker 미발견. 모든 scope 즉시 실행 가능.

---

## 검증 결과 기록 (구현 후 채워짐)

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| check_files_exist | — | 구현 후 기록 |
| check_readme_links | — | 구현 후 기록 |
| check_internal_links | — | 구현 후 기록 |
| check_diagram_labels | — | 구현 후 기록 |
| check_svg_validity | — | 구현 후 기록 |
| ALL CHECKS PASSED | — | 구현 후 기록 |

---

*이 plan은 2026-05-03 repo 상태를 기준으로 작성되었습니다.*
