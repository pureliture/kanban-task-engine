# docs/design — kanban-task-engine 시각화 에셋

이 디렉토리에는 kanban-task-engine의 아키텍처와 유스케이스를 시각화한 에셋이 담겨 있습니다.

## 파일 목록

| 파일 | 설명 |
|---|---|
| `kanban-task-engine-one-page.drawio` | draw.io 편집용 소스 (mxGraph XML) |
| `kanban-task-engine-one-page.svg` | README embed 및 full-size/raw view용 one-page SVG 렌더링 |
| `kanban-task-engine-architecture-overview.svg` | 보조 compact overview SVG 렌더링 (수동 작성, 외부 asset 없음) |

## 수정 방법

1. [draw.io](https://app.diagrams.net/) 또는 draw.io Desktop App 열기
2. `kanban-task-engine-one-page.drawio` 파일 열기
3. 수정 후 **File → Export as → SVG** 선택
4. `kanban-task-engine-one-page.svg` 덮어쓰기
5. 아래 GitHub README SVG Contract의 hardening 항목을 확인
6. 검증: `python3 scripts/verify-docs.py`

draw.io CLI(`drawio` binary)가 없는 환경에서는 SVG를 직접 수정하는 수동 fallback을 사용합니다.
상세 내용은 `docs/design/HANDOFF.md`를 참조하십시오.

## 색상 규칙

| 영역 | 배경색 | 테두리색 | 테두리 스타일 |
|---|---|---|---|
| Vault | `#F3E5F5` | `#9C27B0` | dashed |
| Engine | `#E8F5E9` | `#4CAF50` | solid |
| External | `#E3F2FD` | `#2196F3` | dashed |
| Annotation | `#FFF3E0` | `#FF9800` | solid |
| FAILED / 금지 항목 | `#FFEBEE` | `#E53935` | solid |

## GitHub README SVG Contract

GitHub README의 `<img src="...svg">` embed는 SVG 바깥 CSS를 적용하지 않습니다. README에 노출되는 SVG는 반드시 단독 파일만으로 렌더링되어야 합니다.

필수 조건:

- root `<svg>`는 `xmlns`와 `viewBox`를 포함합니다.
- `<title>`과 `<desc>`를 포함해 raw SVG와 보조 기술에서 의미가 드러나야 합니다.
- viewBox 전체를 덮는 배경 `<rect>`를 둡니다. GitHub dark theme에 의존하지 않습니다.
- class를 쓰는 경우 내부 `<defs><style>`에 모든 class를 정의합니다.
- 모든 `<text>`는 직접 `font-size`를 갖거나 내부 style class로 해석 가능한 font-size를 가져야 합니다.
- README가 one-page SVG를 직접 embed하는 경우 full-size 클릭 경로를 유지하고, SVG 자체는 self-contained contract를 통과해야 합니다.
- 보조 compact SVG를 README embed로 쓰는 경우에는 900px 표시 기준 본문 텍스트가 8px 이상, 주요 zone/title 텍스트가 12px 이상으로 보이도록 설계합니다.
- 외부 asset, remote image, remote font, stylesheet, `@import`, CSS `url(...)`, `<script>`, `<foreignObject>`를 사용하지 않습니다.
- runtime truth label은 실제 repo 구조와 맞아야 합니다. Codex 실행은 `codex-runner` 또는 `packages/core/src/executor/codex-runner.ts`로 표기하고, 존재하지 않는 Codex adapter package처럼 보이는 이름을 쓰지 않습니다.
- status contract는 `IssueStatus (6)`와 `VALID_ISSUE_TRANSITIONS (8)`로 표기합니다.

## Maintenance Guard

- draw.io에서 SVG를 export한 뒤에도 GitHub README contract를 다시 적용해야 합니다. draw.io export가 내부 style, full-viewBox background, accessibility metadata를 보존하지 않을 수 있습니다.
- `kanban-task-engine-one-page.drawio`는 의미와 layout source이고, `kanban-task-engine-one-page.svg`는 production render입니다. architecture 의미가 바뀌면 두 파일을 함께 맞춥니다.
- `kanban-task-engine-architecture-overview.svg`는 보조 compact render입니다. README canonical preview는 `kanban-task-engine-one-page.svg`이며, compact render를 다시 노출할 때는 one-page SVG의 핵심 의미(Vault, Engine, External, executor, Work mode 제한, status contract)와 drift되면 안 됩니다.
- 문서/asset 변경 후에는 다음 명령을 실행합니다.

```bash
python3 scripts/verify-docs.py
```

## 접근성 기준

- 색상 외에 테두리 스타일(dashed/solid)과 헤더 아이콘으로 영역 구분 (WCAG 2.1 AA)
- README에 `<details>/<summary>` 텍스트 대체 버전 제공
- 최소 font-size 10px 유지

## 검증

```bash
python3 scripts/verify-docs.py
```

모든 체크가 PASS이면 exit code 0을 반환합니다.
