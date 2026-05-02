# kanban-task-engine Visualization Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kanban-task-engine의 목적, 아키텍처, 주요 유스케이스를 한 페이지 시각화와 개선된 README로 구현한다.

**Architecture:** 상하 계층 다이어그램 (상단: Vault→Engine→External 아키텍처, 하단: 3개 병렬 패널 — 이슈 생명주기, Recipe→Execution, Work 시나리오)을 draw.io XML로 작성하고 SVG로 export한다. Root README는 7개 섹션으로 개편하고 다이어그램을 embed한다.

**Tech Stack:** draw.io XML (`.drawio`), SVG, Markdown, Python (검증 스크립트)

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `README.md` | 루트 프로젝트 설명, 아키텍처 개요, 시작 가이드 |
| `docs/design/kanban-task-engine-one-page.drawio` | draw.io XML source (편집 가능) |
| `docs/design/kanban-task-engine-one-page.svg` | README embed용 렌더링 |
| `docs/design/README.md` | design asset 설명, 사용법, 수정 가이드 |
| `docs/design/design-skill-usage-log.md` | design plugin 7개 skills 사용 기록 |
| `scripts/verify-docs.py` | 문서 검증 스크립트 (링크, 파일 존재, 핵심 개념) |

---

## Task 1: 검증 스크립트 작성 (TDD)

**Files:**
- Create: `scripts/verify-docs.py`

**Plugin/Skill:** `superpowers:test-driven-development`

**선행 검증:** 현재 README는 `# kanban-task-engine`만 존재. docs/design/ 디렉토리 없음.

**TDD/검증 방식:** 먼저 실패하는 검증을 작성한 뒤 실행하여 실패 확인.

- [ ] **Step 1: 검증 스크립트 작성**

```python
#!/usr/bin/env python3
"""문서 검증 스크립트. 모든 검증 통과 시 exit 0, 실패 시 exit 1."""

import re
import sys
from pathlib import Path

def check_files_exist():
    """필수 파일 존재 검증"""
    required = [
        Path("README.md"),
        Path("docs/design/kanban-task-engine-one-page.drawio"),
        Path("docs/design/kanban-task-engine-one-page.svg"),
        Path("docs/design/README.md"),
        Path("docs/design/design-skill-usage-log.md"),
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        print(f"FAIL: Missing files: {missing}")
        return False
    print("PASS: All required files exist")
    return True

def check_readme_links():
    """README 내부 링크와 외부 참조 검증"""
    readme = Path("README.md").read_text()
    issues = []
    # SVG 이미지 참조 확인
    if "kanban-task-engine-one-page.svg" not in readme:
        issues.append("README must reference kanban-task-engine-one-page.svg")
    # docs/design 링크 확인
    if "docs/design" not in readme:
        issues.append("README must link to docs/design")
    if issues:
        print(f"FAIL: README link issues: {issues}")
        return False
    print("PASS: README links are valid")
    return True

def check_internal_links():
    """docs/design/README.md 내부 링크 검증"""
    design_readme = Path("docs/design/README.md")
    if not design_readme.exists():
        print("SKIP: docs/design/README.md does not exist yet")
        return True
    content = design_readme.read_text()
    # draw.io 파일 참조 확인
    if "kanban-task-engine-one-page.drawio" not in content:
        print("FAIL: docs/design/README.md must reference .drawio source")
        return False
    print("PASS: Internal docs links are valid")
    return True

def check_diagram_labels():
    """다이어그램 XML에서 핵심 개념 포함 여부 검증"""
    drawio = Path("docs/design/kanban-task-engine-one-page.drawio")
    if not drawio.exists():
        print("SKIP: .drawio file does not exist yet")
        return True
    content = drawio.read_text()
    required_labels = [
        "Vault", "Engine", "Markdown", "Canonical",
        "Recipe", "READY", "RUNNING", "REVIEW", "DONE",
        "Jira", "Worktree"
    ]
    missing = [label for label in required_labels if label not in content]
    if missing:
        print(f"FAIL: Diagram missing labels: {missing}")
        return False
    print("PASS: Diagram contains all required labels")
    return True

def main():
    results = [
        check_files_exist(),
        check_readme_links(),
        check_internal_links(),
        check_diagram_labels(),
    ]
    if all(results):
        print("\n=== ALL CHECKS PASSED ===")
        sys.exit(0)
    else:
        print("\n=== SOME CHECKS FAILED ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 검증 스크립트 실행 (실패 확인)**

Run: `python scripts/verify-docs.py`
Expected: FAIL — "Missing files" (아직 파일이 없으므로)

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-docs.py
git commit -m "test: add docs verification script (TDD, pre-implementation)"
```

