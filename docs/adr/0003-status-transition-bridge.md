# ADR-0003 — status/transition 브리지: schema 패키지 단일 SoT 상수

- 상태: **Accepted** (M3 완료, 2026-06-20). 구현: `packages/schema/src/status.ts` `STATUS_BRIDGE` + 헬퍼, `adapter-jira` statusHint 연결. `resolveJiraTransition`은 M4 transition 실측 의존(골격+테스트 완료).
- 날짜: 2026-06-20
- 맥락: [requirements.md](../../specs/atlassian-porting/requirements.md) P0-2

## 맥락

kanban 6상태를 Jira로 보내고(정방향), 2단계에서 Jira 상태를 역류(역방향)하려면 3-way status 매핑이 필요하다. neurons knowledge 연계도 같은 상태축을 쓴다.

## 실측 (Probe Findings, confirmed)

- kanban: `IssueStatus` 6상태 + `VALID_ISSUE_TRANSITIONS`(8 edge) + `JIRA_STATUS_HINTS` + `STATUS_CATEGORY_MAP` 존재. **단 `toJiraStatusHint`가 mapper에 미연결.** `packages/schema/src/status.ts`
- neurons: task status는 **enum 아닌 자유형 문자열**. `TERMINAL_TASK_STATUSES = {done,resolved,closed,cancelled}`만 고정.
- Jira transition: 테넌트별 가변. acli read 모드는 `transition` verb 차단(BLOCKED 22개). `workitem view --json` availableTransitions 파싱 가능 여부 미확인(M4 probe).

## 결정

3-way 매핑을 **schema 패키지 단일 상수(SoT 모듈)**로 정의한다.

| IssueStatus | raw_status_category | neurons status (mirror) | Jira status hint | Jira category |
|---|---|---|---|---|
| TODO | TODO | todo | To Do | To Do |
| READY | READY | ready | Ready (폴백 To Do) | To Do |
| RUNNING | IN_PROGRESS | running | In Progress | In Progress |
| REVIEW | IN_REVIEW | in_review | In Review (폴백 In Progress) | In Progress |
| DONE | DONE | done | Done | Done |
| FAILED | FAILED | failed/blocked | Blocked | (Done 아님) |

불변식/규칙:
- neurons는 **자유형**이므로 kanban→neurons는 위 mirror 문자열로 정규화하되, neurons→kanban은 `TERMINAL_TASK_STATUSES`만 신뢰하고 나머지는 카테고리 폴백.
- READY/REVIEW가 Jira 워크플로에 없으면 publish 전 transition 목록 조회 → 없으면 statusCategory 동일 폴백, **실제 적용된 상태**를 `sync.jira.status`에 기록.
- `FAILED→Blocked`는 "Done category 아님" 불변식.
- 역류(2단계)는 `VALID_ISSUE_TRANSITIONS` 위반 점프(DONE→TODO 등) 거부 → conflict 정책 발동.
- 미정의/테넌트 미존재 transition은 자동 매핑 금지 → **사람 확인 큐**(fail-closed).

## 근거

단일 상수 SoT가 있어야 정·역방향이 같은 테이블을 쓰고 round-trip lossless를 검증할 수 있다. 자유형 neurons status를 kanban이 그대로 받으면 오염되므로 정규화 경계를 둔다.

## 귀결

- `toJiraStatusHint`를 mapper에 연결 (M3).
- transition id 동적 resolve 경로는 M4 probe 결과에 의존.
- 역방향(round-trip) 검증은 Phase 2 / M5 이후.
