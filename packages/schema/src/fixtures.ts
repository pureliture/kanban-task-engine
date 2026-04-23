export const VALID_ISSUE_MARKDOWN = `---
id: VC-006
title: 로그인 페이지 UI 스켈레톤
type: task
status: READY
executor: claude-code
project: flow-weaver
epic: VC-005
priority: P2
created: 2026-04-23
updated: 2026-04-23
labels: []
depends_on: []
working_dir: ~/Projects/flow-weaver
run_count: 0
---

## 목적

로그인 흐름의 초기 UI 뼈대를 만든다.

## 컨텍스트

디자인 토큰은 packages/ui-tokens에 이미 있음. 관련 티켓 VC-005 참고.

## Acceptance Criteria

- [ ] 이메일 + 비밀번호 입력 필드 존재
- [ ] 로그인 버튼 클릭 시 폼 제출 핸들러 호출

## 실행 힌트

pnpm -F flow-weaver test로 회귀 확인. 기존 스타일 프리셋 재사용.

## 로그

`;

export const VALID_EPIC_MARKDOWN = `---
id: VC-005
title: 온보딩 플로우 개편
type: epic
status: TODO
executor: human
project:
priority: P1
created: 2026-04-20
updated: 2026-04-20
labels: []
depends_on: []
run_count: 0
---

## 목표

신규 사용자의 첫 3분 경험을 재설계한다.

## 범위

- 포함: 로그인/가입/첫 대시보드
- 제외: 결제, 초대

## 성공 지표

- [ ] 3분 내 첫 액션 완료율 40% 이상

## 하위 티켓

<!-- kanban:auto-render start -->
- TODO: VC-006
<!-- kanban:auto-render end -->

## 로그

`;

export const INVALID_ISSUE_MISSING_목적 = `---
id: VC-007
title: 컨텍스트만 있는 이슈
type: task
status: READY
executor: claude-code
project: flow-weaver
priority: P2
created: 2026-04-23
updated: 2026-04-23
---

## 컨텍스트

목적 섹션이 빠져 있어야 한다.

## Acceptance Criteria

- [ ] 의도된 invalid fixture

## 실행 힌트

N/A.
`;

export const INVALID_ISSUE_UNKNOWN_TYPE = `---
id: VC-008
title: 잘못된 타입
type: story
status: READY
executor: claude-code
project: flow-weaver
priority: P2
created: 2026-04-23
updated: 2026-04-23
---

## 목적

story 타입은 제거됐어야 한다.

## 컨텍스트

MVP enum에서 story 제외.

## Acceptance Criteria

- [ ] validator가 거절

## 실행 힌트

N/A.
`;