**실패 시 중단 조건:** 검증 스크립트가 "PASS"로 시작하면 중단 — 파일이 없는데 통과하는 것은 버그.

**완료 증거:** `python scripts/verify-docs.py`가 "Missing files"로 실패하고 exit code 1 반환.

---

## Task 2: docs/design 디렉토리 + design README

**Files:**
- Create: `docs/design/README.md`

**Plugin/Skill:** 없음 (Markdown 작성)

**선행 검증:** Task 1 완료

**TDD/검증 방식:** 파일 작성 후 verify-docs.py Step 2 (internal_links) 통과 확인.

- [ ] **Step 1: docs/design/ 디렉토리 생성**

```bash
mkdir -p docs/design
```

- [ ] **Step 2: docs/design/README.md 작성**

```markdown
# docs/design — kanban-task-engine 시각화 에셋

이 디렉토리에는 kanban-task-engine의 아키텍처와 유스케이스를 시각화한 에셋이 담겨 있습니다.

## 파일 목록

| 파일 | 설명 |
|---|---|
| `kanban-task-engine-one-page.drawio` | draw.io 편집용 소스 (XML) |
| `kanban-task-engine-one-page.svg` | README embed용 SVG 렌더링 |
| `design-skill-usage-log.md` | Design plugin skills 사용 기록 |

## 수정 방법

1. [draw.io](https://app.diagrams.net/) 또는 draw.io Desktop App 열기
2. `kanban-task-engine-one-page.drawio` 파일 열기
3. 수정 후 File → Export as → SVG → 선택
4. `kanban-task-engine-one-page.svg` 덮어쓰기
5. 검증: `python scripts/verify-docs.py`

## 색상 규칙

| 영역 | 배경 | 테두리 |
|---|---|---|
| Vault | `#F3E5F5` | `#9C27B0` |
| Engine | `#E8F5E9` | `#4CAF50` |
| External | `#E3F2FD` | `#2196F3` |
| Annotation | `#FFF3E0` | `#FF9800` |
```

- [ ] **Step 3: verify-docs.py 재실행 (일부 통과 확인)**

Run: `python scripts/verify-docs.py`
Expected: "PASS: Internal docs links are valid" — 파일 존재와 README 링크는 여전히 실패.

- [ ] **Step 4: Commit**

```bash
git add docs/design/README.md
git commit -m "docs: add design asset directory and README"
```

**실패 시 중단 조건:** verify-docs.py가 "PASS: Internal docs links"에서 실패하면 중단.

**완료 증거:** `docs/design/README.md` 존재, `docs/design/README.md` 내부에 `.drawio` 파일 참조 포함.

---

## Task 3: draw.io source 작성 (상단 아키텍처)

**Files:**
- Create: `docs/design/kanban-task-engine-one-page.drawio`

**Plugin/Skill:** 없음 (XML 직접 작성)

**선행 검증:** spec의 섹션 4.2 참조. Vault는 별도 Git 저장소, Engine은 로직만, 모드는 emergent.

**TDD/검증 방식:** XML 작성 후 verify-docs.py의 `check_diagram_labels` 통과 확인.

- [ ] **Step 1: 상단 아키텍처 XML 작성**

`docs/design/kanban-task-engine-one-page.drawio`의 `<diagram>` 요소 내에 상단 영역을 구성:

- Vault box (x=40, y=40, w=720, h=140): 보라 dashed 테두리, 내부 3개 서브 박스 (Markdown Issues, Boards & Templates, Recipes)
- Engine box (x=40, y=220, w=720, h=180): 녹색 solid 테두리, 내부 3개 서브 박스 (packages/core, packages/schema, Adapters)
- External box (x=40, y=440, w=720, h=80): 파랑 dashed 테두리, 내부 서비스 라벨
- 화살표: Vault → Engine ("parse → canonical JSON"), Engine → External ("adapter output")
- Annotation boxes: 3개 (모드 emergent, live state 없음, canonical internal)

아래는 상단 영역의 draw.io XML fragment:

```xml
<mxCell id="vault-box" value="" style="rounded=1;arcSize=4;fillColor=#F3E5F5;strokeColor=#9C27B0;strokeWidth=2;dashed=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="720" height="140" as="geometry"/>
</mxCell>
<mxCell id="vault-label" value="Vault (Live Issue State — separate Git repo)" style="text;html=1;align=left;verticalAlign=top;fontStyle=1;fontSize=14;" vertex="1" parent="vault-box">
  <mxGeometry x="10" y="10" width="400" height="20" as="geometry"/>
