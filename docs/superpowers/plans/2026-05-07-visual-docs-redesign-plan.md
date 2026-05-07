# Visual Docs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/design/`의 시각화 자산을 redesign — `one-page` 개선 + `use-case` 신규 + drawio/SVG/README/verify_docs 동기화.

**Architecture:** HTML이 canonical 시각 언어. drawio/SVG는 README embed 및 verify-docs gate용. README는 두 SVG (architecture · use-case)를 embed하고, verify_docs/는 두 자산 모두를 라벨/구조 단위로 검증.

**Tech Stack:** HTML/CSS (vanilla), draw.io XML (mxfile), SVG, Python 3 (verify_docs).

**Spec:** [docs/superpowers/specs/2026-05-07-visual-docs-redesign-design.md](docs/superpowers/specs/2026-05-07-visual-docs-redesign-design.md)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `docs/design/kanban-task-engine-one-page.html` | one-page 시각화 (in-place 개선) |
| `docs/design/kanban-task-engine-one-page.drawio` | one-page drawio 소스 (라벨 동기화) |
| `docs/design/kanban-task-engine-one-page.svg` | one-page SVG (README embed) |
| `docs/design/kanban-use-case.html` | use-case 칸반 보드 시각화 (신규) |
| `docs/design/kanban-use-case.drawio` | use-case drawio 소스 (신규) |
| `docs/design/kanban-use-case.svg` | use-case SVG (신규, README embed) |
| `docs/design/README.md` | design 자산 인덱스 (use-case 등록) |
| `README.md` | use-case 섹션 추가 |
| `scripts/verify_docs/cli.py` | use-case 파일 존재 + 라벨/SVG-drawio parity 검증 추가 |
| `scripts/verify_docs/readme.py` | use-case README embed 검증 추가 |

---

## Phase A — HTML 작업

### Task 1: one-page.html 아키텍처 row 개선

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.html` — 라인 222–343 (현재 `arch-row` 블록)

목표: Vault 3박스 (Markdown/Boards/Recipes), Engine 4박스 (Core/Schema/Adapters/CLI), External 2박스 (Codex/Jira·GitHub) 로 교체.

- [ ] **Step 1: 현재 `<div class="arch-row">` 블록 통째로 교체**

`<!-- ══ ARCHITECTURE ROW ══ -->` 주석 다음부터 `</div><!-- /arch-row -->`까지를 아래 마크업으로 대체:

```html
<!-- ══ ARCHITECTURE ROW ══ -->
<div class="arch-row">

  <!-- VAULT -->
  <div class="zone-vault">
    <div class="zone-title">🗂 Vault</div>
    <div style="font-size:9.5px;color:#9C27B0;font-style:italic;margin-bottom:8px;">별도 Git 저장소</div>
    <div class="vault-stack">
      <div class="vault-card">
        <div class="box-title">Markdown Issues <span class="ext">.md</span></div>
        <div class="sot">← Source of Truth</div>
        <div class="box-text">사람이 직접 읽고 쓰는 파일</div>
      </div>
      <div class="vault-card">
        <div class="box-title">Boards <span class="ext">.md</span></div>
        <div class="box-text">어떤 이슈가 어느 컬럼에 있는지</div>
      </div>
      <div class="vault-card">
        <div class="box-title">Recipes <span class="ext">.yaml</span></div>
        <div class="box-text">누가 어떤 도구로 실행할지</div>
        <div class="box-italic">예: Codex로 실행 / Jira export만</div>
      </div>
    </div>
  </div>

  <!-- arrow Vault→Engine -->
  <div class="arch-arrows">
    <span style="font-size:1.4em;">→</span>
    <span>읽어서</span>
    <span>JSON화</span>
  </div>

  <!-- ENGINE -->
  <div class="zone-engine">
    <div class="zone-title">⚙️ Engine</div>
    <div style="font-size:9.5px;color:#4CAF50;font-style:italic;margin-bottom:8px;">로직만 · 데이터 없음</div>
    <div class="engine-inner">
      <div class="engine-box">
        <div class="box-title">Core</div>
        <div class="box-text">상태 전이 · 실행 루프</div>
      </div>
      <div class="engine-box">
        <div class="box-title">Schema</div>
        <div class="box-text">.md ↔ JSON 계약</div>
      </div>
      <div class="engine-box">
        <div class="box-title">Adapters</div>
        <div class="box-text">Jira · GitHub · Codex 연결</div>
      </div>
      <div class="engine-box">
        <div class="box-title">CLI</div>
        <div class="box-text"><code>kanban run</code> 진입점</div>
      </div>
    </div>
  </div>

  <!-- arrow Engine→External -->
  <div class="arch-arrows">
    <span style="font-size:1.4em;">→</span>
    <span>adapter</span>
    <span>경유</span>
  </div>

  <!-- EXTERNAL -->
  <div class="zone-external">
    <div class="zone-title" style="color:#0d47a1;">🌐 External</div>
    <div style="font-size:9.5px;color:#1565C0;font-style:italic;margin-bottom:8px;">외부 시스템</div>
    <div class="ext-inner">
      <div class="ext-card">
        <div class="box-title">Codex</div>
        <div class="box-text">Home 실행기</div>
      </div>
      <div class="ext-card">
        <div class="box-title">Jira · GitHub</div>
        <div class="box-text">Work 연동</div>
      </div>
    </div>
  </div>

