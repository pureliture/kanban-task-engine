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