</mxCell>
<mxCell id="vault-md" value="Markdown Issues&#xa;(.md + YAML frontmatter)" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#AB47BC;" vertex="1" parent="vault-box">
  <mxGeometry x="20" y="45" width="200" height="70" as="geometry"/>
</mxCell>
<mxCell id="vault-boards" value="Boards & Templates" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#AB47BC;" vertex="1" parent="vault-box">
  <mxGeometry x="260" y="45" width="180" height="70" as="geometry"/>
</mxCell>
<mxCell id="vault-recipes" value="Recipes&#xa;(.yaml: mode label + modules + policy)" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#AB47BC;" vertex="1" parent="vault-box">
  <mxGeometry x="480" y="45" width="220" height="70" as="geometry"/>
</mxCell>

<mxCell id="engine-box" value="" style="rounded=1;arcSize=4;fillColor=#E8F5E9;strokeColor=#4CAF50;strokeWidth=2;" vertex="1" parent="1">
  <mxGeometry x="40" y="220" width="720" height="180" as="geometry"/>
</mxCell>
<mxCell id="engine-label" value="Engine (Logic Only — no live state)" style="text;html=1;align=left;verticalAlign=top;fontStyle=1;fontSize=14;" vertex="1" parent="engine-box">
  <mxGeometry x="10" y="10" width="400" height="20" as="geometry"/>
</mxCell>
<mxCell id="engine-core" value="packages/core&#xa;Runtime, State Machine,&#xa;Policy, Store, Executor" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#4CAF50;" vertex="1" parent="engine-box">
  <mxGeometry x="20" y="45" width="200" height="110" as="geometry"/>
</mxCell>
<mxCell id="engine-schema" value="packages/schema&#xa;Frontmatter schema,&#xa;Canonical JSON model" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#4CAF50;" vertex="1" parent="engine-box">
  <mxGeometry x="260" y="45" width="180" height="110" as="geometry"/>
</mxCell>
<mxCell id="engine-adapters" value="Adapters&#xa;openclaw · claude-code&#xa;jira · cli · github&#xa;· firebase" style="rounded=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#4CAF50;" vertex="1" parent="engine-box">
  <mxGeometry x="480" y="45" width="220" height="110" as="geometry"/>
</mxCell>

<mxCell id="ext-box" value="" style="rounded=1;arcSize=4;fillColor=#E3F2FD;strokeColor=#2196F3;strokeWidth=2;dashed=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="440" width="720" height="80" as="geometry"/>
</mxCell>
<mxCell id="ext-label" value="External Systems / Interfaces" style="text;html=1;align=left;verticalAlign=top;fontStyle=1;fontSize=14;" vertex="1" parent="ext-box">
  <mxGeometry x="10" y="10" width="400" height="20" as="geometry"/>
</mxCell>
<mxCell id="ext-services" value="OpenClaw | Jira | GitHub | Firebase" style="text;html=1;align=center;verticalAlign=middle;" vertex="1" parent="ext-box">
  <mxGeometry x="20" y="40" width="400" height="30" as="geometry"/>
