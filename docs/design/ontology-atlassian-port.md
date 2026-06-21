# Ontology Unification & Atlassian Port — Design Note

> Status: **draft / analysis**
> Branch: `claude/ontology-kanban-atlassian-0n1gel`
> Scope note: 이 문서는 현재 세션에서 접근 가능한 `kanban-task-engine` 리포만을 근거로 작성되었습니다.
> 외부 온톨로지 소스(`pureliture/neurons`, `pureliture/dendrite`, `pureliture/routine-harness`)는
> 세션 GitHub 스코프 밖이라 직접 분석하지 못했으며, 해당 통합 지점은 본문에 **[EXTERNAL]** 로 표시해 두었습니다.

## 1. 목적

`kanban-task-engine`이 이미 보유한 canonical task 온톨로지를 정리하고, 이를 Atlassian
(Jira Cloud / Confluence)으로 안정적으로 포팅하기 위한 설계 기준을 정의한다. 동시에 외부
온톨로지 리포(neurons/dendrite/routine-harness)와의 통합 지점을 명시해, 해당 소스가
세션 스코프에 들어오는 즉시 후속 작업이 곧바로 이어지도록 한다.

## 2. 현재 온톨로지 현황 (코드 검증 기반)

엔진은 "canonical model을 정의하고 adapter로 외부 시스템에 매핑"하는 구조다.
현재 **canonical model이 두 개로 분리**되어 있다.

| 모델 | 위치 | 용도 | 분류 체계 |
|---|---|---|---|
| `CanonicalTaskModel` | `packages/core/src/types.ts` | 런타임 sync / state machine | issue_type=`Epic/Story/Task/Bug/Sub-task`, priority=`Blocker/Critical/High/Medium/Low/Trivial` (Jira 친화적) |
| `CanonicalIssueModel` | `packages/schema/src/issue-schema.ts` | schema 검증 | issue_type=`epic/task/bug/chore/docs`, priority=`P0/P1/P2/P3` |

두 모델은 공통 엔티티 골격을 공유하지만, **필드 구성과 타입이 완전히 동일하지는 않다**.
아래 골격에 모델 간 차이를 함께 표기한다(통합 설계 시 반드시 고려해야 할 지점).

```
task_ref { provider, external_key, external_id }
summary
description_ref?                  # CanonicalTaskModel 전용 (Jira description 매핑에 사용)
workflow { normalized_status, raw_status, raw_status_category }
classification { issue_type, priority, labels, component }
ownership { assignee, reporter }
planning { … }                   # Task=구조화된 Planning(sprint/due_date/estimate), Issue=Record<string, unknown>
automation { policy_id, on_enter, on_exit, execution_profile, … }
                                 #   Task에만 trigger / allowedActions / extra 추가
sync { last_synced_at, last_source, … }
                                 #   Task에만 checksum / jira 메타데이터 존재
created? / updated? / completed?
```

#### 모델 간 필드 차이 (통합 시 정합화 필요)

| 필드 | `CanonicalTaskModel` (core) | `CanonicalIssueModel` (schema) |
|---|---|---|
| `description_ref` | 있음 | 없음 |
| `planning` | 구조화된 `Planning` (sprint, due_date, estimate) | `Record<string, unknown>` |
| `automation` | + `trigger`, `allowedActions`, `extra` | 기본 필드만 |
| `sync` | + `checksum`, `jira` | `last_synced_at`, `last_source`만 |

### 2.1 분류 체계 불일치 (핵심 이슈)

`CanonicalTaskModel`은 Jira 어휘를, `CanonicalIssueModel`은 Markdown frontmatter 어휘를 쓴다.
Atlassian 포팅의 신뢰성을 위해 **두 어휘 간 정규 매핑**이 명시적으로 필요하다.

| Markdown (`CanonicalIssueModel`) | Jira (`CanonicalTaskModel`) |
|---|---|
| `epic` | `Epic` |
| `task` | `Task` |
| `bug` | `Bug` |
| `chore` | `Task` (label `chore`) |
| `docs` | `Task` (label `docs`) |

| Markdown priority | Jira priority |
|---|---|
| `P0` | `Blocker` |
| `P1` | `Critical` (또는 `High`) |
| `P2` | `Medium` |
| `P3` | `Low` |

> `Story` / `Sub-task` / `Trivial`은 Markdown 어휘에 대응어가 없다. 통합 온톨로지에서
> 이를 1급 타입으로 승격할지, Jira-only로 둘지 결정이 필요하다. **[DECISION]**

## 3. 워크플로우 상태 매핑 (구현 완료)

`packages/schema/src/status.ts`에 정규 상태 6종과 Jira 상태 힌트가 이미 정의되어 있다.