</div><!-- /arch-row -->
```

- [ ] **Step 2: CSS 추가 — vault-stack/vault-card/ext-card 클래스**

`<style>` 블록 안 (기존 `.zone-vault`, `.zone-external` 정의 위치) 에 다음을 추가/교체:

```css
/* VAULT */
.zone-vault {
  flex:0 0 14em;
  border:2px dashed #9C27B0;
  background:#F3E5F5;
  border-radius:8px;
  padding:0.8em;
}
.zone-vault .zone-title { color:#6a1b9a; }
.vault-stack { display:flex; flex-direction:column; gap:0.4em; }
.vault-card {
  background:#fff;
  border:1.5px solid #AB47BC;
  border-radius:4px;
  padding:0.5em 0.7em;
}
.vault-card .ext { font-weight:400; color:#AB47BC; font-size:0.85em; }

/* ENGINE — 가로 4칸 */
.zone-engine {
  flex:1;
  border:2px solid #4CAF50;
  background:#E8F5E9;
  border-radius:8px;
  padding:0.8em;
  min-width:0;
}
.zone-engine .zone-title { color:#1b5e20; }
.engine-inner { display:flex; gap:0.5em; }
.engine-box {
  flex:1;
  background:#fff;
  border:1px solid #4CAF50;
  border-radius:4px;
  padding:0.5em 0.7em;
  min-width:0;
}
.engine-box .box-title { color:#1a1a1a; }
.engine-box .box-text { color:#555; }
.engine-box code { background:#f0f0f0; padding:1px 4px; border-radius:2px; font-size:0.85em; }

/* EXTERNAL */
.zone-external {
  flex:0 0 9em;
  border:2px dashed #2196F3;
  background:#E3F2FD;
  border-radius:8px;
  padding:0.8em;
}
.zone-external .zone-title { color:#0d47a1; }
.ext-inner { display:flex; flex-direction:column; gap:0.4em; }
.ext-card {
  background:#fff;
  border:1px solid #2196F3;
  border-radius:4px;
  padding:0.5em 0.7em;
  text-align:center;
}
.ext-card .box-title { color:#1a1a1a; }
.ext-card .box-text { color:#555; font-size:0.85em; }
```

기존의 `.vault-md`, `.vault-right`, `.vault-boards`, `.vault-recipes`, `.ext-openclaw`, `.ext-row`, `.ext-jira`, `.ext-github`, `.ext-note` 정의를 모두 삭제.

- [ ] **Step 3: 브라우저로 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.html
```

확인:
- Vault 3박스가 세로로 쌓여 있고, 각 박스 우상단에 `.md`/`.md`/`.yaml` 형식 라벨 표시
- Engine 4박스가 가로로 균등 배치 (Vault, External 사이 공간 채움)
- External 2박스 (Codex/Jira·GitHub) — 텍스트 잘 보임
- 1200px viewport에서 텍스트 잘림 없음

- [ ] **Step 4: 커밋**

```bash
git add docs/design/kanban-task-engine-one-page.html
git commit -m "$(cat <<'EOF'
docs: one-page.html 아키텍처 row 개선

Vault 3박스 (Markdown/Boards/Recipes) — 형식 라벨 명시,
Engine 4박스 (Core/Schema/Adapters/CLI) — 역할 설명만,
External 2박스 (Codex/Jira·GitHub) — 단순화.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: one-page.html Lifecycle 패널 재작성 (8개 전이)

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.html` — 기존 `<!-- PANEL 1 -->` 블록 (`<div class="panel p1">`)

목표: `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)` 모두 시각화. forward 흐름 + reverse/error 화살표.

- [ ] **Step 1: panel-row를 lifecycle-panel 단일 블록으로 교체**

기존 `<div class="panel-row">` 전체 블록(`<!-- PANEL 1 -->`, `<!-- PANEL 2 -->`, `<!-- PANEL 3 -->` 모두 포함)을 다음으로 교체:

```html
<!-- ══ ISSUE LIFECYCLE ══ -->
<div class="lifecycle-panel">
  <div class="lifecycle-title">Issue Lifecycle <span class="lifecycle-meta">— IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)</span></div>

  <!-- forward + reverse top row -->
  <div class="lc-row">
    <div class="lc-stage">
      <span class="st st-todo">TODO</span>
      <span class="lc-rev">↺ READY → TODO</span>
    </div>
    <div class="lc-arrow">
      <span class="lc-fwd">→</span>
      <span class="lc-lbl">prep</span>
    </div>
    <span class="st st-ready">READY</span>
    <div class="lc-arrow">
      <span class="lc-fwd">→</span>
      <span class="lc-lbl">--execute</span>
    </div>
    <span class="st st-running">RUNNING</span>
    <div class="lc-arrow">
      <span class="lc-fwd">→</span>
      <span class="lc-lbl">exit 0 + 변경</span>
    </div>
    <div class="lc-stage">
      <span class="st st-review">REVIEW</span>
      <span class="lc-rev">↺ REVIEW → RUNNING (retry)</span>
    </div>
    <div class="lc-arrow">
      <span class="lc-fwd">→</span>
      <span class="lc-lbl">approve</span>
    </div>
    <span class="st st-done">DONE</span>
  </div>

  <!-- failed branch row -->
  <div class="lc-failed-row">
    <span class="lc-fail-arrow">↓ exit non-0 / 변경 없음</span>
    <span class="st st-failed">FAILED</span>
    <span class="lc-rev">↺ retry → READY</span>
  </div>

  <div class="lc-note">
    상세 전이 규칙은 <a href="../../packages/schema/src/status.ts"><code>packages/schema/src/status.ts</code></a> 참조
  </div>
</div>
```

- [ ] **Step 2: CSS 추가 — lifecycle-panel 클래스**

`<style>` 블록 안에 추가 (기존 `.panel`, `.p1`, `.transitions-grid`, `.p1-note` 등 panel 관련 정의는 유지하되 사용 안 됨 — Task 3에서 정리):

```css
/* ── LIFECYCLE PANEL ── */
.lifecycle-panel {
  background:#fafafa; border:1.5px dashed #ccc;
  border-radius:6px; padding:1em 1.2em;
  margin-top:0.7em;
}
.lifecycle-title {
  font-size:1.05em; font-weight:700; color:#222;
  text-align:center; margin-bottom:0.7em;
}
.lifecycle-meta { font-weight:400; color:#888; font-size:0.85em; }

.lc-row { display:flex; gap:0.5em; align-items:center; justify-content:center; flex-wrap:wrap; }
.lc-stage { display:flex; flex-direction:column; align-items:center; gap:0.25em; }
.lc-rev { font-size:0.78em; color:#888; font-style:italic; white-space:nowrap; }
.lc-arrow { display:flex; flex-direction:column; align-items:center; gap:0.1em; }
.lc-fwd { font-size:1.2em; color:#555; line-height:1; }
.lc-lbl { font-size:0.78em; color:#555; white-space:nowrap; }

.lc-failed-row {
  display:flex; gap:0.7em; align-items:center; justify-content:center;
  margin-top:0.8em;
}
.lc-fail-arrow { font-size:0.8em; color:#c62828; font-style:italic; }

.lc-note {
  margin-top:0.8em; text-align:center;
  font-size:0.82em; color:#888; font-style:italic;
}
.lc-note code { background:#f0f0f0; padding:1px 5px; border-radius:2px; font-size:0.95em; }
```

상태 뱃지 색상은 §3.3 스펙 기준이며, 기존 `.st-todo`/`.st-ready`/`.st-running`/`.st-review`/`.st-done`/`.st-failed` CSS는 다음과 같이 통일된 값으로 교체:

```css
.st {
  padding:0.3em 0.7em; border-radius:4px;
  font-size:0.9em; font-weight:700;
  white-space:nowrap;
}
.st-todo    { background:#FFF3CD; border:2px solid #E6A817; color:#5c3d00; }
.st-ready   { background:#E8F5E9; border:2px solid #43A047; color:#2e7d32; }
.st-running { background:#BBDEFB; border:2px solid #1E88E5; color:#1565C0; }
.st-review  { background:#FFF3CD; border:2px solid #E6A817; color:#5c3d00; }
.st-done    { background:#E8F5E9; border:2px solid #43A047; color:#2e7d32; }
.st-failed  { background:#FFEBEE; border:2px solid #E53935; color:#b71c1c; }
```

- [ ] **Step 3: 브라우저로 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.html
```

확인 (8개 전이 모두 식별 가능해야 함):
1. TODO → READY ✓ (forward `prep`)
2. READY → TODO ✓ (`↺ READY → TODO` 라벨)
3. READY → RUNNING ✓ (forward `--execute`)
4. RUNNING → REVIEW ✓ (forward `exit 0 + 변경`)
5. RUNNING → FAILED ✓ (failed-row `↓ exit non-0 / 변경 없음`)
6. REVIEW → DONE ✓ (forward `approve`)
7. REVIEW → RUNNING ✓ (`↺ REVIEW → RUNNING (retry)` 라벨)
8. FAILED → READY ✓ (failed-row `↺ retry → READY`)

문구 `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)` 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add docs/design/kanban-task-engine-one-page.html
git commit -m "$(cat <<'EOF'
docs: one-page.html lifecycle 패널 8개 전이 모두 표시

forward 흐름 + reverse/error 화살표로 VALID_ISSUE_TRANSITIONS (8)
모두 시각화. status drift check 통과를 위해 IssueStatus (6),
VALID_ISSUE_TRANSITIONS (8) 라벨 명시.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: one-page.html 정리 (Panel 2/3 잔여, Footer)

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.html`

목표: 사용 안 되는 CSS 제거, footer 단순화.

- [ ] **Step 1: 사용 안 되는 CSS 블록 삭제**

`<style>` 안에서 다음 셀렉터의 정의 블록 모두 삭제:
- `.panel`, `.panel-row`, `.panel-title`
- `.p1`, `.status-row`, `.status-row .lbl`
- `.arrow-lbl`, `.arrow-fwd`, `.arrow-back`
- `.transitions-grid`, `.tr`, `.tr code`, `.tr .dir`
- `.p1-note`, `.p1-note p`
- `.p2`, `.recipe-step`, `.recipe-arrow`, `.policy-box`
- `.fork-row`, `.exec-box`, `.worktree-box`, `.validate-box`
- `.flow-note`, `.flow-fail`
- `.p3`, `.p3-inner`, `.p3-flow`, `.p3-box`, `.p3-vault`, `.p3-engine`, `.p3-adapter`, `.p3-jira`
- `.p3-arrow`, `.p3-right`
- `.writeback-box`, `.wb-title`, `.wb-item`, `.wb-ok`, `.wb-no`, `.wb-note`
- `.policy-note`

- [ ] **Step 2: Footer 단순화**

기존 `<div class="footer">` 블록을 다음으로 교체:

```html
<!-- ══ FOOTER ══ -->
<div class="footer">
  <p>
    📦 자산: <a href="kanban-task-engine-one-page.drawio">.drawio</a> ·
    <a href="kanban-task-engine-one-page.svg">.svg</a> ·
    <a href="kanban-use-case.html">use-case</a>
  </p>
  <p>색상 규칙은 <a href="README.md">docs/design/README.md</a> 참조.</p>
</div>
```

`.footer p` CSS 정의는 기존 그대로 유지.

- [ ] **Step 3: 1200px viewport 확인**

브라우저에서 창 너비를 1200px 근처로 줄여서 텍스트 overflow가 없는지 확인.

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.html
```

- [ ] **Step 4: 커밋**

```bash
git add docs/design/kanban-task-engine-one-page.html
git commit -m "$(cat <<'EOF'
docs: one-page.html 잔여 CSS 정리 및 footer 단순화

Panel 2/3 관련 사용 안 되는 CSS 제거, footer를 자산 링크 + 색상 규칙
참조로 단축.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: kanban-use-case.html 신규 작성

**Files:**
- Create: `docs/design/kanban-use-case.html`

목표: 5컬럼 칸반 보드 + FAILED 행 + 카드 + CLI 매핑 + 흐름 요약.

- [ ] **Step 1: 새 파일 생성**

다음 내용으로 파일 작성:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1200"/>
<title>kanban-task-engine — Use Case (Home Assisted)</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html { font-size:clamp(8px, 0.85vw, 12px); }
body { background:#fff; font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; padding:1.5em; min-width:1100px; }

.page-title { font-size:1.5em; font-weight:700; color:#1a1a1a; }
.page-sub   { font-size:0.95em; color:#888; margin-top:0.3em; }

/* ── BOARD ── */
.board { display:flex; gap:0.6em; margin-top:1em; align-items:flex-start; }
.col { flex:1; min-width:0; }
.col-head { padding:0.4em 0.7em; text-align:center; font-weight:700; font-size:0.95em; border-radius:6px 6px 0 0; }
.col-body { border-style:solid; border-width:1.5px; border-top:none; border-radius:0 0 6px 6px; padding:0.5em; min-height:9em; }

.col-todo    .col-head { background:#FFF3CD; border:2px solid #E6A817; color:#5c3d00; }
.col-todo    .col-body { background:#fffdf0; border-color:#E6A817; }
.col-ready   .col-head { background:#E8F5E9; border:2px solid #43A047; color:#2e7d32; }
.col-ready   .col-body { background:#f5fbf5; border-color:#43A047; }
.col-running .col-head { background:#BBDEFB; border:2px solid #1E88E5; color:#1565C0; }
.col-running .col-body { background:#f0f7ff; border-color:#1E88E5; }
.col-review  .col-head { background:#FFF3CD; border:2px solid #E6A817; color:#5c3d00; }
.col-review  .col-body { background:#fffdf0; border-color:#E6A817; }
.col-done    .col-head { background:#E8F5E9; border:2px solid #43A047; color:#2e7d32; }
.col-done    .col-body { background:#f5fbf5; border-color:#43A047; }

.flow-arrow { padding-top:1.7em; color:#aaa; font-size:1.1em; }

/* ── CARD ── */
.card {
  background:#fff; border:1px solid #ddd; border-radius:4px;
  padding:0.55em 0.7em; box-shadow:0 1px 3px rgba(0,0,0,0.07);
  font-size:0.85em;
}
.card.active { border:1.5px solid #1E88E5; box-shadow:0 1px 3px rgba(0,0,0,0.12); }
.card.muted { opacity:0.85; }
.card-title { font-weight:700; color:#1a1a1a; }
.card-meta { font-size:0.88em; color:#888; margin-top:0.3em; }
.card-action { font-size:0.88em; font-weight:600; margin-top:0.3em; }
.card-action.running { color:#1565C0; }
.card-action.pending { color:#7a5c00; }
.card-action.done { color:#2e7d32; }
.card-action.failed { color:#b71c1c; }
.card-italic { font-size:0.85em; color:#888; font-style:italic; }

.session {
  margin-top:0.45em; padding:0.35em 0.55em; border-radius:3px;
  border:1px solid; font-size:0.83em;
}
.session-running { background:#f0f7ff; border-color:#90CAF9; }
.session-running .ses-id { color:#1565C0; font-weight:600; }
.session-running code { background:#e3f0ff; }
.session-review { background:#fffbea; border-color:#f0c36d; }
.session-review .ses-id { color:#7a5c00; font-weight:600; }
.session-review code { background:#fff0cc; }
.session-done { background:#f0fbf0; border-color:#a5d6a7; }
.session-done .ses-id { color:#2e7d32; font-weight:600; }
.session-failed { background:#fff5f5; border-color:#ffcdd2; }
.session-failed .ses-id { color:#c62828; font-weight:600; }

.session .ses-label { font-size:0.85em; color:#888; }
.session code { padding:1px 4px; border-radius:2px; font-size:0.95em; }
.session .ses-cli { font-size:0.85em; color:#888; margin-top:0.2em; }

/* ── FAILED ROW ── */
.failed-row {
  display:flex; align-items:center; gap:0.6em;
  margin-top:0.7em; flex-wrap:wrap;
}
.failed-tag {
  background:#FFEBEE; border:2px solid #E53935; border-radius:6px;
  padding:0.35em 0.8em; font-weight:700; color:#b71c1c; font-size:0.9em;
  flex:0 0 auto;
}
.failed-card {
  background:#fff; border:1px solid #E53935; border-radius:4px;
  padding:0.45em 0.7em; font-size:0.83em;
}
.failed-note { font-size:0.85em; color:#888; font-style:italic; }
.failed-note code { background:#f0f0f0; padding:1px 5px; border-radius:2px; font-size:0.95em; }

/* ── FLOW SUMMARY ── */
.flow-summary {
  margin-top:1em; background:#f0f4ff; border:1px solid #b0c4f0;
  border-radius:6px; padding:0.7em 1em;
}
.flow-summary-title { font-weight:700; color:#334; margin-bottom:0.4em; font-size:0.92em; }
.flow-steps { display:flex; gap:1em; flex-wrap:wrap; color:#555; font-size:0.86em; line-height:1.7; }
.flow-steps code { background:#f0f0f0; padding:1px 5px; border-radius:2px; font-size:0.95em; }

/* ── FOOTER ── */
.footer { margin-top:1em; border-top:1px solid #eee; padding-top:0.6em; }
.footer p { font-size:0.82em; color:#aaa; line-height:1.7; }
.footer a { color:#888; }
</style>
</head>
<body>

<p class="page-title">kanban-task-engine — Use Case (Home Assisted)</p>
<p class="page-sub">Vault의 이슈가 AI CLI에 의해 처리되고, 사람이 최종 승인하는 흐름 · executor: codex</p>

<!-- ══ KANBAN BOARD ══ -->
<div class="board">

  <div class="col col-todo">
    <div class="col-head">TODO</div>
    <div class="col-body">
      <div class="card">
        <div class="card-title">#42 캐시 레이어 추가</div>
        <div class="card-meta">executor: codex</div>
        <div class="card-meta">priority: high</div>
      </div>
    </div>
  </div>

  <div class="flow-arrow">→</div>

  <div class="col col-ready">
    <div class="col-head">READY</div>
    <div class="col-body">
      <div class="card">
        <div class="card-title">#38 API 타임아웃 수정</div>
        <div class="card-meta">executor: codex</div>
        <div class="card-italic">↑ frontmatter status: READY 편집</div>
      </div>
    </div>
  </div>

  <div class="flow-arrow">→</div>

  <div class="col col-running">
    <div class="col-head">RUNNING</div>
    <div class="col-body">
      <div class="card active">
        <div class="card-title">#35 로그 포맷 통일</div>
        <div class="card-action running">▶ AI CLI 실행 중</div>
        <div class="card-meta">isolated worktree</div>
        <div class="session session-running">
          <div class="ses-label">session</div>
          <code class="ses-id">run-20260507-a3f2</code>
          <div class="ses-cli"><code>kanban run #35 --execute --agent codex</code></div>
        </div>
      </div>
    </div>
  </div>

  <div class="flow-arrow">→</div>

  <div class="col col-review">
    <div class="col-head">REVIEW</div>
    <div class="col-body">
      <div class="card">
        <div class="card-title">#31 에러 메시지 개선</div>
        <div class="card-meta">AI CLI 완료 · exit 0</div>
        <div class="card-action pending">→ 사람이 approve 대기</div>
        <div class="session session-review">
          <div class="ses-label">session</div>
          <code class="ses-id">run-20260507-b1c9</code>
          <div class="ses-cli"><code>kanban approve #31</code></div>
        </div>
      </div>
    </div>
  </div>

  <div class="flow-arrow">→</div>

  <div class="col col-done">
    <div class="col-head">DONE</div>
    <div class="col-body">
      <div class="card muted">
        <div class="card-title">#28 README 업데이트</div>
        <div class="card-action done">✅ 완료</div>
        <div class="session session-done">
          <div class="ses-label">session</div>
          <code class="ses-id">run-20260506-d7e1</code>
          <div class="ses-cli">completed: 2026-05-06</div>
        </div>
      </div>
    </div>
  </div>

</div><!-- /board -->

<!-- ══ FAILED ROW ══ -->
<div class="failed-row">
  <div class="failed-tag">FAILED</div>
  <div class="failed-card">
    <div class="card-title">#33 DB 마이그레이션</div>
    <div class="card-action failed">exit non-0 — 변경사항 없음</div>
    <div class="session session-failed">
      <div class="ses-label">session</div>
      <code class="ses-id">run-20260507-f9a0</code>
    </div>
  </div>
  <div class="failed-note"><code>kanban retry #33</code> → READY로 복귀</div>
</div>

<!-- ══ FLOW SUMMARY ══ -->
<div class="flow-summary">
  <div class="flow-summary-title">흐름 요약</div>
  <div class="flow-steps">
    <div>1️⃣ <code>status: TODO → READY</code> (frontmatter 편집)</div>
    <div>2️⃣ <code>kanban run #N --execute --agent codex</code> — session 생성 · AI CLI 실행</div>
    <div>3️⃣ exit 0 + 변경 → REVIEW (session ID 기록)</div>
    <div>4️⃣ <code>kanban approve #N</code> → DONE (session 완료)</div>
    <div>실패 시: <code>kanban retry #N</code> → READY 복귀</div>
  </div>
</div>

<div class="footer">
  <p>
    📦 자산: <a href="kanban-use-case.drawio">.drawio</a> ·
    <a href="kanban-use-case.svg">.svg</a> ·
    <a href="kanban-task-engine-one-page.html">one-page</a>
  </p>
  <p>색상 규칙은 <a href="README.md">docs/design/README.md</a> 참조.</p>
</div>

</body>
</html>
```

- [ ] **Step 2: 브라우저로 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.html
```

확인:
- 5컬럼 (TODO/READY/RUNNING/REVIEW/DONE) 가로 배치, 화살표로 연결
- RUNNING/REVIEW/DONE/FAILED 카드에 session ID와 CLI 명령 명시
- RUNNING 카드: `kanban run #35 --execute --agent codex` (정확한 형태 — `--execute --agent codex` 포함)
- FAILED 행에 `kanban retry #N` 표시
- 흐름 요약 4단계 + 실패 retry
- 1100px viewport에서 텍스트 잘림 없음

- [ ] **Step 3: 커밋**

```bash
git add docs/design/kanban-use-case.html
git commit -m "$(cat <<'EOF'
docs: kanban-use-case.html 신규 — Home Assisted 시나리오

5컬럼 칸반 보드 + FAILED 행. RUNNING/REVIEW/DONE/FAILED 카드에
session ID와 CLI 명령 매핑. 흐름 요약은 실제 CLI 계약(--execute --agent codex)
기준.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — drawio / SVG 동기화

> **Note:** drawio Desktop App이 있으면 GUI로 편집해도 좋고, 없으면 XML 직접 편집. 라벨 일치만 verify-docs.py가 검증함.

### Task 5: one-page.drawio 라벨 동기화

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.drawio`

목표: HTML과 동일한 박스 구성 + 라벨로 변경. 검증 통과 라벨(Vault, Engine, Markdown, Canonical, Recipe, READY, RUNNING, REVIEW, DONE, FAILED, Jira, Worktree, codex, validate-only)은 모두 유지해야 함.

- [ ] **Step 1: 현재 drawio 구조 파악**

```bash
grep -n 'value=' /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.drawio | head -40
```

각 셀의 `value` 속성을 확인하여 어떤 라벨이 어디 있는지 매핑.

- [ ] **Step 2: drawio 라벨 수정**

다음 라벨 변경을 적용 (XML의 `value="..."`를 직접 수정):

| 기존 라벨 (대략) | 새 라벨 |
|---|---|
| `Markdown Issues\n.md + YAML frontmatter\n← SoT\nissues/ · epics/\nregistry.yaml\nactive-recipe.yaml\nruns/ · events/` | `Markdown Issues (.md)\n← Source of Truth\n사람이 직접 읽고 쓰는 파일` |
| `Boards & Templates\nboards/ · templates/` | `Boards (.md)\n어떤 이슈가 어느 컬럼에 있는지` |
| `Recipes\nrecipes/*.yaml\nmode + modules + policy` | `Recipes (.yaml)\n누가 어떤 도구로 실행할지\n예: Codex로 실행 / Jira export만` |
| `packages/core` 박스 (StateMachine, PolicyEngine 등 multiline) | `Core\n상태 전이 · 실행 루프` |
| `packages/schema` 박스 | `Schema\n.md ↔ JSON 계약\nCanonical model` |
| `Adapters + Executor` 박스 (adapter-claude-code, codex-runner 등) | `Adapters\nJira · GitHub · Codex 연결\ncodex-runner` |
| `packages/cli` 박스 | `CLI\nkanban run --execute --agent codex` |
| `recipes/` 박스 (home-assisted.yaml 등) | (이 박스 자체를 삭제 — Engine에 더 이상 노출 안 함) |
| OpenClaw 박스 | `Codex\nHome 실행기` |
| Jira/GitHub 박스들 | `Jira · GitHub\nWork 연동` |

**필수 보존 라벨** (verify-docs.py 라벨 체크 + status drift check 통과 위해):
- `Vault`, `Engine`, `External` (zone titles)
- `Markdown`, `Canonical` (어딘가 등장 필요)
- `Recipe` (예: `Recipes (.yaml)`)
- `TODO`, `READY`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`
- `Jira`
- `Worktree` (어딘가에 — Lifecycle 패널의 `isolated worktree` 등)
- `codex`
- `validate-only` (어딘가에 — 예: Recipe 박스 부속 메모로)
- `SoT` (Source of Truth 표기)
- `IssueStatus (6)` 또는 `VALID_ISSUE_TRANSITIONS (8)` 또는 `8개 전이` 또는 `8 valid transitions` 중 하나 이상

- [ ] **Step 3: Lifecycle 영역 8개 전이 표시**

기존 Panel 1 영역에 다음 라벨이 모두 등장하도록 텍스트/화살표 셀 조정:
- `TODO → READY`, `READY → TODO`
- `READY → RUNNING`
- `RUNNING → REVIEW`, `RUNNING → FAILED`
- `REVIEW → DONE`, `REVIEW → RUNNING`
- `FAILED → READY`
- 메타 라벨 `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)`

(기존 transitions-grid 셀이 이미 8개를 표기하고 있을 가능성 — 그렇다면 보존만 하면 됨.)

- [ ] **Step 4: drawio XML 유효성 확인**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.drawio')"
```

오류 없이 종료되어야 함.

- [ ] **Step 5: 라벨 검증**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 -c "
content = open('docs/design/kanban-task-engine-one-page.drawio').read()
required = ['Vault','Engine','Markdown','Canonical','Recipe','READY','RUNNING','REVIEW','DONE','FAILED','Jira','Worktree','codex','validate-only','SoT']
missing = [l for l in required if l not in content]
print('OK' if not missing else 'MISSING: ' + str(missing))
"
```

`OK` 출력되어야 함.

- [ ] **Step 6: 커밋**

```bash
git add docs/design/kanban-task-engine-one-page.drawio
git commit -m "$(cat <<'EOF'
docs: one-page.drawio HTML 변경에 맞춰 라벨 동기화

Vault 3박스 (Markdown/Boards/Recipes) · Engine 4박스
(Core/Schema/Adapters/CLI) · External 2박스 (Codex/Jira·GitHub).
Lifecycle은 VALID_ISSUE_TRANSITIONS (8) 모두 표기.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: one-page.svg 동기화

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.svg`

목표: drawio와 라벨 일치 + GitHub README SVG Contract 통과.

- [ ] **Step 1: drawio Desktop App에서 export (가능 시)**

drawio Desktop App에서 `kanban-task-engine-one-page.drawio` 열기 → `File → Export as → SVG` → 같은 위치에 덮어쓰기.

GitHub README SVG Contract (docs/design/README.md 참조) 통과를 위해:
- root `<svg>`에 `xmlns`, `viewBox` 포함
- `<title>`과 `<desc>` 포함
- viewBox 전체 덮는 배경 `<rect>`
- 외부 asset / `<script>` / `<foreignObject>` 미사용

- [ ] **Step 2: drawio Desktop App 미사용 시 SVG 직접 편집**

기존 SVG의 `<text>` 노드 value를 drawio와 동일하게 수정:
- 기존 패키지명·클래스명 multiline `<text>` 묶음 → 역할 설명 한두 줄로 단축
- Vault 박스 (Markdown/Boards/Recipes) 텍스트 변경
- Engine 박스 4개 (Core/Schema/Adapters/CLI) 텍스트 변경
- External 2개 (Codex/Jira·GitHub) 텍스트 변경
- Lifecycle: 8개 전이 모두 표기 + `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)`

- [ ] **Step 3: SVG 라벨 검증**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 -c "
content = open('docs/design/kanban-task-engine-one-page.svg').read()
required = ['Vault','Engine','Markdown','Canonical','TODO','READY','RUNNING','REVIEW','DONE','FAILED','Jira','Worktree','codex','validate-only','SoT']
missing = [l for l in required if l not in content]
print('OK' if not missing else 'MISSING: ' + str(missing))
"
```

`OK` 확인.

- [ ] **Step 4: SVG 유효성 확인**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.svg')"
```

오류 없어야 함.

- [ ] **Step 5: verify-docs.py 부분 실행**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 scripts/verify-docs.py
```

`PASS: drawio/svg critical labels are aligned`, `PASS: status.ts status labels and transition count match docs assets` 출력 확인. 다른 항목 (use-case 관련)은 아직 FAIL일 수 있음 — 무시.

- [ ] **Step 6: 커밋**

```bash
git add docs/design/kanban-task-engine-one-page.svg
git commit -m "$(cat <<'EOF'
docs: one-page.svg drawio와 동기화

drawio export 결과로 라벨 일치. status drift / drawio-svg parity check 통과.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: kanban-use-case.drawio 신규 작성

**Files:**
- Create: `docs/design/kanban-use-case.drawio`

목표: 5컬럼 칸반 보드 + FAILED 행. drawio Desktop App에서 작성 또는 XML 직접 작성.

- [ ] **Step 1: drawio XML 템플릿 작성**

다음 내용으로 새 파일 작성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-05-07" agent="kanban-task-engine-design" version="24.0.0">
  <diagram name="Use Case — Home Assisted" id="kanban-use-case-v1">
    <mxGraphModel dx="0" dy="0" grid="10" gridSize="10" guides="1" tooltips="1"
                  connect="1" arrows="1" fold="1" page="1" pageScale="1"
                  pageWidth="1600" pageHeight="900" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>

        <!-- TITLE -->
        <mxCell id="title" value="kanban-task-engine — Use Case (Home Assisted)"
                style="text;html=1;align=left;verticalAlign=middle;fontStyle=1;fontSize=17;fontColor=#1a1a1a;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="30" width="900" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="subtitle" value="Vault의 이슈가 AI CLI에 의해 처리되고, 사람이 최종 승인하는 흐름 · executor: codex"
                style="text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor=#888;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="60" width="900" height="20" as="geometry"/>
        </mxCell>

        <!-- COLUMN HEADERS -->
        <mxCell id="head-todo" value="TODO"
                style="rounded=1;fillColor=#FFF3CD;strokeColor=#E6A817;strokeWidth=2;fontColor=#5c3d00;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="100" width="280" height="32" as="geometry"/>
        </mxCell>
        <mxCell id="head-ready" value="READY"
                style="rounded=1;fillColor=#E8F5E9;strokeColor=#43A047;strokeWidth=2;fontColor=#2e7d32;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="340" y="100" width="280" height="32" as="geometry"/>
        </mxCell>
        <mxCell id="head-running" value="RUNNING"
                style="rounded=1;fillColor=#BBDEFB;strokeColor=#1E88E5;strokeWidth=2;fontColor=#1565C0;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="640" y="100" width="280" height="32" as="geometry"/>
        </mxCell>
        <mxCell id="head-review" value="REVIEW"
                style="rounded=1;fillColor=#FFF3CD;strokeColor=#E6A817;strokeWidth=2;fontColor=#5c3d00;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="940" y="100" width="280" height="32" as="geometry"/>
        </mxCell>
        <mxCell id="head-done" value="DONE"
                style="rounded=1;fillColor=#E8F5E9;strokeColor=#43A047;strokeWidth=2;fontColor=#2e7d32;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="1240" y="100" width="280" height="32" as="geometry"/>
        </mxCell>

        <!-- COLUMN BODIES (background panels) -->
        <mxCell id="body-todo" value=""
                style="rounded=0;fillColor=#fffdf0;strokeColor=#E6A817;strokeWidth=2;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="132" width="280" height="200" as="geometry"/>
        </mxCell>
        <mxCell id="body-ready" value=""
                style="rounded=0;fillColor=#f5fbf5;strokeColor=#43A047;strokeWidth=2;"
                vertex="1" parent="1">
          <mxGeometry x="340" y="132" width="280" height="200" as="geometry"/>
        </mxCell>
        <mxCell id="body-running" value=""
                style="rounded=0;fillColor=#f0f7ff;strokeColor=#1E88E5;strokeWidth=2;"
                vertex="1" parent="1">
          <mxGeometry x="640" y="132" width="280" height="200" as="geometry"/>
        </mxCell>
        <mxCell id="body-review" value=""
                style="rounded=0;fillColor=#fffdf0;strokeColor=#E6A817;strokeWidth=2;"
                vertex="1" parent="1">
          <mxGeometry x="940" y="132" width="280" height="200" as="geometry"/>
        </mxCell>
        <mxCell id="body-done" value=""
                style="rounded=0;fillColor=#f5fbf5;strokeColor=#43A047;strokeWidth=2;"
                vertex="1" parent="1">
          <mxGeometry x="1240" y="132" width="280" height="200" as="geometry"/>
        </mxCell>

        <!-- CARDS -->
        <mxCell id="card-todo" value="#42 캐시 레이어 추가&#10;executor: codex&#10;priority: high"
                style="rounded=0;fillColor=#fff;strokeColor=#ddd;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="55" y="148" width="250" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="card-ready" value="#38 API 타임아웃 수정&#10;executor: codex&#10;↑ frontmatter status: READY"
                style="rounded=0;fillColor=#fff;strokeColor=#ddd;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="355" y="148" width="250" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="card-running" value="#35 로그 포맷 통일&#10;▶ AI CLI 실행 중&#10;isolated worktree&#10;session: run-20260507-a3f2&#10;kanban run #35 --execute --agent codex"
                style="rounded=0;fillColor=#fff;strokeColor=#1E88E5;strokeWidth=2;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="655" y="148" width="250" height="120" as="geometry"/>
        </mxCell>
        <mxCell id="card-review" value="#31 에러 메시지 개선&#10;AI CLI 완료 · exit 0&#10;→ 사람이 approve 대기&#10;session: run-20260507-b1c9&#10;kanban approve #31"
                style="rounded=0;fillColor=#fff;strokeColor=#ddd;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="955" y="148" width="250" height="120" as="geometry"/>
        </mxCell>
        <mxCell id="card-done" value="#28 README 업데이트&#10;✅ 완료&#10;session: run-20260506-d7e1&#10;completed: 2026-05-06"
                style="rounded=0;fillColor=#fff;strokeColor=#ddd;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="1255" y="148" width="250" height="100" as="geometry"/>
        </mxCell>

        <!-- INTER-COLUMN ARROWS -->
        <mxCell id="arr-1" style="endArrow=classic;html=1;strokeColor=#aaa;" edge="1" parent="1" source="head-todo" target="head-ready">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="arr-2" style="endArrow=classic;html=1;strokeColor=#aaa;" edge="1" parent="1" source="head-ready" target="head-running">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="arr-3" style="endArrow=classic;html=1;strokeColor=#aaa;" edge="1" parent="1" source="head-running" target="head-review">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="arr-4" style="endArrow=classic;html=1;strokeColor=#aaa;" edge="1" parent="1" source="head-review" target="head-done">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>

        <!-- FAILED ROW -->
        <mxCell id="failed-tag" value="FAILED"
                style="rounded=1;fillColor=#FFEBEE;strokeColor=#E53935;strokeWidth=2;fontColor=#b71c1c;fontStyle=1;fontSize=12;align=center;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="370" width="120" height="32" as="geometry"/>
        </mxCell>
        <mxCell id="failed-card" value="#33 DB 마이그레이션&#10;exit non-0 — 변경사항 없음&#10;session: run-20260507-f9a0"
                style="rounded=0;fillColor=#fff;strokeColor=#E53935;align=left;verticalAlign=top;fontSize=10;spacingLeft=8;spacingTop=6;whiteSpace=wrap;"
                vertex="1" parent="1">
          <mxGeometry x="180" y="365" width="280" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="failed-note" value="kanban retry #33 → READY로 복귀"
                style="text;html=1;fontSize=11;fontColor=#888;fontStyle=2;"
                vertex="1" parent="1">
          <mxGeometry x="480" y="378" width="320" height="20" as="geometry"/>
        </mxCell>

        <!-- FLOW SUMMARY -->
        <mxCell id="flow-bg" value=""
                style="rounded=1;fillColor=#f0f4ff;strokeColor=#b0c4f0;strokeWidth=1;"
                vertex="1" parent="1">
          <mxGeometry x="40" y="450" width="1480" height="120" as="geometry"/>
        </mxCell>
        <mxCell id="flow-title" value="흐름 요약"
                style="text;html=1;fontStyle=1;fontSize=12;fontColor=#334;"
                vertex="1" parent="1">
          <mxGeometry x="60" y="460" width="200" height="20" as="geometry"/>
        </mxCell>
        <mxCell id="flow-1" value="1️⃣ status: TODO → READY (frontmatter 편집)"
                style="text;html=1;fontSize=11;fontColor=#555;"
                vertex="1" parent="1">
          <mxGeometry x="60" y="485" width="700" height="20" as="geometry"/>
        </mxCell>
        <mxCell id="flow-2" value="2️⃣ kanban run #N --execute --agent codex — session 생성, AI CLI 실행"
                style="text;html=1;fontSize=11;fontColor=#555;"
                vertex="1" parent="1">
          <mxGeometry x="60" y="505" width="900" height="20" as="geometry"/>
        </mxCell>
        <mxCell id="flow-3" value="3️⃣ exit 0 + 변경 → REVIEW (session ID 기록)"
                style="text;html=1;fontSize=11;fontColor=#555;"
                vertex="1" parent="1">
          <mxGeometry x="60" y="525" width="700" height="20" as="geometry"/>
        </mxCell>
        <mxCell id="flow-4" value="4️⃣ kanban approve #N → DONE (session 완료)  /  실패 시 kanban retry #N → READY 복귀"
                style="text;html=1;fontSize=11;fontColor=#555;"
                vertex="1" parent="1">
          <mxGeometry x="60" y="545" width="1300" height="20" as="geometry"/>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- [ ] **Step 2: XML 유효성 + 라벨 확인**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.drawio')"

cd /Users/ddalkak/Projects/kanban-task-engine && python3 -c "
content = open('docs/design/kanban-use-case.drawio').read()
required = ['TODO','READY','RUNNING','REVIEW','DONE','FAILED','codex','kanban run','kanban approve','kanban retry','session','isolated worktree']
missing = [l for l in required if l not in content]
print('OK' if not missing else 'MISSING: ' + str(missing))
"
```

`OK` 확인.

- [ ] **Step 3: 커밋**

```bash
git add docs/design/kanban-use-case.drawio
git commit -m "$(cat <<'EOF'
docs: kanban-use-case.drawio 신규

5컬럼 칸반 보드 + FAILED 행. RUNNING/REVIEW/DONE/FAILED 카드에
session ID와 CLI 매핑. 흐름 요약은 실제 CLI 계약(--execute --agent codex)
기준.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: kanban-use-case.svg 신규 작성

**Files:**
- Create: `docs/design/kanban-use-case.svg`

목표: drawio export 결과 또는 수동 SVG. README embed에 적합한 self-contained SVG (GitHub README SVG Contract 준수).

- [ ] **Step 1: drawio Desktop App export (가능 시)**

drawio Desktop App에서 `kanban-use-case.drawio` 열기 → `File → Export as → SVG` → 같은 위치에 저장.

- [ ] **Step 2: drawio Desktop App 미사용 시 수동 SVG 작성**

다음 템플릿으로 파일 생성 (간소화 — 기본 colored rect + text만):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="ucTitle ucDesc">
  <title id="ucTitle">kanban-task-engine — Use Case (Home Assisted)</title>
  <desc id="ucDesc">Vault 이슈가 AI CLI에 의해 처리되고 사람이 최종 승인하는 칸반 흐름. 5컬럼 (TODO/READY/RUNNING/REVIEW/DONE) + FAILED 행. RUNNING/REVIEW/DONE/FAILED 카드에 session ID와 CLI 명령 매핑.</desc>
  <defs>
    <style>
      .body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;}
      .title{font-size:18px;font-weight:700;fill:#1a1a1a;}
      .sub{font-size:12px;fill:#888;}
      .head{font-size:13px;font-weight:700;}
      .card{font-size:11px;fill:#1a1a1a;}
      .card-meta{font-size:10px;fill:#666;}
      .ses{font-size:10px;fill:#1565C0;font-weight:700;}
      .cli{font-size:10px;fill:#444;font-family:Menlo,Consolas,monospace;}
      .flow{font-size:11px;fill:#555;}
    </style>
  </defs>

  <rect width="1600" height="600" fill="#ffffff"/>

  <text x="40" y="46" class="body title">kanban-task-engine — Use Case (Home Assisted)</text>
  <text x="40" y="68" class="body sub">Vault의 이슈가 AI CLI에 의해 처리되고, 사람이 최종 승인하는 흐름 · executor: codex</text>

  <!-- column headers -->
  <rect x="40" y="100" width="280" height="32" rx="4" fill="#FFF3CD" stroke="#E6A817" stroke-width="2"/>
  <text x="180" y="121" class="body head" fill="#5c3d00" text-anchor="middle">TODO</text>
  <rect x="340" y="100" width="280" height="32" rx="4" fill="#E8F5E9" stroke="#43A047" stroke-width="2"/>
  <text x="480" y="121" class="body head" fill="#2e7d32" text-anchor="middle">READY</text>
  <rect x="640" y="100" width="280" height="32" rx="4" fill="#BBDEFB" stroke="#1E88E5" stroke-width="2"/>
  <text x="780" y="121" class="body head" fill="#1565C0" text-anchor="middle">RUNNING</text>
  <rect x="940" y="100" width="280" height="32" rx="4" fill="#FFF3CD" stroke="#E6A817" stroke-width="2"/>
  <text x="1080" y="121" class="body head" fill="#5c3d00" text-anchor="middle">REVIEW</text>
  <rect x="1240" y="100" width="280" height="32" rx="4" fill="#E8F5E9" stroke="#43A047" stroke-width="2"/>
  <text x="1380" y="121" class="body head" fill="#2e7d32" text-anchor="middle">DONE</text>

  <!-- column bodies -->
  <rect x="40" y="132" width="280" height="200" fill="#fffdf0" stroke="#E6A817" stroke-width="1.5"/>
  <rect x="340" y="132" width="280" height="200" fill="#f5fbf5" stroke="#43A047" stroke-width="1.5"/>
  <rect x="640" y="132" width="280" height="200" fill="#f0f7ff" stroke="#1E88E5" stroke-width="1.5"/>
  <rect x="940" y="132" width="280" height="200" fill="#fffdf0" stroke="#E6A817" stroke-width="1.5"/>
  <rect x="1240" y="132" width="280" height="200" fill="#f5fbf5" stroke="#43A047" stroke-width="1.5"/>

  <!-- TODO card -->
  <rect x="55" y="148" width="250" height="70" fill="#fff" stroke="#ddd"/>
  <text x="65" y="166" class="body card">#42 캐시 레이어 추가</text>
  <text x="65" y="184" class="body card-meta">executor: codex</text>
  <text x="65" y="200" class="body card-meta">priority: high</text>

  <!-- READY card -->
  <rect x="355" y="148" width="250" height="70" fill="#fff" stroke="#ddd"/>
  <text x="365" y="166" class="body card">#38 API 타임아웃 수정</text>
  <text x="365" y="184" class="body card-meta">executor: codex</text>
  <text x="365" y="200" class="body card-meta">↑ frontmatter status: READY</text>

  <!-- RUNNING card -->
  <rect x="655" y="148" width="250" height="150" fill="#fff" stroke="#1E88E5" stroke-width="1.5"/>
  <text x="665" y="166" class="body card">#35 로그 포맷 통일</text>
  <text x="665" y="184" class="body card-meta" fill="#1565C0">▶ AI CLI 실행 중</text>
  <text x="665" y="200" class="body card-meta">isolated worktree</text>
  <text x="665" y="222" class="body ses">session: run-20260507-a3f2</text>
  <text x="665" y="240" class="body cli">kanban run #35 --execute --agent codex</text>

  <!-- REVIEW card -->
  <rect x="955" y="148" width="250" height="150" fill="#fff" stroke="#ddd"/>
  <text x="965" y="166" class="body card">#31 에러 메시지 개선</text>
  <text x="965" y="184" class="body card-meta">AI CLI 완료 · exit 0</text>
  <text x="965" y="200" class="body card-meta" fill="#7a5c00">→ 사람이 approve 대기</text>
  <text x="965" y="222" class="body ses" fill="#7a5c00">session: run-20260507-b1c9</text>
  <text x="965" y="240" class="body cli">kanban approve #31</text>

  <!-- DONE card -->
  <rect x="1255" y="148" width="250" height="120" fill="#fff" stroke="#ddd"/>
  <text x="1265" y="166" class="body card">#28 README 업데이트</text>
  <text x="1265" y="184" class="body card-meta" fill="#2e7d32">✅ 완료</text>
  <text x="1265" y="206" class="body ses" fill="#2e7d32">session: run-20260506-d7e1</text>
  <text x="1265" y="224" class="body cli">completed: 2026-05-06</text>

  <!-- FAILED row -->
  <rect x="40" y="370" width="120" height="32" rx="4" fill="#FFEBEE" stroke="#E53935" stroke-width="2"/>
  <text x="100" y="391" class="body head" fill="#b71c1c" text-anchor="middle">FAILED</text>
  <rect x="180" y="365" width="290" height="60" fill="#fff" stroke="#E53935"/>
  <text x="195" y="384" class="body card">#33 DB 마이그레이션</text>
  <text x="195" y="402" class="body card-meta" fill="#b71c1c">exit non-0 — 변경사항 없음</text>
  <text x="195" y="418" class="body ses" fill="#c62828">session: run-20260507-f9a0</text>
  <text x="490" y="394" class="body sub" font-style="italic">kanban retry #33 → READY로 복귀</text>

  <!-- flow summary -->
  <rect x="40" y="450" width="1480" height="125" rx="4" fill="#f0f4ff" stroke="#b0c4f0"/>
  <text x="60" y="475" class="body head" fill="#334">흐름 요약</text>
  <text x="60" y="498" class="body flow">1️⃣ status: TODO → READY (frontmatter 편집)</text>
  <text x="60" y="518" class="body flow">2️⃣ kanban run #N --execute --agent codex — session 생성, AI CLI 실행</text>
  <text x="60" y="538" class="body flow">3️⃣ exit 0 + 변경 → REVIEW (session ID 기록)</text>
  <text x="60" y="558" class="body flow">4️⃣ kanban approve #N → DONE (session 완료)  /  실패 시 kanban retry #N → READY 복귀</text>
</svg>
```

- [ ] **Step 3: SVG 검증**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('/Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.svg')"

cd /Users/ddalkak/Projects/kanban-task-engine && python3 -c "
content = open('docs/design/kanban-use-case.svg').read()
required = ['TODO','READY','RUNNING','REVIEW','DONE','FAILED','codex','kanban run','kanban approve','kanban retry','session','isolated worktree']
missing = [l for l in required if l not in content]
print('OK' if not missing else 'MISSING: ' + str(missing))
"
```

`OK` 확인.

- [ ] **Step 4: 브라우저 열어 시각 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.svg
```

5컬럼 + FAILED 행 + 흐름 요약 모두 보이고 텍스트 잘림 없는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add docs/design/kanban-use-case.svg
git commit -m "$(cat <<'EOF'
docs: kanban-use-case.svg 신규

drawio export 또는 수동 작성. self-contained SVG로 GitHub README
embed 가능. 5컬럼 칸반 + FAILED + 흐름 요약. 라벨 검증 통과.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — README & docs/design/README 업데이트

### Task 9: README.md use-case 섹션 추가

**Files:**
- Modify: `README.md`

목표: architecture 섹션 다음에 use-case 섹션 추가. SVG embed.

- [ ] **Step 1: 아키텍처 섹션 위치 파악**

```bash
grep -n "🏛️ 아키텍처\|🎨 핵심 설계 포인트\|🏠 Modes" /Users/ddalkak/Projects/kanban-task-engine/README.md
```

- [ ] **Step 2: 아키텍처 섹션과 다음 섹션 사이에 use-case 섹션 삽입**

`## 🎨 핵심 설계 포인트` (또는 그 다음 섹션) 직전에 다음 markdown 삽입:

```markdown
## 🎬 Use Case — Home Assisted 실행

<p align="center">
  <a href="docs/design/kanban-use-case.svg">
    <img src="docs/design/kanban-use-case.svg" alt="kanban-task-engine use case kanban board showing TODO READY RUNNING REVIEW DONE FAILED columns with session IDs and CLI commands" width="100%" />
  </a>
</p>

> 💡 인터랙티브 버전: [`docs/design/kanban-use-case.html`](docs/design/kanban-use-case.html)을 브라우저로 여세요. RUNNING/REVIEW/DONE/FAILED 카드에 `kanban run --execute --agent codex` 등 실제 CLI 명령과 session ID가 매핑되어 있습니다.

<br/>

<img src="docs/design/divider.svg" alt="" width="100%" />

<br/>

```

- [ ] **Step 3: README 검증**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 -c "
content = open('README.md').read()
assert 'kanban-use-case.svg' in content, 'use-case SVG embed missing'
assert 'kanban-use-case.html' in content, 'use-case HTML link missing'
assert 'kanban-task-engine-one-page.svg' in content, 'one-page SVG embed missing'
print('OK')
"
```

`OK` 확인.

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: README에 Use Case 섹션 추가 — kanban-use-case.svg embed

architecture 섹션 다음에 Home Assisted 칸반 흐름을 SVG로 보여주는
섹션 추가. 인터랙티브 HTML 버전 링크 포함.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: docs/design/README.md 업데이트

**Files:**
- Modify: `docs/design/README.md`

목표: 새 use-case 자산 등록.

- [ ] **Step 1: 파일 목록 표 갱신**

`## 파일 목록` 섹션의 표를 다음으로 교체:

```markdown
| 파일 | 설명 |
|---|---|
| `kanban-task-engine-one-page.drawio` | one-page draw.io 편집용 소스 (mxGraph XML) |
| `kanban-task-engine-one-page.svg` | one-page README embed 및 full-size view용 SVG |
| `kanban-task-engine-one-page.html` | one-page 인터랙티브 HTML 버전 |
| `kanban-use-case.drawio` | use-case (Home Assisted) draw.io 편집용 소스 |
| `kanban-use-case.svg` | use-case README embed 및 full-size view용 SVG |
| `kanban-use-case.html` | use-case 인터랙티브 HTML 버전 |
| `kanban-task-engine-architecture-overview.svg` | (보조 compact overview SVG, 수동 작성) |
```

- [ ] **Step 2: 색상 규칙 표는 그대로 유지**

`## 색상 규칙` 표는 변경 없음 (기존 5행 유지). 모든 그림이 같은 색상 시스템을 사용함을 확인하는 정도.

- [ ] **Step 3: GitHub README SVG Contract 섹션은 그대로 유지**

기존 contract 항목은 모두 use-case.svg에도 적용됨. 별도 추가 항목 없음.

- [ ] **Step 4: 커밋**

```bash
git add docs/design/README.md
git commit -m "$(cat <<'EOF'
docs: docs/design/README에 use-case 자산 3개 등록

kanban-use-case.{drawio,svg,html} 추가. 색상 규칙 및 SVG contract는
모든 자산에 동일 적용.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — verify_docs 확장 + 최종 검증

### Task 11: verify_docs/cli.py에 use-case 파일 검증 추가

**Files:**
- Modify: `scripts/verify_docs/cli.py`

목표: 필수 파일 목록 + use-case drawio/svg parity 함수 추가.

- [ ] **Step 1: `check_files_exist`에 use-case 파일 추가**

기존 `required` 리스트를 다음으로 교체:

```python
    required = [
        root / "README.md",
        root / "docs/design/kanban-task-engine-one-page.drawio",
        root / "docs/design/kanban-task-engine-one-page.svg",
        root / "docs/design/kanban-use-case.drawio",
        root / "docs/design/kanban-use-case.svg",
        root / "docs/design/README.md",
        root / "packages/schema/src/status.ts",
    ]
```

- [ ] **Step 2: use-case parity 함수 추가**

`check_drawio_svg_parity` 함수 다음에 다음 함수를 추가:

```python
def check_use_case_drawio_svg_parity(root: Path) -> bool:
    drawio_path = root / "docs/design/kanban-use-case.drawio"
    svg_path = root / "docs/design/kanban-use-case.svg"
    if not drawio_path.exists() or not svg_path.exists():
        print("FAIL: kanban-use-case drawio or svg is missing")
        return False
    drawio = drawio_path.read_text(encoding="utf-8")
    svg = svg_path.read_text(encoding="utf-8")
    critical = [
        "TODO", "READY", "RUNNING", "REVIEW", "DONE", "FAILED",
        "codex", "session", "kanban run", "kanban approve", "kanban retry",
        "isolated worktree",
    ]
    missing = [label for label in critical if label not in drawio or label not in svg]
    if missing:
        print(f"FAIL: use-case drawio/svg critical label drift: {missing}")
        return False
    print("PASS: use-case drawio/svg critical labels are aligned")
    return True


def check_use_case_drawio_xml_valid(root: Path) -> bool:
    drawio = root / "docs/design/kanban-use-case.drawio"
    if not drawio.exists():
        print("FAIL: kanban-use-case.drawio is missing")
        return False
    content = drawio.read_text(encoding="utf-8")
    try:
        drawio_root = ET.fromstring(content)
    except ET.ParseError as exc:
        print(f"FAIL: use-case draw.io XML parse error: {exc}")
        return False
    if strip_namespace(drawio_root.tag) != "mxfile":
        print("FAIL: use-case .drawio root element must be <mxfile>")
        return False
    print("PASS: use-case draw.io XML is structurally valid")
    return True
```

- [ ] **Step 3: `main()` 함수의 results 리스트에 새 체크 호출 추가**

`main()` 함수 (cli.py 하단)의 `results = [...]` 리스트에 두 항목 추가. 기존 형태:

```python
    results = [
        check_files_exist(root),
        check_readme_links(root),
        check_internal_links(root),
        check_diagram_labels(root),
        check_svg_validity(root),
        check_svg_labels(root),
        check_svg_rendering_contract(root),
        check_drawio_svg_parity(root),
        check_status_truth(root),
        check_architecture_truth(root),
        check_readme_text_version(root),
        check_drawio_xml_valid(root),
    ]
```

다음 형태로 변경 (마지막 두 줄 추가):

```python
    results = [
        check_files_exist(root),
        check_readme_links(root),
        check_internal_links(root),
        check_diagram_labels(root),
        check_svg_validity(root),
        check_svg_labels(root),
        check_svg_rendering_contract(root),
        check_drawio_svg_parity(root),
        check_status_truth(root),
        check_architecture_truth(root),
        check_readme_text_version(root),
        check_drawio_xml_valid(root),
        check_use_case_drawio_xml_valid(root),
        check_use_case_drawio_svg_parity(root),
    ]
```

- [ ] **Step 4: 실행 검증**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 scripts/verify-docs.py
```

새 체크 두 개가 PASS여야 함:
```
PASS: use-case draw.io XML is structurally valid
PASS: use-case drawio/svg critical labels are aligned
```

(다른 항목도 모두 PASS여야 최종 통과)

- [ ] **Step 5: 커밋**

```bash
git add scripts/verify_docs/cli.py
git commit -m "$(cat <<'EOF'
docs(verify): use-case 자산 검증 추가

check_use_case_drawio_xml_valid + check_use_case_drawio_svg_parity 추가.
필수 파일 목록에 kanban-use-case.{drawio,svg} 포함.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: verify_docs/readme.py에 use-case embed 검증 추가

**Files:**
- Modify: `scripts/verify_docs/readme.py`

목표: README가 use-case.svg를 embed하는지 + use-case.html 링크가 있는지 검증.

- [ ] **Step 1: `check_readme_links`에 use-case 검증 추가**

`check_readme_links` 함수의 issues 추가 블록에 다음을 추가:

```python
    if "kanban-use-case.svg" not in readme:
        issues.append("README must reference kanban-use-case.svg")
    if "kanban-use-case.html" not in readme:
        issues.append("README must link to kanban-use-case.html")
```

- [ ] **Step 2: `check_internal_links`에 use-case 자산 검증 추가**

`check_internal_links` 함수에 다음을 추가:

```python
    if "kanban-use-case.drawio" not in content:
        issues.append("docs/design/README.md must reference kanban-use-case.drawio")
    if "kanban-use-case.svg" not in content:
        issues.append("docs/design/README.md must reference kanban-use-case.svg")
    if "kanban-use-case.html" not in content:
        issues.append("docs/design/README.md must reference kanban-use-case.html")
```

- [ ] **Step 3: 실행 검증**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 scripts/verify-docs.py
```

`PASS: README link/content are valid` 및 `PASS: Internal docs links are valid` 출력 확인.

- [ ] **Step 4: 커밋**

```bash
git add scripts/verify_docs/readme.py
git commit -m "$(cat <<'EOF'
docs(verify): README use-case embed/link 검증 추가

check_readme_links: kanban-use-case.svg embed, kanban-use-case.html 링크.
check_internal_links: docs/design/README.md에 3개 자산 등록 검증.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: 최종 검증 + GitHub render 확인

목표: verify-docs.py 전체 통과 + GitHub render preview 정상.

- [ ] **Step 1: verify-docs.py 전체 통과 확인**

```bash
cd /Users/ddalkak/Projects/kanban-task-engine && python3 scripts/verify-docs.py
```

기대 출력 (모두 PASS):
```
PASS: All required files exist
PASS: Diagram contains all required labels
PASS: drawio/svg critical labels are aligned
PASS: Architecture package labels and Codex executor labels are true
PASS: draw.io XML is structurally valid
PASS: status.ts status labels and transition count match docs assets
PASS: README link/content are valid
PASS: Internal docs links are valid
PASS: README text version contains architecture labels
PASS: SVG validity (one-page)
PASS: SVG labels (one-page)
PASS: SVG rendering contract (one-page)
PASS: use-case draw.io XML is structurally valid
PASS: use-case drawio/svg critical labels are aligned
```

만약 FAIL이 있다면 해당 task로 돌아가 수정. 통과 후 다음 step.

- [ ] **Step 2: 8개 전이 시각 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.html
```

다음 8개 전이가 모두 시각적으로 식별 가능해야 함:
1. TODO → READY (forward)
2. READY → TODO (reverse)
3. READY → RUNNING (forward)
4. RUNNING → REVIEW (forward)
5. RUNNING → FAILED (forward, 실패 분기)
6. REVIEW → DONE (forward)
7. REVIEW → RUNNING (reverse, retry)
8. FAILED → READY (reverse, retry)

- [ ] **Step 3: use-case CLI 정확성 확인**

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.html
```

- RUNNING 카드: `kanban run #35 --execute --agent codex` (정확)
- REVIEW 카드: `kanban approve #31`
- FAILED 행: `kanban retry #33`
- 흐름 요약: 4단계 + 실패 retry 모두 명시

- [ ] **Step 4: GitHub render simulation**

브라우저로 SVG를 직접 열어서 README embed가 정상 표시되는지 확인:

```bash
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-task-engine-one-page.svg
open /Users/ddalkak/Projects/kanban-task-engine/docs/design/kanban-use-case.svg
```

두 SVG 모두 단독으로 열었을 때 텍스트/박스 모두 정상 렌더되는지 확인 (외부 의존 없음).

- [ ] **Step 5: 테스트 commit (없음 — 검증만)**

이 task는 검증 단계로, 새 commit 없음. 만약 수정 사항이 발견되면 해당 task에 추가 step으로 돌아감.

- [ ] **Step 6: 최종 정리 commit (선택적)**

만약 작은 수정 (오타, lint) 이 있다면:

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: visual docs redesign — 최종 검증 후 정리

verify-docs.py 전체 통과 확인. 8개 전이 시각화 + use-case CLI 매핑
검증 완료.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

작업 완료 시 다음 모두 ✓ 인지 확인:

- [ ] one-page.html: Vault 3박스 + Engine 4박스 + External 2박스
- [ ] one-page.html: 8개 전이 모두 식별 가능 + `IssueStatus (6) · VALID_ISSUE_TRANSITIONS (8)` 표기
- [ ] one-page.html: Panel 2/3 제거됨, footer 단순화됨
- [ ] kanban-use-case.html: 5컬럼 + FAILED 행
- [ ] kanban-use-case.html: RUNNING 카드에 `kanban run #N --execute --agent codex`
- [ ] kanban-use-case.html: REVIEW 카드에 `kanban approve #N`
- [ ] kanban-use-case.html: FAILED 행에 `kanban retry #N`
- [ ] one-page.drawio/svg: HTML과 라벨 동기화 + 필수 라벨 모두 포함
- [ ] kanban-use-case.drawio/svg: 신규 생성 + 필수 라벨 모두 포함
- [ ] README.md: use-case 섹션 추가 (SVG embed + HTML 링크)
- [ ] docs/design/README.md: use-case 자산 3개 등록
- [ ] verify_docs/cli.py: use-case XML/parity 검증 함수 + main에서 호출
- [ ] verify_docs/readme.py: use-case embed/링크 검증 추가
- [ ] `python3 scripts/verify-docs.py` 전체 PASS