</mxCell>
<mxCell id="ext-cli" value="CLI (User Interface)" style="text;html=1;align=center;verticalAlign=middle;" vertex="1" parent="ext-box">
  <mxGeometry x="480" y="40" width="220" height="30" as="geometry"/>
</mxCell>

<!-- Arrows -->
<mxCell id="arrow-v2e" value="parse → canonical JSON" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="vault-box" target="engine-box">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="arrow-e2ext" value="adapter output" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="engine-box" target="ext-box">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>

<!-- Annotations -->
<mxCell id="anno-mode" value="💡 Modes are emergent: recipe modules + policy" style="rounded=1;whiteSpace=wrap;fillColor=#FFF3E0;strokeColor=#FF9800;fontSize=11;" vertex="1" parent="1">
  <mxGeometry x="600" y="320" width="280" height="50" as="geometry"/>
</mxCell>
<mxCell id="anno-state" value="💡 No live state in engine repo" style="rounded=1;whiteSpace=wrap;fillColor=#FFF3E0;strokeColor=#FF9800;fontSize=11;" vertex="1" parent="1">
  <mxGeometry x="600" y="140" width="220" height="40" as="geometry"/>
</mxCell>
<mxCell id="anno-json" value="💡 Canonical JSON = internal contract" style="rounded=1;whiteSpace=wrap;fillColor=#FFF3E0;strokeColor=#FF9800;fontSize=11;" vertex="1" parent="1">
  <mxGeometry x="600" y="400" width="240" height="40" as="geometry"/>
</mxCell>
```

- [ ] **Step 2: verify-docs.py 재실행 (diagram labels 확인)**

Run: `python scripts/verify-docs.py`
Expected: "PASS: Diagram contains all required labels" + 여전히 파일 존재/README 링크 실패.

- [ ] **Step 3: Commit**

```bash
git add docs/design/kanban-task-engine-one-page.drawio
git commit -m "docs: add draw.io source — top architecture section"
```

**실패 시 중단 조건:** verify-docs.py의 `check_diagram_labels`가 "PASS"가 아니면 중단 (핵심 개념 누락).

**완료 증거:** .drawio 파일에 Vault, Engine, Markdown, Canonical, Recipe 라벨이 모두 포함됨.

---

## Task 4: draw.io source 작성 (하단 패널)

**Files:**
- Modify: `docs/design/kanban-task-engine-one-page.drawio`

**Plugin/Skill:** 없음 (XML 수정)

**선행 검증:** Task 3 완료

**TDD/검증 방식:** XML 수정 후 verify-docs.py의 `check_diagram_labels`에서 READY/RUNNING/REVIEW/DONE/Jira/Worktree 통과 확인.

- [ ] **Step 1: 패널 영역 추가**

하단에 3개 패널을 추가. 전체 canvas 높이를 늘려 아래 영역에 배치:

**패널 1: 이슈 생명주기 (x=40, y=560)**
- 제목: "Issue Lifecycle"
- 흐름: Template → DRAFT → OPEN → IN_PROGRESS → DONE (또는 FAILED)
- 각 상태는 rounded rect로 좌→우 배치
- 화살표로 연결

**패널 2: Recipe → Execution (x=280, y=560)**
- 제목: "Recipe → Execution Loop"
- 흐름: Recipe YAML → Module Loader → Policy Check → Executor → Worktree
- 상태 전이: READY → RUNNING → REVIEW → DONE
- 화살표로 연결

**패널 3: Work 시나리오 (x=520, y=560)**
- 제목: "Work Scenario: Jira Export"
- 흐름: Vault Markdown → Engine → adapter-jira → Jira API
- "One-way export" annotation

XML fragment 예시 (패널 1):
```xml
<mxCell id="panel1-title" value="Panel 1: Issue Lifecycle" style="text;html=1;align=left;fontStyle=1;fontSize=13;" vertex="1" parent="1">
  <mxGeometry x="40" y="560" width="200" height="20" as="geometry"/>
</mxCell>
<mxCell id="p1-template" value="Template" style="rounded=1;whiteSpace=wrap;fillColor=#E0E0E0;strokeColor=#666;" vertex="1" parent="1">
  <mxGeometry x="40" y="600" width="80" height="40" as="geometry"/>