| normalized_status | raw_status_category | Jira status hint |
|---|---|---|
| `TODO` | `TODO` | To Do |
| `READY` | `READY` | Ready |
| `RUNNING` | `IN_PROGRESS` | In Progress |
| `REVIEW` | `IN_REVIEW` | In Review |
| `DONE` | `DONE` | Done |
| `FAILED` | `FAILED` | Blocked |

유효 전이(`VALID_ISSUE_TRANSITIONS`)도 정의되어 있다:
`TODO→READY→RUNNING→REVIEW→DONE`, 그리고 `RUNNING→FAILED→READY`, `REVIEW→RUNNING`, `READY→TODO`.

## 4. Atlassian 어댑터 현황 및 갭

위치: `packages/adapter-jira/`

- `jira-mapper.ts` — `CanonicalTaskModel → JiraIssuePayload`, REST API v3 `fields` 구조
  (project / summary / description / issuetype / priority / labels)
- `jira-adapter.ts` — `POST /rest/api/3/issue`, dry-run, `RuntimePolicy` 게이트(`assertAdapterAllowed`)

### 갭 (포팅 시 해결 필요)

1. **ADF 미지원** — `description`이 plain string. Jira Cloud REST v3는 description을
   **Atlassian Document Format(ADF)** JSON으로 요구한다. plain string은 거부되거나
   렌더링이 깨질 수 있다. → `string → ADF` 변환기 필요. **[GAP]**
2. **Status transition 푸시 없음** — 어댑터는 생성(create)만 한다. normalized_status 변경을
   Jira에 반영하려면 `POST /rest/api/3/issue/{key}/transitions` 호출과 transition-id 해석이
   필요하다(§3 매핑 활용). **[GAP]**
3. **인증 방식** — 현재 `Authorization: Bearer`. Jira Cloud는 보통 Basic(email + API token)을
   쓴다. 대상 배포(Server/DC vs Cloud)에 따라 확정 필요. **[DECISION]**
4. **Confluence 연동 없음** — Atlassian 포팅에 Confluence가 포함된다면 별도 어댑터가 필요하다.
   routine-harness에 기존 구현이 있을 가능성이 높다. **[EXTERNAL]**
5. **양방향 sync** — write-back은 현재 `sync.jira.*` namespace로 제한(README/runtime 문서).
   Jira→canonical 역방향 매핑(import)은 아직 없다. **[GAP]**

## 5. 외부 온톨로지 통합 지점 [EXTERNAL]

> 아래는 외부 리포 소스를 확인하지 못한 상태의 **가설**이며, 소스 확보 후 검증해야 한다.

- **`neurons`** — 도메인 엔티티 정의. canonical model의 `classification`/`planning` 확장,
  혹은 `task_ref.provider` 외 추가 엔티티 타입의 출처일 가능성.
  → kanban canonical 엔티티와의 필드 단위 매핑표 작성 필요.
- **`dendrite`** — thin-client / enqueue 모델. `SyncTransport`/`SyncEvent`
  (core `types.ts`)와의 관계 정리 필요. enqueue 페이로드가 canonical model을 그대로
  싣는지, 축약 표현을 쓰는지 확인.
- **`routine-harness`** — Atlassian 컴포넌트(Jira/Confluence client) 보유 가능성이 가장 높음.
  기존 구현이 §4의 갭(ADF, transition, auth, Confluence)을 이미 해결했다면 어댑터를
  새로 만들기보다 **재사용/포팅**하는 편이 맞다.

## 6. 제안 작업 순서

1. **온톨로지 정규화** — `CanonicalTaskModel`/`CanonicalIssueModel` 분류 어휘 매핑 함수화
   (§2.1, §2 표를 코드로). 두 모델을 합칠지/매핑 계층만 둘지 결정. **[DECISION]**
2. **Jira 어댑터 강화** — ADF 변환기, status transition 푸시, auth 방식 확정 (§4).
3. **[EXTERNAL] 외부 온톨로지 매핑** — neurons/dendrite 엔티티 ↔ canonical 필드 매핑표,
   routine-harness Atlassian 클라이언트 재사용 여부 결정.
4. **양방향 sync / Confluence** — 범위에 포함될 경우.

## 7. 미해결 결정 사항 (요약)

- [ ] 두 canonical model을 통합할 것인가, 매핑 계층만 둘 것인가?
- [ ] `Story`/`Sub-task`/`Trivial`을 통합 온톨로지 1급 타입으로 승격할 것인가?
- [ ] Atlassian 대상이 Cloud인가 Server/DC인가? (auth/ADF 영향)
- [ ] Confluence 연동이 범위에 포함되는가?
- [ ] routine-harness의 기존 Atlassian 컴포넌트를 재사용할 것인가, 신규 구현할 것인가?
