# docs/design — kanban-task-engine 시각화 에셋

이 디렉토리에는 kanban-task-engine의 아키텍처와 유스케이스를 시각화한 에셋이 담겨 있습니다.

## 파일 목록

| 파일 | 설명 |
|---|---|
| `kanban-task-engine-one-page.drawio` | draw.io 편집용 소스 (mxGraph XML) |
| `kanban-task-engine-one-page.svg` | README embed용 SVG 렌더링 |

## 수정 방법

1. [draw.io](https://app.diagrams.net/) 또는 draw.io Desktop App 열기
2. `kanban-task-engine-one-page.drawio` 파일 열기
3. 수정 후 **File → Export as → SVG** 선택
4. `kanban-task-engine-one-page.svg` 덮어쓰기
5. 검증: `python scripts/verify-docs.py`

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

## 접근성 기준

- 색상 외에 테두리 스타일(dashed/solid)과 헤더 아이콘으로 영역 구분 (WCAG 2.1 AA)
- README에 `<details>/<summary>` 텍스트 대체 버전 제공
- 최소 font-size 10px 유지

## 검증

```bash
python scripts/verify-docs.py
```

모든 체크가 PASS이면 exit code 0을 반환합니다.