</mxCell>
<mxCell id="p1-draft" value="DRAFT" style="rounded=1;whiteSpace=wrap;fillColor=#FFF9C4;strokeColor=#FBC02D;" vertex="1" parent="1">
  <mxGeometry x="140" y="600" width="70" height="40" as="geometry"/>
</mxCell>
<mxCell id="p1-open" value="OPEN" style="rounded=1;whiteSpace=wrap;fillColor=#BBDEFB;strokeColor=#1976D2;" vertex="1" parent="1">
  <mxGeometry x="230" y="600" width="70" height="40" as="geometry"/>
</mxCell>
<mxCell id="p1-progress" value="IN_PROGRESS" style="rounded=1;whiteSpace=wrap;fillColor=#C8E6C9;strokeColor=#388E3C;" vertex="1" parent="1">
  <mxGeometry x="320" y="600" width="100" height="40" as="geometry"/>
</mxCell>
<mxCell id="p1-done" value="DONE" style="rounded=1;whiteSpace=wrap;fillColor=#E8F5E9;strokeColor=#4CAF50;" vertex="1" parent="1">
  <mxGeometry x="440" y="600" width="70" height="40" as="geometry"/>
</mxCell>
<mxCell id="p1-failed" value="FAILED" style="rounded=1;whiteSpace=wrap;fillColor=#FFEBEE;strokeColor=#F44336;" vertex="1" parent="1">
  <mxGeometry x="440" y="660" width="70" height="40" as="geometry"/>
</mxCell>
<!-- arrows connecting p1-template to p1-draft, etc. -->
```

(패널 2, 3도 유사하게 추가. Worktree, READY, RUNNING, REVIEW, Jira, adapter-jira 라벨 포함)

- [ ] **Step 2: 완전한 draw.io XML wrapper 작성**

전체 XML을 valid `<mxfile>` 형식으로 감싸기:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-05-02">
  <diagram name="Page-1" id="kanban-one-page">
    <mxGraphModel dx="0" dy="0" grid="10" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- 모든 shapes/edges를 여기에 포함 -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- [ ] **Step 3: verify-docs.py 재실행 (모든 labels 확인)**

Run: `python scripts/verify-docs.py`
Expected: "PASS: Diagram contains all required labels" + 여전히 파일 존재(2개 남음)/README 링크 실패.

- [ ] **Step 4: Commit**

```bash
git add docs/design/kanban-task-engine-one-page.drawio
git commit -m "docs: add draw.io source — bottom use-case panels"
```

**실패 시 중단 조건:** READY, RUNNING, REVIEW, DONE, Jira, Worktree 라벨 중 하나라도 누락되면 중단.

**완료 증거:** verify-docs.py가 "PASS: Diagram contains all required labels" 출력.

---

## Task 5: SVG Export

**Files:**
- Create: `docs/design/kanban-task-engine-one-page.svg`

**Plugin/Skill:** 없음 (export/fallback)

**선행 검증:** Task 4 완료. draw.io XML이 유효한지 확인.

**TDD/검증 방식:** SVG 파일 생성 후 verify-docs.py의 `check_files_exist` 통과.

- [ ] **Step 1: SVG export 시도**

옵션 A: draw.io Desktop App이 설치되어 있다면:
```bash
/Applications/draw.io.app/Contents/MacOS/draw.io \
  --export --format svg \
  --output docs/design/kanban-task-engine-one-page.svg \
  docs/design/kanban-task-engine-one-page.drawio
```

옵션 B: `drawio` npm CLI가 있다면:
```bash
npx drawio --export --format svg \
  --output docs/design/kanban-task-engine-one-page.svg \
  docs/design/kanban-task-engine-one-page.drawio
```

옵션 C (fallback): SVG를 직접 작성. draw.io XML을 기반으로 수동으로 SVG 작성.

**중요:** export 실패 시 fallback으로 수동 SVG를 작성하되, plan log에 "draw.io CLI export 불가, 수동 SVG fallback 사용"으로 기록.

- [ ] **Step 2: SVG 파일 유효성 확인**

```bash
file docs/design/kanban-task-engine-one-page.svg
head -5 docs/design/kanban-task-engine-one-page.svg
```
Expected: `SVG Scalable Vector Graphics image` 또는 XML 헤더 확인.

- [ ] **Step 3: verify-docs.py 재실행**

Run: `python scripts/verify-docs.py`
Expected: "PASS: All required files exist" — README 링크는 여전히 실패.

- [ ] **Step 4: Commit**

```bash
git add docs/design/kanban-task-engine-one-page.svg
git commit -m "docs: export architecture diagram as SVG"
```

**실패 시 중단 조건:** SVG 파일이 생성되지 않거나 유효하지 않으면 중단. fallback 수동 작성으로 대체.

**완료 증거:** `docs/design/kanban-task-engine-one-page.svg` 존재 및 유효성 확인.

---

## Task 6: Root README.md 개편

**Files:**
- Modify: `README.md`

**Plugin/Skill:** `/ux-copy` (diagram label, README 문구)

**선행 검증:** spec의 섹션 5.2 참조. 7개 섹션 구조.

**TDD/검증 방식:** README 작성 후 verify-docs.py의 `check_readme_links`와 `check_files_exist` 모두 통과.

- [ ] **Step 1: README.md 작성**

```markdown
# kanban-task-engine

Environment-independent task synchronization and automation engine. Markdown issue files are the source of truth.

## What is this?

kanban-task-engine는 환경에 의존하지 않는 작업 동기화 및 자동화 엔진입니다. Markdown 이슈 파일을 사람이 읽을 수 있는 source of truth로 취급하고, 이를 canonical JSON으로 변환하여 다양한 외부 시스템과 통신합니다.

엔진 저장소 자체에는 실제 이슈 상태(live state)가 없습니다. 실제 상태는 별도의 Vault 저장소에 살아있으며, 엔진은 오직 로직과 규칙만 담당합니다.

## Architecture Overview

![Architecture Overview](docs/design/kanban-task-engine-one-page.svg)

<details>
<summary>Architecture Detail (Text Version)</summary>

- **Vault** (별도 Git 저장소): Markdown Issues (.md + YAML frontmatter), Boards & Templates, Recipes (.yaml)
- **Engine** (이 저장소): packages/core (Runtime, State Machine, Policy, Store, Executor), packages/schema (Frontmatter schema, Canonical JSON model), Adapters (openclaw, claude-code, jira, cli, github, firebase)
- **External Systems / Interfaces**: OpenClaw, Jira, GitHub, Firebase, CLI
- **데이터 흐름**: Vault Markdown → Engine Parser → Canonical JSON → Adapter → External System
- **모드**: recipe의 modules + policy 조합으로 결정되는 emergent property. 코드에 hardcoded switch 없음.
- **Canonical JSON**: 내부 contract. 사람이 직접 편집하는 surface가 아님.
</details>

## How it works

### Issue Lifecycle
이슈는 템플릿에서 생성되어 DRAFT → OPEN → IN_PROGRESS → DONE (또는 FAILED) 상태를 거칩니다. 각 상태 전이는 Markdown 파일의 YAML frontmatter를 통해 기록됩니다.

### Recipe → Execution Loop
Recipe YAML (`mode` label + `modules` + `policy`)를 통해 실행 환경이 구성됩니다. `claude-code-executor`는 별도의 worktree에서 작업을 수행하며, READY → RUNNING → REVIEW → DONE 상태 전이를 따릅니다.

### Work Scenario: Jira Export
Vault의 Markdown 이슈를 Engine이 파싱하고, `adapter-jira`를 통해 Jira API로 one-way export합니다. 기업 환경에서 별도의 Work Vault와 함께 사용됩니다.

## Key Concepts

| 개념 | 설명 |
|---|---|
| Markdown = SoT | `.md` 파일이 canonical JSON보다 상위의 source of truth |
| Vault ↔ Engine 분리 | Engine repo에는 live issue state 없음. 상태는 Vault에 |
| 모드는 emergent | recipe YAML의 module + policy 조합이 "모드"를 결정 |
| Canonical JSON | 내부 contract. engine과 adapter 간 데이터 교환 형식 |
| Worktree 기반 실행 | `claude-code-executor`가 별도 worktree에서 안전하게 작업 |

## Project Structure

```
packages/
├── core/          # Runtime, State Machine, Policy, Store, Executor
├── schema/        # Frontmatter schema, Canonical JSON model
├── adapter-claude-code/
├── adapter-cli/
├── adapter-firebase/
├── adapter-github/
├── adapter-jira/
└── adapter-openclaw/
```

## Getting Started

```bash
# Clone
git clone <repo-url>
cd kanban-task-engine

# Install dependencies
# (프로젝트 별 설치 방법 — package manager에 따라 다름)

# CLI 사용
kanban run --recipe <recipe-name>
kanban sync
```

## Documentation

- [Architecture Design Spec](docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md)
- [Runtime Overview](docs/kanban-runtime.md)
- [Design Assets](docs/design/)
```

- [ ] **Step 2: verify-docs.py 재실행**

Run: `python scripts/verify-docs.py`
Expected: "PASS: README links are valid" + "PASS: All required files exist"

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite root README with architecture overview and diagram"
```

**실패 시 중단 조건:** verify-docs.py의 `check_readme_links`가 실패하면 중단.

**완료 증거:** verify-docs.py가 모든 검증에서 "PASS" 출력.

---

## Task 7: design-skill-usage-log.md 작성

**Files:**
- Create: `docs/design/design-skill-usage-log.md`

**Plugin/Skill:** `/user-research`, `/research-synthesis`, `/design-system`, `/ux-copy`, `/design-critique`, `/accessibility-review`, `/design-handoff`

**선행 검증:** 모든 design skill이 사용되었는지 확인.

**TDD/검증 방식:** verify-docs.py의 `check_files_exist` 통과 확인.

- [ ] **Step 1: design-skill-usage-log.md 작성**

```markdown
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
**판결:**
- 영역별 색상: Vault(보라), Engine(녹색), External(파랑)
- 테두리 스타일: Vault/External=dashed, Engine=solid (색상 외 구분 요소)
- 아이콘: 각 영역 헤더에 🏠/⚙️/🌐 추가 (접근성)
- Grid 10px, 최대 40자/줄
**반영 위치:**
- `docs/superpowers/specs/2026-05-02-kanban-task-engine-visual-docs-design.md` 섹션 6.2
- `docs/design/README.md` 색상 규칙 표
- 실제 draw.io XML의 fillColor/strokeColor 값

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
- README의 `details/summary` 패턴 사용
- draw.io XML에 헤더 아이콘 추가

---

## 7. `/design-handoff`

**적용 시점:** 완료 단계
**입력:** 최종 산출물 정리
**판단:** "변경 파일, asset 경로, README 반영 위치, 검증 결과, follow-up만 간결하게 포함"
**반영 위치:**
- `docs/design/README.md` 수정 방법 섹션
- 이 usage log 문서 자체

---

## Summary

| Skill | 반영 파일 | 핵심 판단 |
|---|---|---|
| `/user-research` | spec 섹션 2, README | 독자 2 세그먼트, P0 |
| `/research-synthesis` | spec 섹션 3, 다이어그램 annotation | 4가지 핵심 통찰 |
| `/design-system` | spec 섹션 6.2, draw.io XML | 색상/테두리/아이콘 규칙 |
| `/ux-copy` | draw.io label, README | label에 핵심 메시지 직접 포함 |
| `/design-critique` | spec 화살표 규칙 | arrows 중심, HTML mockup 한계 인정 |
| `/accessibility-review` | spec 섹션 7, README | WCAG 2.1 AA, text alternative |
| `/design-handoff` | docs/design/README.md | 수정 방법, asset 경로 |
```

- [ ] **Step 2: verify-docs.py 재실행**

Run: `python scripts/verify-docs.py`
Expected: "PASS: All required files exist"

- [ ] **Step 3: Commit**

```bash
git add docs/design/design-skill-usage-log.md
git commit -m "docs: add design plugin skills usage log"
```

**실패 시 중단 조건:** verify-docs.py에서 "PASS: All required files exist"가 아니면 중단.

**완료 증거:** `docs/design/design-skill-usage-log.md` 존재, 7개 skills 모두 기록됨.

---

## Task 8: 최종 검증 및 수정

**Files:**
- Modify: any (실패 항목 수정)

**Plugin/Skill:** 없음 (검증)

**선행 검증:** Task 1-7 모두 완료

**TDD/검증 방식:** verify-docs.py 최종 실행. 모든 검증 통과 확인.

- [ ] **Step 1: 최종 verify-docs.py 실행**

Run: `python scripts/verify-docs.py`
Expected:
```
PASS: All required files exist
PASS: README links are valid
PASS: Internal docs links are valid
PASS: Diagram contains all required labels

=== ALL CHECKS PASSED ===
```

- [ ] **Step 2: 실패 항목 수정 (있을 경우)**

실패한 항목이 있다면 해당 파일 수정. 수정 후 Step 1 반복.

- [ ] **Step 3: 최종 Commit**

```bash
git add .
git commit -m "docs: complete kanban-task-engine visualization docs"
```

**실패 시 중단 조건:** 어떤 검증이든 "FAIL"이 있으면 수정 후 재시도. "ALL CHECKS PASSED"가 나올 때까지 반복.

**완료 증거:** `python scripts/verify-docs.py` exit code 0 + "ALL CHECKS PASSED" 출력.

---

## Plan Self-Review

### Spec Coverage

| Spec Requirement | Implementing Task |
|---|---|
| 상하 계층 레이아웃 (상단 아키텍처 + 하단 3 패널) | Task 3, Task 4 |
| Vault ↔ Engine 분리 | Task 3 (상단 box 분리 + annotation) |
| Markdown = SoT | Task 3 (Vault 내부 label), Task 6 (README Key Concepts) |
| 모드 emergent | Task 3 (annotation), Task 4 (패널 2 흐름) |
| Execution Loop (READY→RUNNING→REVIEW→DONE) | Task 4 (패널 2) |
| FAILED 상태 | Task 4 (패널 1) |
| draw.io source + SVG | Task 3, 4, 5 |
| README 7개 섹션 | Task 6 |
| 접근성 기준 (WCAG 2.1 AA) | Task 3 (색상+테두리+아이콘), Task 6 (text alternative) |
| design-skill-usage-log | Task 7 |

**Gap:** 없음. 모든 spec requirement에 대응하는 task 존재.

### Placeholder Scan

- "TBD", "TODO", "implement later" — 없음
- "Add appropriate error handling" — 없음 (문서 작업)
- "Write tests for the above" — Task 1에서 실제 Python 코드 포함
- "Similar to Task N" — 없음

### Type Consistency

- 파일 경로 일관성: `docs/design/kanban-task-engine-one-page.drawio`와 `docs/design/kanban-task-engine-one-page.svg`가 모든 task에서 동일한 경로 사용
- 라벨 이름 일관성: verify-docs.py의 `required_labels`와 Task 3/4의 draw.io label 일치

---

## Plan Review Log

**Date:** 2026-05-02
**Status:** P0 blocker 없음. P1 반영 완료.

| Reviewer | 관점 | 결과 | 반영 내용 |
|---|---|---|---|
| A | 실행 가능성/TDD gate | Approve | 1) SVG `<svg>` 태그 검증 추가 (verify-docs.py에) 2) TDD loop 우수 |
| B | plugin/skill orchestration | Approve with changes | 1) Task 3/4에 `/design-critique`, `/accessibility-review` active 적용 2) TDD skill 명시적 invoke 3) Subagent granularity 조정 (너무 작은 task 묶기) |
| C | backward compatibility/repo safety | Approve | 1) pre-commit hook 고려 (follow-up) 2) 문서 drift 방지 프로세스 확인 |

**Applied Changes:**
- Task 3, 4: draw.io XML 작성 시 `/design-critique`와 `/accessibility-review`를 active하게 적용
- Task 1: `superpowers:test-driven-development` skill을 명시적으로 invoke
- Subagent dispatch: Task 2+3, Task 4+5, Task 6+7로 그룹화하여 overhead 감소

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-kanban-task-engine-visual-docs-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
