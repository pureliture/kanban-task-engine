# 온톨로지 기반 통합 칸반보드 → Atlassian 포팅: 제품 설계 문서 (PDD)

## 1. 제품 개요

### 1.1 한 줄 정의

> **"내 .md Vault를 단일 진실(SoT)로 삼아 개인이 작업을 운영하고, 그 결과만 Atlassian으로 발행해 팀과 공유하며, AI가 쌓은 과거 knowledge가 카드 위에 따라붙는 개인-SoT / 팀-투영 칸반 엔진."**

### 1.2 비전

개인의 작업은 손에 잡히는 로컬 `.md` 파일로 살아 있어야 하고, 팀 공유는 그 작업을 옮겨심는 행위가 아니라 **투영(projection)**이어야 한다([D1]). `KANBAN_HOME` Vault를 유일한 SoT로 고정하고, 6상태 상태머신(TODO/READY/RUNNING/REVIEW/DONE/FAILED)으로 작업을 운영한 뒤, 검증이 끝난 산출물만 Jira issue와 Confluence page로 발행한다. 동시에 neurons가 축적한 decision·drift·incident knowledge를 board 카드 위에 **read-only enrichment**로 띄워, 같은 결정을 두 번 고민하지 않게 한다([D3]). 1단계는 칸반→Atlassian 단방향 발행으로 "내가 일한 결과가 팀에 자동으로 보인다"는 가치를 검증하고, 2단계에서 Jira 상태 역류(WorkStateProvider)를 더한다([D2]). 최종 지향점은 개인의 자율성과 팀의 가시성이 충돌 없이 한 파일에서 출발하는 것이다.

### 1.3 해결하는 핵심 문제 (Why Now)

오늘 한 사람의 작업 맥락은 **세 개의 섬**으로 찢겨 있다.

```
 [개인 .md 칸반]        [팀 Atlassian]         [AI knowledge / neurons]
   KANBAN_HOME            Jira / Confluence       decision/drift/incident
   - 내가 실제로 일하는 곳   - 팀이 실제로 보는 곳      - AI가 쌓아온 판단 근거
        │                      │                        │
        └─ 연결 0건 ───────────┘                        │
        └──────────── 연결 0건 ──────────────────────────┘
```

- **개인 .md ↔ 팀 Atlassian**: `adapter-jira`는 `createIssue()`(CREATE-only)만 존재하고 Confluence 구현은 0건. "내가 한 일을 팀에 보이려면 손으로 다시 옮겨 적는" 이중 입력이 강제된다.
- **개인 .md ↔ AI knowledge(neurons)**: 매핑 키(`kanban project ↔ brain_id=/project/<slug>`, `Task ↔ MemoryCard(card_type=task)`)는 명확하지만 실제 연결은 0건. AI가 과거에 내린 decision/incident가 정작 지금 카드를 보며 결정하는 순간엔 보이지 않는다.
- **Why Now**: dendrite↔neurons는 이미 견고히 결합돼(`rag_ingress_enqueue.v1`, idempotencyKey, contentHash) knowledge **공급망은 완성**돼 있고, kanban엔 `mapper`·`sync.jira` write-back 스키마(`sync.jira.{key,status,exportedAt}`)·`SyncCoordinator`·`adapter-github`(완전구현 참조모델)이 이미 있으며, routine-harness(RH)엔 실 테넌트 인증(Basic Auth 읽기/쓰기 분리)·Storage Format·ADF 발행 역량이 검증돼 있다. **세 섬을 잇는 부품은 다 흩어진 채로 존재한다 — 남은 것은 연결뿐이다.**

---

## 2. 확정 결정 (Decisions)

| Dx | 결정 | 제품 원칙으로의 번역 | 근거 |
|----|------|---------------------|------|
| **D1** | 사용 맥락 = 개인 SoT → 팀 투영. 개인의 `.md` Vault(`KANBAN_HOME`)가 SoT, Atlassian은 팀 공유용 투영/발행 대상. | **SoT 불침범**. 모든 Phase에서 `.md → Atlassian`이 기본 방향. 발행은 migration이 아닌 projection. 역류는 명시적 정책 게이트 통과 후에만. | 발행은 SoT에서 *읽어* 투영할 뿐, write-back은 SoT의 `sync` 필드에만 기록. |
| **D2** | Atlassian 연동 = Export 먼저 → 양방향 확장. 1단계 칸반→Confluence/Jira 단방향 발행으로 가치 검증, 2단계에서 Jira 상태 역류(WorkStateProvider) 추가. | **단방향으로 가치 검증 후 양방향**. 역방향은 트리거 충족 시에만 켠다. | 현재 `adapter-jira`가 CREATE-only이고 `WorkStateProvider`는 인터페이스만 선언됨(`types.ts`). |
| **D3** | 온톨로지 역할 = read-only enrichment 우선. neurons knowledge(decision/drift/incident)를 board 카드 메타·그래프 탐색으로 표시하되 `.md` SoT 불침범(neurons = read-only mirror). B/C는 로드맵상 진화 경로이며 전환 트리거를 명시. | **read-only mirror로 시작**. A(enrichment) → B(1급 통합) → C(그래프 자동화)는 트리거 기반 진화. 기본은 A에서 멈춤. | neurons는 끝까지 mirror, 자동화는 항상 제안→승인. `.md` SoT 불침범 위배 시 즉시 중단. |

---

## 3. 페르소나 & 핵심 사용 시나리오

### 3.1 페르소나

#### P1. 개인 운영자 — "Vault 한 곳에서 Home·Work를 굴리는 사람"

| 항목 | 내용 |
|------|------|
| **정체성** | `KANBAN_HOME` `.md` Vault를 개인 SoT로 쓰며 Obsidian board(projection)에서 작업을 운영. 6상태 상태머신과 `RuntimePolicy` fail-closed 게이트로 실행을 통제. |
| **목표** | (1) 모든 작업을 `.md` 한 곳에서 손실 없이 관리 (2) 검증 끝난 것만 팀에 노출 (3) 과거에 내가/AI가 내린 판단을 다시 끌어다 쓰기 |
| **페인** | (1) 팀 공유에 Jira 이중 입력 (2) 발행이 무차별이면 미완성·민감 정보까지 누출 (3) "이거 예전에 왜 이렇게 결정했더라"가 board에서 안 보임 |
| **성공 기준** | `.md`를 건드리지 않은 채 REVIEW→DONE 시점에 Jira/Confluence로 1-click 발행되고, board 카드에 관련 decision/incident가 read-only로 떠 있다. |

#### P2. 팀 협업자 — "Atlassian만 보는 사람"

| 항목 | 내용 |
|------|------|
| **정체성** | Vault·neurons의 존재를 모르거나 관여하지 않음. Jira issue와 Confluence page만이 작업 현실. |
| **목표** | (1) 동료 진행 상황을 Jira에서 정확히 파악 (2) epic 단위 맥락을 Confluence 문서로 읽기 (3) 자기 워크플로(Jira 상태 전이) 안에서 일하기 |
| **페인** | (1) 개인 도구에 갇힌 진행 상황이 Jira에 늦거나 안 들어옴 (2) issue description이 빈약(평문)해 맥락 부족 (3) 결정 근거가 issue에 안 남음 |
| **성공 기준** | Jira 상태가 개인 작업 실제 상태와 일치하고, Confluence epic 문서에 결정 근거가 함께 담겨 개인 도구를 몰라도 협업에 지장 없음. |

> **(선택 확장) P3. 운영 관리자** — 발행 승인 게이트·redaction 정책·이중 SoT conflict 정책 책임자. [D2] 2단계 양방향 도입 시 1급 페르소나로 승격.

### 3.2 핵심 사용 시나리오 (End-to-End)

#### 시나리오 ① 작업 발행 — .md에서 만들어 Jira로 내보내기 (P1 → P2)

```
P1: .md 카드 생성(VC-001, status:TODO)
      └ TODO→READY→RUNNING→REVIEW  (상태머신 valid transition)
         └ RuntimePolicy fail-closed 게이트 통과로 실행
            └ REVIEW→DONE 승인 시점에 "발행" 트리거
               └ canonical 변환(kanban adapter contract)
                  · IssueStatus(6) → toJiraStatusHint (예: REVIEW→"In Review")
                  · canonicalToJiraPayload 생성
                  └ 실 write는 routine-harness 컴포넌트 위임
                     · Basic Auth(쓰기 계정), ADF 페이로드, 승인 게이트
                     └ Jira issue 생성 + sync.jira.{key,status,exportedAt} write-back
P2: Jira에서 issue 확인 — 상태/내용이 P1의 실제 작업과 일치
```

- **1단계 범위**: 단방향 발행으로 "이중 입력 제거" 가치 검증([D2]).
- **불침범 원칙**: 발행은 SoT에서 *읽어* 투영, write-back은 `sync` 필드에만 기록.
- **온톨로지 가치**: 발행 직전 board가 같은 component의 과거 incident를 read-only로 보여줘 "같은 실수로 또 막히는" 발행을 사전 차단.

#### 시나리오 ② 의사결정 enrichment — 과거 knowledge가 카드에 떠서 판단 돕기 (P1)

```
P1: board에서 카드(VC-001) 열람
   └ kanban project ↔ neurons brain_id=/project/<slug> 로 조회
      └ MCP read-only 질의(brain_query / brain_memory_search)
         · 관련 decision (왜 이 방향을 택했는가)
         · drift (계획 대비 어떻게 흘러갔는가)
         · incident (과거 무엇이 터졌는가)
      └ 카드 메타 패널 + 그래프 탐색으로 표시 (OntologyEpisode relations)
P1: 근거를 보고 다음 상태 전이/우선순위를 결정
```

- **read-only mirror 원칙**([D3]): neurons knowledge는 `.md` SoT에 절대 쓰지 않는다. 카드에 떠도 거울(mirror)일 뿐 편집 대상 아님.
- **온톨로지 가치**: "예전에 왜 이렇게 했더라"의 답을 카드 안에서 즉시 제공해 동일 결정 재고 시간을 0으로.

#### 시나리오 ③ epic 문서 발행 — Confluence로 맥락 펴기 (P1 → P2)

```
P1: epic(VC-epic) 하위 task들이 DONE으로 수렴
   └ "epic 문서화" 트리거
      └ canonical(epic + 하위 task 롤업) 구성
         └ routine-harness confluence-page-authoring 위임
            · 6 archetype 중 epic 아키타입 선택
            · Storage Format(XHTML), Storage REST v1
            · enrichment: 관련 decision을 문서 본문에 read-only 인용
            └ Confluence page 발행(pageId, spaceKey)
P2: Confluence에서 epic 맥락 + 결정 근거를 한 문서로 열람
```

- **하이브리드 비대칭**: canonical 변환·식별자는 kanban adapter contract, 실 Confluence write는 RH 컴포넌트. Confluence 코드 0건이므로 RH 역량 재사용이 정당.
- **온톨로지 가치**: epic 문서에 decision을 read-only 자동 인용해 팀이 "무엇을 했나"뿐 아니라 "왜 그렇게 했나"까지 개인 도구 없이 읽게 한다.

---

## 4. 정보 아키텍처 & 통합 온톨로지 데이터 모델

본 모델은 코드베이스 실제 필드명에 근거한다. 검증한 1급 정의:
- `packages/schema/src/status.ts` — `ISSUE_STATUSES=[TODO,READY,RUNNING,REVIEW,DONE,FAILED]`, `VALID_ISSUE_TRANSITIONS`, `JIRA_STATUS_HINTS`(`toJiraStatusHint`)
- `packages/core/src/types.ts` — `CanonicalTaskModel`, `TaskRef`, `Workflow`, `Classification`, `Sync.jira{key,status,exportedAt}`, `WorkStateProvider`(역방향 인터페이스 선언됨)
- `packages/core/src/store/registry.ts` — `RegistrySpace{type,idPrefix,issues,epics,board,projects}`, `idPrefix`는 `/^[A-Z][A-Z0-9]*$/` 강제
- `packages/core/src/store/mapper.ts` — `STATUS_MAP`/`STATUS_CATEGORY_MAP`/`REVERSE_STATUS_MAP`, `extractWorkspace`
- `packages/adapter-jira/src/jira-mapper.ts` — `JiraIssuePayload.fields{project.key, summary, description(평문 string), issuetype.name, priority.name, labels}`

### 4.1 3-레이어 Entity 모델 (1급 식별자 명시)

| 개념축 | Kanban (.md SoT) | Neurons (mirror) | Atlassian (publish) |
|---|---|---|---|
| **컨테이너/네임스페이스** | `RegistrySpace`(space)+project. 1급 ID = `space.idPrefix`(VC/OC)+project slug | `brain_id = /project/<slug>` | Jira `project.key` / Confluence `space.key` |
| **작업 단위** | `Issue`(IssueFrontmatter) — 1급 ID = `id`(예: VC-001) | `MemoryCard{card_type:task}` — 1급 ID = `memory_id`(mem_<hash16>), 안정 ID = `natural_id` | Jira `issue` — 1급 ID = `key`(VC-12) / `id` |
| **작업 분류** | `type`(epic\|task\|bug\|chore\|docs) → canonical `issue_type` | `entity_type`(Task/Epic/Bug…) | `fields.issuetype.name` |
| **상태** | `status`(6상태) | task card `typed_payload.status` | `fields.status`(transition/category) |
| **지식/문맥** | Issue 본문 `## Decision`, `## Evidence` 섹션 | `MemoryCard{decision\|drift\|evidence}` + `OntologyEpisode.relations[]` | Confluence `page`(pageId, spaceKey, Storage Format XHTML) |
| **동기화 상태** | `sync.jira{key,status,exportedAt}` (write-back) | ledger(canonical authority, knowledge 한정) — read-only mirror | (외부 truth, export 대상) |

핵심: **Kanban `id`(VC-001)가 전 레이어를 관통하는 사람-읽기용 1급 키**. neurons `memory_id`는 내부 해시이므로 join 키로 직접 쓰지 않고 `natural_id = {brain_id}#{kanban.id}` 형태로 결정론적 생성한다.

```
.md SoT (id=VC-001)
   │ canonical 변환 (kanban core)
   ├──► CanonicalTaskModel.task_ref{provider:local, external_key:space, external_id:VC-001}
   ├──► [publish] Jira issue.key=VC-12   → sync.jira.key write-back
   ├──► [publish] Confluence page.spaceKey=VC
   └──► [mirror ] MemoryCard.natural_id="/project/vc#VC-001" (read-only)
```

### 4.2 핵심 Relation 정의

| Relation | 출발 | 도착 | 방향/타입 | 키 매핑 |
|---|---|---|---|---|
| `MIRRORS_TASK` | `Issue(VC-001)` | `MemoryCard{card_type:task}` | 1:1, kanban→neurons read-only | `natural_id = /project/<slug>#<id>` |
| `HAS_TYPE` | `Issue.type` | `MemoryCard.entity_type` | enum 투영 | type→entity_type 매핑표(아래) |
| `DECIDED_IN` | Issue 본문 `## Decision` | `MemoryCard{card_type:decision}` | 1:N | `natural_id = <issueId>#decision#<n>` |
| `EVIDENCED_BY` | Issue 본문 `## Evidence`/링크 | `MemoryCard{card_type:evidence}` | 1:N | `brain_evidence_get` |
| `DEPENDS_ON` | `Issue.depends_on[]` | `Issue`/`MemoryCard` | directed graph edge | `OntologyEpisode.relations[]` |
| `DRIFTED` | `MemoryCard{card_type:drift}` | `Issue` | neurons→board 표시용 | `brain_drift_explain`, board enrichment |

**type → entity_type 매핑표:**

| Kanban `type` | canonical `issue_type` | neurons `entity_type` | Jira `issuetype.name` |
|---|---|---|---|
| epic | Epic | Epic | Epic |
| task | Task | Task | Task |
| bug | Bug | Bug | Bug |
| chore | Task | Task | Task |
| docs | Task | Task | Task |

`epic` 부모 참조는 `(child)-[PART_OF]->(epic)` edge로, `depends_on[]`은 `DEPENDS_ON` edge로 투영. C단계 진입 시 이 두 edge가 traversal 1급 시민이 된다.

### 4.3 Canonical Join Key: `/project/<slug>`를 전 레이어 1급 네임스페이스로

**정합 규칙 (naming alignment contract):**

```
slug = lowercase(space.idPrefix)          # VC → vc, OC → oc
brain_id            = "/project/" + slug  # /project/vc
jira.project.key    = space.idPrefix      # VC  (대문자 유지)
confluence.spaceKey = space.idPrefix      # VC
issue.id            = idPrefix + "-" + seq  # VC-001
natural_id          = brain_id + "#" + id   # /project/vc#VC-001
```

| 레이어 | 네임스페이스 표현 | 변환 |
|---|---|---|
| Kanban registry | `space.idPrefix` = VC | 원천 (대문자, 정규식 강제) |
| neurons | `brain_id` = /project/vc | `"/project/" + idPrefix.toLowerCase()` |
| Jira | `project.key` = VC | `idPrefix` 그대로 |
| Confluence | `space.key` = VC | `idPrefix` 그대로 |

**naming 3-way 미검증 리스크 처리 (GAP#2):** registry는 현재 `idPrefix`만 보유하므로 자동 slug 추론을 금지하고, `registry.yaml` space에 **명시적 매핑 필드를 신설**한다.

```yaml
spaces:
  VC:
    idPrefix: VC
    external:
      neuronsBrainId: /project/vc      # 명시
      jiraProjectKey: VC               # 명시
      confluenceSpaceKey: VC           # 명시
```

- **fail-closed**: `RuntimePolicy` 게이트에서 publish 전 `idPrefix→external.*` 매핑이 없으면 **export 거부**. 추론된 slug로 잘못된 brain mirror·잘못된 Jira project createIssue(403/400, GAP#3) 사고를 동일 게이트에서 방어.
- **검증 액션**: 1회성 reconcile job — 각 external key 존재 여부를 `brain_resolve`/Jira project GET/Confluence space GET로 ping, 불일치 시 registry 보강.

### 4.4 3-way Status 매핑 테이블 (GAP#1 해소 — 단일 권위 테이블)

`toJiraStatusHint`(`JIRA_STATUS_HINTS`) + `STATUS_CATEGORY_MAP` 기준. 이 테이블을 kanban schema에 단일 SoT 모듈로 둔다. Phase0은 정방향(canonical→Jira), Phase2는 같은 테이블을 역방향으로 사용한다.

| IssueStatus (.md SoT) | raw_status_category | neurons task.status | Jira status name (hint) | Jira statusCategory | transition 의미 |
|---|---|---|---|---|---|
| TODO | TODO | todo | To Do | To Do (new) | 미착수 |
| READY | READY | ready | Ready (없으면 To Do 폴백) | To Do (new) | 착수 대기 |
| RUNNING | IN_PROGRESS | running/in_progress | In Progress | In Progress (indeterminate) | 실행 중 |
| REVIEW | IN_REVIEW | in_review/review | In Review (없으면 In Progress 폴백) | In Progress (indeterminate) | 리뷰 중 |
| DONE | DONE | done | Done | Done (done) | 완료 |
| FAILED | FAILED | failed/blocked | Blocked | To Do/In Progress (Done 아님) | 차단/실패 |

**매핑 불변식 / 폴백 규칙:**
- `READY`/`REVIEW`는 표준 Jira 워크플로우에 transition이 없을 수 있음 → publish 전 Jira project transition 목록을 조회해 hint→실제 transitionId resolve, 실패 시 statusCategory 동일 폴백(READY→To Do, REVIEW→In Progress)으로 degrade하고 **실제 적용된 Jira 상태**를 `sync.jira.status`에 기록(낙관적 hint와 실제 분리).
- `FAILED→Blocked`는 "Done category 아님"이 불변식.
- 역류(WorkStateProvider, 2단계)는 raw status를 `raw_status_category`로 정규화 후 `IssueStatus`로 역매핑하되 **`VALID_ISSUE_TRANSITIONS` 유효성**을 통과 못 하는 점프(예: DONE→TODO 직접)는 거부하고 conflict 정책 발동.
- 미정의/테넌트 미존재 transition은 자동 매핑하지 않고 **사람 확인 큐**로(fail-closed).

### 4.5 Read-only Enrichment 데이터 계약

**불변식**: neurons = read-only mirror. board 표시는 카드 frontmatter를 건드리지 않고 런타임 오버레이로만 부착(`.md` SoT 불침범).

| board 위치 | 표시 항목 | 데이터 출처 (MCP tool) |
|---|---|---|
| 카드 배지 | drift 경고 | `brain_drift_explain(natural_id)` |
| 카드 메타 푸터 | 관련 decision N건 | `brain_query` / `knowledge_search` |
| 카드 hover | evidence 링크 | `brain_evidence_get` |
| 카드 아이콘 | 과거 incident 연관 | `brain_incident_search(slug)` |
| 그래프 패널 | `DEPENDS_ON`/`PART_OF` 이웃 | `OntologyEpisode.relations[]` traversal |

**Enrichment payload 계약 (board가 받는 read-only DTO):**

```
EnrichmentOverlay {
  issueId: "VC-001",                 // join key
  natural_id: "/project/vc#VC-001",
  driftCount: number,                // null이면 미조회 (캐시 미스 ≠ 0)
  decisions: [{ memory_id, title, ts }],
  evidence:  [{ memory_id, locator }],
  incidents: [{ id, summary }],
  graphNeighbors: [{ rel: "DEPENDS_ON", target: "VC-002" }],
  fetchedAt: ISO8601,                // staleness 표시용
  source: "neurons-mirror"           // 출처 명시 (편집 불가 UI 신호)
}
```

- **쓰기 금지 계약**: overlay는 frontmatter나 `sync.*`에 절대 write-back하지 않는 휘발성 DTO.
- **redaction 게이트(GAP#4)**: enrichment가 외부(팀 Confluence 발행) 경로에 합류할 때만 dendrite `redact_public_ingress_text`(redaction.v2) 통과. board 로컬 표시(개인 컨텍스트)는 redaction 불필요.

### 4.6 진화 경로: A(현재) → B(1급 통합) → C(그래프 자동화)

| 차원 | A: read-only enrichment (현재) | B: 1급 통합 모델 | C: 그래프 자동화 |
|---|---|---|---|
| neurons 역할 | read-only mirror, overlay 표시 | canonical task의 부속 `typed_payload`가 양방향 동기화 | graph가 transition을 유발(decision→상태 제안) |
| 데이터 모델 | `CanonicalTaskModel` 불변, overlay는 별도 DTO | `CanonicalTaskModel`에 `knowledge_ref{decisions[], evidence[]}` 신설, neurons가 한정 필드 write 권한 획득 | `OntologyEpisode.relations`가 1급 SoT 후보, kanban이 graph view 구독 |
| join key | `natural_id` 결정론적 생성 | 동일 + neurons `memory_id` 역참조 캐시 | graph node id가 `task_ref`와 동급 |
| SoT 경계 | `.md` 절대 불침범 | `.md` SoT 유지, neurons는 enrichment 필드만 propose(인간 승인) | `.md` ↔ graph 양방향, conflict 머지 정책 필수 |
| **전환 트리거** | — | (1) enrichment 표시 채택률 안정 (2) kanban↔neurons 어댑터/MCP client 구현 완료 (3) 이중 SoT conflict 정책 합의 | (1) `OntologyEpisode.relations` 신뢰도 검증 (2) graph→상태 제안 false-positive 율 임계 이하 (3) 자동 transition fail-closed 게이트 검증 |

---

## 5. 시스템 통합 아키텍처

책임 경계의 핵심은 **kanban = "무엇을 보낼지(canonical 변환·정책·식별자·write-back)" / routine-harness = "어떻게 실제로 쓸지(Basic Auth·ADF/Storage·승인 게이트)"** 의 **하이브리드 비대칭 분업**이다.

### 5.1 컴포넌트 다이어그램

```
                           ┌──────────────────────────────────────────────────────────┐
                           │  SoT 경계 (개인, 침범 금지)                                │
   IssueFrontmatter(.md) ──┤  ┌────────────────────── kanban-task-engine ──────────┐ │
   VC-001 / OC-001         │  │ unified-vault-loader → parser → CanonicalTaskModel │ │
   KANBAN_HOME Vault       │  │ StateMachine(6) · PolicyEngine · RuntimePolicy(FC)  │ │
   registry.yaml(VC/OC)    │  │ SyncCoordinator · sync.jira/.confluence write-back  │ │
   Obsidian board=proj.    │  └───┬───────────────┬──────────────────┬─────────────┘ │
                           └──────┼───────────────┼──────────────────┼───────────────┘
            (A) enrichment 주입   │  (B) export    │  (C) redaction   │ (B) write-back
            read-only            ▼  payload        ▼  게이트           ▲ sync.*
        ┌───────────────┐   ┌─────────────────┐  ┌──────────────┐    │
        │   neurons     │   │  routine-harness │  │   dendrite   │    │
        │ (Java/Spring) │   │  (HarnessKit)    │  │ (Python)     │    │
        │  ledger=auth  │   │ atlassian-work   │  │ redact_public│    │
        │  MemoryCard   │   │ confluence-auth  │  │ _ingress_text│    │
        │  Ontology     │   │ .acli-gateway.sh │  │ (redaction.v2)│   │
        │  MCP tools    │   │ read/write 계정  │  └──────┬───────┘    │
        └──────▲────────┘   └────────┬─────────┘         │            │
   brain_context│resolve             │ acli write        │            │
   /project/<slug>                   ▼                   ▼             │
        ┌───────┴────────┐   ┌─────────────────┐                      │
        │ dendrite ──────────▶│ Atlassian Cloud │                      │
        │ rag_ingress.v1     │ Jira(REST/ADF)   │◀── ACLI read 계정 ───┘ (D2 역류)
        │ (기존 결합 견고)    │ Confluence(XHTML)│
        └────────────────┘   └─────────────────┘
```

- **(A) enrichment**: neurons MCP `brain_context_resolve(/project/<slug>)` → board projection 메타 주입. read-only, SoT 불침범. 호출 실패는 **fail-soft**(enrichment 없는 board는 정상).
- **(B) export**: `CanonicalTaskModel` → `AtlassianExportPayload`(kanban 책임) → RH가 실제 write(acli write 계정) → 결과 key/url → kanban `sync.jira/.confluence` write-back.
- **(C) redaction**: 발행 직전 본문을 dendrite `redact_public_ingress_text` 경유.
- **(D2 역류)**: 2단계에서 ACLI read 계정 기반 `JiraWorkStateProvider`가 `SyncCoordinator.syncFromProvider`로 상태 역류.

### 5.2 책임 경계: 인터페이스 시그니처

#### 5.2.1 kanban adapter contract = "무엇을 보낼지"

기존 자산 재사용: `mapper.ts`, `sync.jira` write-back 스키마(`types.ts`), `SyncCoordinator`, 참조모델 `adapter-github`(완전 구현 `WorkStateProvider`).

```ts
// (신규) packages/adapter-atlassian-export/src/export-contract.ts
export interface AtlassianExporter {
  // CanonicalTaskModel → 전송 중립 페이로드 변환만 (실 write 안 함)
  buildPayload(
    task: CanonicalTaskModel,
    target: AtlassianTarget,
    policy: RuntimePolicy        // fail-closed (assertAdapterAllowed)
  ): AtlassianExportPayload;

  // RH write 결과 → sync.* write-back 패치만 생성
  applyWriteBack(
    task: CanonicalTaskModel,
    result: AtlassianWriteResult,
    policy: RuntimePolicy        // writeBack.allowedFields 화이트리스트 강제
  ): Partial<CanonicalTaskModel>;
}

export interface AtlassianTarget {
  kind: 'jira' | 'confluence';
  projectOrSpaceKey: string;     // join key: /project/<slug> ↔ idPrefix ↔ space.key
}
```

게이트 위치(기존 `assertAdapterAllowed`, `policy.ts`):
- `buildPayload`: `assertAdapterAllowed(policy, 'jira'|'confluence', 'externalRequest')`.
- `applyWriteBack`: `policy.writeBack.allowedFields`에 없는 필드 패치 거부, `bodyAllowed=false` 시 본문 write-back 차단.

#### 5.2.2 routine-harness component = "어떻게 실제로 쓸지"

진입은 `.acli/acli-gateway.sh <read|write> <jira|confluence>`.

```bash
# Jira create
./.acli/acli-gateway.sh write jira workitem create --from-json <payload.adf.json>
# Confluence publish
./.acli/acli-gateway.sh write confluence page create --space <KEY> --storage <xhtml>
```

| 항목 | 메커니즘 | 근거 파일 |
|------|----------|-----------|
| 인증 | Basic Auth, read/write 계정 분리 | `acli-gateway.sh:91-118` (ATLASSIAN_READ/WRITE_EMAIL+TOKEN) |
| 자격 분리 게이트 | read 모드 BLOCKED_COMMANDS(create/edit/delete) | `acli-gateway.sh:58-71` |
| 페이로드 포맷 | ADF compact / Storage Format XHTML | confluence-page-authoring skill (6 archetype) |
| 승인 게이트 | atlassian-work skill 라이브 게이트 | components/skills/atlassian-work |

**경계 결정**: kanban 현 `adapter-jira`는 Bearer token + 평문 description + `POST /rest/api/3/issue`로 실 Atlassian Cloud(Basic Auth+ADF)와 403/400 충돌(GAP#3). 따라서 `JiraAdapter.createIssue()`의 직접 HTTP write 경로는 **deprecate**하고, kanban은 `buildPayload`만 남기고 실 write를 RH에 위임한다.

### 5.3 신규 정의 contract

#### 5.3.1 AtlassianExportPayload

```ts
export interface AtlassianExportPayload {
  schemaVersion: 'atlassian_export.v1';
  target: AtlassianTarget;
  idempotencyKey: string;                  // <slug>:<task_id>:<contentHash> (dendrite 패턴 차용)
  contentHash: string;                     // sha256(요약+본문), 중복 발행 방지
  redactionApplied: boolean;               // false면 RH가 거부 (이중 게이트)

  jira?: {
    projectKey: string;
    summary: string;
    descriptionAdf: AdfDoc;                // 평문 아닌 ADF (RH가 최종 직렬화)
    issueType: IssueType;
    priority: Priority;
    labels: string[];
    statusHint?: string;                   // toJiraStatusHint() → transition 힌트
  };

  confluence?: {
    spaceKey: string;
    title: string;
    archetype: ConfluenceArchetype;        // RH 6 archetype 중 하나
    storageBodyRef: string;                // XHTML 본문 locator (redaction 후)
    ancestorPageId?: string;
  };
}

export interface AtlassianWriteResult {
  target: AtlassianTarget;
  ok: boolean;
  jira?: { key: string; url: string };
  confluence?: { pageId: string; spaceKey: string; url: string };
  writtenBy: 'acli-write-account';
  exportedAt: string;                      // ISO8601
}
```

`idempotencyKey`/`contentHash`는 dendrite `rag_ingress_enqueue.v1`(outbox_client.py)에서 검증된 멱등 패턴 재사용.

#### 5.3.2 kanban → RH 전달: 신규 adapter (retro-bind 아님)

retro-bind evidence payload는 dendrite→neurons 단방향 ingest 채널이라 발행 결과(key/pageId)를 동기로 회수할 수 없다. 발행은 write-back을 위해 **요청-응답**이 필요하므로 신규 adapter 경로를 둔다.

```ts
export interface AtlassianWriteBridge {
  publish(payload: AtlassianExportPayload): Promise<AtlassianWriteResult>;
}
// 구현체: AcliGatewayBridge — child_process로 acli-gateway.sh write 실행.
//   kanban은 자격증명을 소유하지 않는다 (RH env file 600 모드).
```

#### 5.3.3 sync.confluence 스키마 (기존 `Sync.jira`와 대칭 신규)

```ts
export interface Sync {
  last_synced_at: string;
  last_source: 'local' | 'github' | 'firebase';
  checksum?: string;
  jira?: { key?: string; status?: string; exportedAt?: string };
  confluence?: {                  // 신규
    pageId?: string;
    spaceKey?: string;
    version?: number;             // Confluence 낙관적 잠금
    exportedAt?: string;
    contentHash?: string;         // 변경 없으면 재발행 skip
  };
}
```

work 정책 `writeBack.allowedFields`에 `sync.confluence.{pageId,spaceKey,version,exportedAt,contentHash}` 추가 필요.

### 5.4 kanban ↔ neurons enrichment 경로 (read-only)

```ts
// (신규) packages/neurons-enrichment/src/enrichment-provider.ts
export interface BoardEnrichmentProvider {
  resolveContext(projectSlug: string): Promise<BrainContext>;       // brain_context_resolve
  cardKnowledge(taskNaturalId: string): Promise<CardKnowledge>;     // task card + decision/drift/incident
}

export interface CardKnowledge {
  decisions: DecisionRef[];     // OntologyEpisode relations
  drifts: DriftRef[];
  incidents: IncidentRef[];
  readOnly: true;               // 컴파일타임 불변 — write 경로 없음
}
```

Obsidian board renderer가 카드 렌더 시 `cardKnowledge(VC-001)`를 호출해 메타 뱃지/그래프 링크로만 표시. 호출 실패는 fail-soft. join key naming 3-way 일치는 미검증(GAP#2).

### 5.5 redaction 게이트 배선

```
buildPayload() ──▶ [redaction gate] ──▶ payload.redactionApplied=true ──▶ AtlassianWriteBridge.publish()
                        │
                        ▼ dendrite redact_public_ingress_text(body)
                  (private path / Bearer / Basic / Cookie / api_key 제거)
```

- 게이트는 `descriptionAdf` 직렬화 직전, `storageBodyRef` 본문 생성 직전 둘 다 적용.
- **이중 게이트**: kanban이 1차 redact 적용(누출 표면 최소화), 발행 책임자인 RH가 마지막 게이트 소유 — `redactionApplied !== true`면 RH write component가 거부.
- 언어 경계(TS↔Python) 호출 방식은 미해결 질문(§8).

### 5.6 인증 모델: 계정 분리

kanban은 자격증명을 보유하지 않는다. 모든 Atlassian 자격은 RH의 `~/.config/acli/.acli-gateway.env`(mode 600 강제)에 격리.

| 작업 | 계정 | 게이트 | 경로 |
|------|------|--------|------|
| 발행(create/update) | WRITE (`ATLASSIAN_WRITE_*`) | role=write | `acli-gateway.sh write ...` |
| 상태 역류(read) | READ (`ATLASSIAN_READ_*`) | role=read, BLOCKED_COMMANDS | `acli-gateway.sh read ...` |

- D2 1단계: WRITE 경로만(단방향 발행).
- D2 2단계: READ 경로로 `JiraWorkStateProvider.fetchTasks/pushStatus` 구현 → `SyncCoordinator` 등록. 이때 `ConflictResolution='local-wins'`로 개인 SoT 우선 보장.

---

## 6. 기능 범위 & 단계적 로드맵

### 6.1 의존성 순서 — 왜 status 매핑·naming 통일·jira 인증 교정이 선행인가

```
[선행 GAP 차단막]                      [그 위에 쌓이는 기능]
GAP#1 3-way status 매핑  ──┐
GAP#2 project naming 통일 ──┼──> Phase0 Export (Jira/Confluence 발행)
GAP#3 jira 인증/페이로드  ──┘         │
                                      └──> Phase1 enrichment 읽기
                                              │
                                              └──> Phase2 양방향(역류)
```

1. **GAP#3 (인증/페이로드)** — 교정 없이 Export하면 실 테넌트에서 즉시 403(Bearer vs Basic)/400(평문 vs ADF)으로 **전량 실패**. 가장 먼저.
2. **GAP#1 (3-way status 매핑)** — 매핑 없이는 카드 상태를 Jira로 보낼 수도, Jira 상태를 해석할 수도 없다. **단일 진실원**이어야 Phase2 역류가 안전.
3. **GAP#2 (naming 통일)** — `/project/<slug>`가 모든 cross-repo 라우팅의 주소 체계. 코드 작성 전 합의 필요.

### 6.2 MVP (Phase 0) 정의

가치 가설: *"개인 .md Vault의 칸반 1개 프로젝트를, 안전한 승인 게이트를 거쳐 Jira/Confluence에 단방향 발행할 수 있고, 그 발행이 실 Atlassian Cloud에서 실제로 동작한다."*

**In-scope (Phase 0):**

| 항목 | 내용 | 닫는 GAP |
|------|------|---------|
| 3-way status 매핑 테이블 | `IssueStatus(6) ↔ neurons task.status ↔ Jira transition` 단일 테이블. `adapter-github/status-mapping.ts` 패턴 복제 | #1 |
| project naming 합의+검증 | `/project/<slug>` 규약 문서화 + registry.yaml `external` 매핑 일치 검증 스크립트(읽기 전용) | #2 |
| jira 인증/페이로드 교정 | Bearer→Basic Auth(read/write 계정 분리), 평문→ADF. 실 write는 RH 위임 | #3 |
| Jira Export (CREATE) | canonical→ADF 변환은 kanban, 실제 POST는 RH. dryRun 기본 ON, 승인 게이트 필수 | #3 |
| Confluence Export (1 archetype) | board projection → 1 archetype XHTML 발행. RH confluence-page-authoring 위임 | #4(부분) |
| sync.jira write-back | 발행 성공 시 `.md`에 `sync.jira.{key,status,exportedAt}`만 기록 | — |
| RuntimePolicy fail-closed | 모든 외부 write 게이트 통과, dryRun 기본값 유지 | — |

**Out-of-scope (Phase 0) — 명시적으로 하지 않음:** 역방향 동기화(Phase2) · kanban↔neurons 어댑터/MCP client(Phase1) · enrichment 표시(Phase1) · 이중 SoT conflict 정책(Phase2, 단방향이라 충돌 불가능하므로 의도적 연기) · redaction 배선(Phase1) · B/C(Phase3) · Jira UPDATE/transition(Phase2) · 다중 archetype(Phase1+).

### 6.3 Phase 표 (DoD 포함)

| Phase | 목표 | 핵심 산출물 | 완료 기준 (DoD) | 닫는 GAP |
|-------|------|-----------|----------------|---------|
| **Phase 0 (MVP)** Export + 선행 차단막 | .md 1개 프로젝트를 Jira/Confluence에 안전 단방향 발행, 가치 검증 | ① 3-way status 매핑 테이블 ② naming 검증 스크립트 ③ Basic Auth+ADF 교정 Jira Export(RH 위임) ④ Confluence 1-archetype 발행 ⑤ sync.jira write-back | 실 Atlassian Cloud 테넌트에서 칸반 1프로젝트가 dryRun→승인→실제 발행되어 Jira 이슈/Confluence 페이지 생성, .md에 sync.jira 기록. **403/400 0건** | #1,#2,#3,#4(부분) |
| **Phase 1** Enrichment 읽기 (A) | neurons knowledge를 board 카드 메타·그래프로 read-only 표시. redaction 배선 | ① kanban→neurons MCP client(읽기 전용) ② 카드 메타 enrichment ③ board projection 렌더 ④ redaction.v2 게이트 배선 ⑤ Confluence 추가 archetype | 카드의 decision/drift/incident가 board·Confluence에 표시되고, **.md SoT는 단 1바이트도 변경 안 됨**(read-only mirror 증명). redaction 통과 로그 확인 | #4(neurons·redaction) |
| **Phase 2** 양방향 (역류) | Jira 상태를 canonical로 역류. 이중 SoT conflict 정책 | ① WorkStateProvider 구현(Jira→canonical) ② 3-way 매핑 역방향 사용 ③ SyncCoordinator 배선 ④ conflict 정책(SoT 우선+리포트) ⑤ Jira UPDATE/transition | Jira 상태 변경 → canonical 반영 제안 → SoT 정책에 따라 적용/거부. 동시 변경 시 conflict 정책 결정론적 동작. 양방향 round-trip 1건 성공 | #1(역방향),#4(WorkStateProvider·conflict) |
| **Phase 3** B/C 진화 | enrichment(A)→1급 통합(B)→그래프 자동화(C) | ① B: neurons MemoryCard를 canonical 1급 필드로 통합 ② C: OntologyEpisode relations 기반 자동 분류/연결 제안 | (트리거 충족 시) B는 enrichment가 의사결정에 정기 사용되고 read-only가 병목일 때. C는 그래프 관계가 수동 분류를 능가할 때 | 진화 경로 |

### 6.4 전환 트리거

**6.4.1 Export → Bidirectional (Phase0/1 → Phase2) — 아래 모두 충족 시:**

| # | 조건 | 근거 |
|---|------|------|
| T1 | Phase0 Export가 실 테넌트에서 4주 이상 무장애 운영 | 단방향 신뢰 확보 전 양방향은 SoT 오염 위험 |
| T2 | 팀원이 Jira 상태 변경의 Vault 반영을 원하는 **실수요 발생** | 수요 없는 양방향은 기술 부채 |
| T3 | 3-way status 매핑이 양방향 무손실(round-trip lossless)로 검증 | GAP#1이 역방향까지 닫혀야 안전 |
| T4 | conflict 해소 정책 합의(SoT 우선 + 리포트) | 정책 없이 켜면 데이터 손실 |

**6.4.2 A → B → C:**

| 전환 | 트리거 (모두 충족) | 미충족 시 |
|------|-----------|----------|
| A → B | ① enrichment가 board 의사결정에 정기적(주 단위) 참조 ② read-only 조회 지연/병목이 사용성 저해 ③ neurons knowledge를 canonical 검색/필터 1급 대상으로 다루려는 수요 | A 유지 |
| B → C | ① OntologyEpisode relations 품질이 수동 분류를 능가(정밀도 검증) ② 자동 연결/분류 제안 오탐이 허용 임계 이하 ③ SoT 불침범 제안-승인 모델로 설계 가능 | B 유지 |

공통 안전장치: B/C 어느 단계든 **`.md` SoT 불침범(D1) 위배 시 즉시 중단**. neurons는 끝까지 mirror, 자동화는 항상 제안→승인.

### 6.5 GAP ↔ Phase 매핑

| GAP | 설명 | 닫는 Phase |
|-----|------|-----------|
| #1 | 3-way status 매핑 부재 | 정방향 **Phase0**, 역방향(round-trip) **Phase2** |
| #2 | project naming 3-way 미검증 | **Phase0** (검증 스크립트 + 규약 합의) |
| #3 | jira 인증/페이로드 충돌(403/400) | **Phase0** (Basic Auth+ADF, RH 위임) |
| #4 | kanban↔neurons 0건 / Confluence 0건 / WorkStateProvider 미구현 / conflict 정책 부재 / redaction 미배선 | Confluence→**Phase0(1)·Phase1(다중)**, neurons+redaction→**Phase1**, WorkStateProvider+conflict→**Phase2** |

GAP#4는 단일 GAP이나 5개 하위 항목으로 분해되어 위험·의존도 순으로 Phase0~2에 분산 적용된다(의도적).

---

## 7. 거버넌스 · 보안 · NFR

코드 검증 기반:
- `packages/schema/src/status.ts`: 6상태 전이 머신 + `toJiraStatusHint()` 존재. **mapper 미연결 확인.**
- `packages/adapter-jira/src/jira-adapter.ts`: `Authorization: Bearer ${token}`로 `POST {baseUrl}/rest/api/3/issue`. `dryRun` 플래그 + `assertAdapterAllowed(policy,'jira','externalRequest')` 게이트 존재. **Bearer/Cloud(Basic+ADF) 충돌 확인.**
- `packages/core/src/sync-coordinator.ts`: `computeChecksum`/`hasChanged` + `ConflictResolution`(`local-wins`(기본)/`provider-wins`/`newest-wins`) 존재 — **SoT 정책 강제 수단이 이미 코드에 있음.**
- `packages/cli/src/policy.ts`: `RuntimePolicy{allowedSideEffects, allowedAdapters}` 로드.

### 7.1 SoT 정책 — 권위 비중첩 (D1 + D3)

이중 권위가 충돌하는 두 축을 분리해 각각 단일 권위로 못박는다.

| 데이터 축 | SoT (단일 권위) | 종속 투영(read-only) | 충돌 회피 규칙 |
|---|---|---|---|
| **Task lifecycle** (status, 전이, frontmatter) | **.md Vault (KANBAN_HOME)** | Jira issue, Confluence page, neurons `card_type=task` mirror | `SyncCoordinator.conflictResolution='local-wins'` 고정 (lifecycle 한정) |
| **Knowledge enrichment** (decision/drift/incident/evidence) | **neurons Ledger** (knowledge 도메인 한정 authority) | board 카드 메타 배지, 그래프 패널 | kanban은 neurons를 read-only로만 조회. `.md`에 write-back 안 함 |

핵심 원칙 — **권위 비중첩(non-overlapping authority)**: neurons Ledger의 "canonical authority"는 knowledge 도메인 한정이고 task lifecycle의 authority가 아니다. 두 SoT는 같은 필드를 두고 경쟁하지 않으므로 conflict가 구조적으로 발생 불가. 2단계 Jira 역류에서만 실제 양방향 conflict 가능 → 이때도 `local-wins`가 lifecycle을 보호하고 Jira 변경은 `sync.jira.status` 미러 필드에만 반영 후 **사람 확인 큐**로 보낸다(자동 .md 덮어쓰기 금지).

```
SoT 권위 맵 (충돌 0 보장)
┌──────────────── lifecycle 축 ─────────────────┐
.md Vault ──(publish, local-wins)──> Jira / Confluence / neurons.task(mirror)
     ▲ 절대 자동 덮어쓰기 안 됨 (2단계 역류는 human-queue 경유)

┌──────────────── knowledge 축 ─────────────────┐
neurons Ledger ──(read-only enrich)──> board 배지 / 그래프 패널
     ▲ kanban은 조회만. .md 불침범 (D3)
```

### 7.2 승인 게이트 (이중 직렬 게이트)

실 Atlassian write는 **2중 직렬 게이트**를 모두 통과해야 한다. 어느 하나라도 미충족이면 fail-closed.

```
kanban canonical 변환
   │
   ├─[게이트 1: RuntimePolicy fail-closed]  (kanban 내부, 코드化됨)
   │     assertAdapterAllowed(policy,'jira'|'confluence','externalRequest')
   │     - policy 없으면 throw  ← 이미 구현
   │     - allowedAdapters/allowedSideEffects 미허용 시 거부
   │     - dryRun=true 면 payload만 반환, 네트워크 호출 안 함  ← 이미 구현
   │
   └─[게이트 2: routine-harness human 승인]  (실 write 직전)
         - main-session/human 승인 필수 (RH 강제, 라이브 증명 DEFERRED)
         - .acli/acli-gateway.sh 쓰기 계정 사용은 승인 후에만
         - 미승인 → 발행 중단
```

- kanban은 절대 직접 실 테넌트에 write 하지 않는다. 게이트1 통과 후 payload를 RH에 넘기고 실 write는 RH가 수행.
- `dryRun` 기본값은 안전을 위해 유지(최근 커밋 `a5d47ad`가 dryRun default를 안전 쪽으로 revert함). 실 발행은 명시적 `--no-dry-run` + 게이트2 승인 동시 충족.
- 승인 단위 = **배치 발행 1회**(board projection 묶음)에 대한 diff 요약(생성/갱신/상태전이 N건) 제시 후 승인.

### 7.3 보안

| 보안 항목 | 현재 상태(검증) | 교정 |
|---|---|---|
| **인증 방식** | `Bearer ${token}` (jira-adapter.ts L34) | Atlassian Cloud는 Basic Auth(email:API_token, base64) 필요 → Bearer는 401/403. 실 write를 Basic Auth 보유 RH로 위임하면 자동 교정. kanban adapter는 dryRun/payload 검증 전용으로 강등 |
| **credential 분리** | RH `.acli`에 읽기/쓰기 계정 분리 존재 | 읽기=read 계정, 실 write=write 계정. kanban→RH 호출 시 의도(read/write) 명시로 계정 선택 강제 |
| **redaction 강제 지점** | dendrite `redact_public_ingress_text`(redaction.v2) 보유, kanban 미배선 | 두 출구에 강제: ① kanban→neurons 발행(task mirror) ② kanban→Atlassian 발행(public surface). 평문 description/title/labels를 redaction 통과 후에만 payload화 |
| **secret 비노출** | adapter config에 `token` 평문 필드 | secret은 RH 게이트웨이 런타임 env/credential store에만. payload·로그·neurons mirror·Confluence page에 token 미포함. 감사 로그 secret 마스킹 |
| **description 평문** | jira payload description 평문(ADF 아님) | redaction 후 ADF 변환은 RH 책임. 변환 정확도는 NFR readback으로 검증 |

### 7.4 NFR (비기능 요구)

| NFR | 메커니즘 (검증된 자산 재사용) | 수용 기준 |
|---|---|---|
| **멱등성** | dendrite `idempotencyKey`+`contentHash` 패턴 재사용. `sync.jira.key` 존재 시 create→update(upsert). neurons: `natural_id`+`memory_id` | 동일 board 2회 발행 → 중복 issue/page/card 0건 |
| **drift 감지** | `SyncCoordinator.computeChecksum`+`hasChanged`(이미 구현). projection checksum을 `sync.checksum`에 저장, 발행 전 비교 | 변경 없으면 no-op, drift 시에만 발행 |
| **관측/감사 로그** | 발행 1건당 audit record: {who(승인자), what(card ids), target, dryRun, 게이트1/2 결과, idempotencyKey, status} | secret 마스킹. 실패/거부도 기록(silent failure 금지) |
| **포맷 변환 정확도** | ADF(Jira)·Storage Format XHTML(Confluence) 변환 후 **readback 검증**: 발행 직후 read 계정 재조회 → canonical 핵심 필드(summary/status/key) 일치 확인 | 불일치 시 발행 실패+감사 로그. archetype별 1회 readback 골든 테스트 |
| **상태 매핑 정합성** | GAP#1 해소: 3-way 테이블 단일 SoT 모듈. `toJiraStatusHint` 재사용+transition id 매핑 추가 | 6상태 전부 매핑 + 미정의 상태 fail-closed |

### 7.5 리스크 레지스터

| 리스크 | 영향 | 완화책 |
|---|---|---|
| **인증 충돌 silent failure** (Bearer vs Basic) | 403/401인데 게이트가 통과로 오인 → 발행 누락/부분 발행 | (1) 실 write를 Basic Auth 보유 RH로 위임 (2) `response.ok` 외 401/403 별도 분기+감사 로그 (3) readback 교차 검증 |
| **이중 SoT conflict** (.md vs neurons Ledger) | lifecycle 덮어쓰기, 권위 모호 | 권위 비중첩(§7.1): lifecycle=.md, knowledge=Ledger. `conflictResolution='local-wins'` 고정. 2단계 역류는 human-queue 경유 |
| **미검증 RH 컴포넌트 자동발행** (라이브 증명 DEFERRED) | 미검증 코드가 실 테넌트에 잘못된 write | (1) §7.2 human 게이트2 필수 (2) dryRun→readback 검증 전 `--no-dry-run` 차단 (3) 첫 발행은 비프로덕션 space 골든 테스트 |
| **PII/secret 노출** (description 평문, public surface) | 공개 Confluence/Jira에 민감정보 유출 | redaction 강제(§7.3)를 neurons·Atlassian 두 출구에 배선. secret은 RH 런타임에만 |
| **Graphiti Null adapter** (OntologyEpisode/Neo4j 미가동) | 그래프 enrichment 패널 빈 데이터/예외 | enrichment는 read-only 부가기능 → graceful degrade(배지/패널 숨김), board lifecycle 영향 0. MCP timeout+fallback |
| **draw.io cold-start** (그래프 시각화 초기 지연) | 첫 탐색 응답 지연 | enrichment 비동기 lazy-load, lifecycle critical path와 분리. 캐시 스냅샷 우선 표시 후 갱신 |
| **project naming 3-way 불일치** (GAP#2) | join key `/project/<slug>` 불일치로 잘못된 brain/space 발행 | 발행 전 idPrefix↔brain_id↔space.key 3-way 일치 **검증 게이트**(불일치 시 fail-closed). registry.yaml을 naming SoT로 |

---

## 8. 미해결 질문 & 다음 액션 (우선순위 순)

### P0 — Phase 0 착수 전 반드시 해소 (선행 차단막)

1. **project naming 3-way 실제 일치 검증** — kanban idPrefix(VC/OC) ↔ neurons brain_id(`/project/<slug>`) ↔ Confluence space.key가 실제 데이터에서 일치하는지. `idPrefix`는 `[A-Z][A-Z0-9]*`만 허용하나 brain_id slug는 소문자 → 단순 `toLowerCase`로 충분한지, 다중 단어 space에서 slug 충돌(예: VCORE vs VC)이 없는지 실제 brain_id 목록과 대조. **액션**: registry.yaml `external` 매핑 필드 신설 + reconcile ping 스크립트(읽기 전용).
2. **Jira transition id 가변성** — transition은 테넌트별 워크플로마다 다름. `registry.yaml`에 space별 transition 매핑을 둘지, 발행 시 동적 조회할지 결정(GAP#1 완결 조건). **액션**: routine-harness `.acli`로 대상 테넌트 transition 목록 조회, `READY`/`REVIEW`/`Blocked` 실재 여부 확인.
3. **RH 라이브 런타임 증명** — `acli-gateway.sh` 실 write가 DEFERRED 상태. Phase0 DoD의 "실 테넌트 발행 성공"을 어떻게 증명할지. **액션**: 비프로덕션 space에서 RH write 1건 골든 테스트 선행.
4. **AtlassianWriteBridge ↔ acli-gateway 호출 계약** — payload 전달(stdin JSON vs temp file)과 결과 파싱(acli 출력이 JSON인지 사람용 텍스트인지) 미검증. **액션**: acli 출력 포맷 실측 후 파싱 계약 고정.

### P1 — Phase 0 내 결정

5. **발행 트리거 시점** — `REVIEW→DONE 승인`으로 가정했으나, REVIEW 단계 또는 임의 시점 수동 발행 수요 미확정.
6. **Confluence 첫 archetype 선정** — 6 archetype 중 board projection과 가장 잘 맞는 것(status board vs decision log 등). CanonicalTaskModel의 어떤 필드(issue_type? labels?)가 archetype에 매핑되는지 룰 미정의.
7. **`RuntimePolicy.allowedAdapters`에 'confluence' 추가** — Confluence 코드 0건이라 게이트1을 통과할 어댑터 contract 형태(create/update page) 미정의. RH 위임 인터페이스와 함께 확정.
8. **Phase0 가치 검증 정량 KPI** — 발행 프로젝트 수, 팀원 조회 횟수, 수동 복붙 대비 절감 시간 등 KPI 미정.

### P2 — Phase 1 (enrichment·redaction) 결정

9. **Issue 본문 `## Decision`/`## Evidence` 파싱 규약** — 코드에 없음. 마크다운 heading 기반 추출인지, frontmatter 배열(`decision_refs[]`)인지 본문 구조 컨벤션 확정.
10. **neurons `MemoryCard.typed_payload.status` 실제 스키마** — enum 값/대소문자 미확인. canonical 6상태 그대로 mirror할지, neurons 자체 vocabulary로 변환할지 neurons 측 스키마 확인.
11. **redaction 언어 경계 구현** — kanban(TS)이 dendrite(Python) `redact_public_ingress_text`를 어떻게 호출(CLI subprocess vs RH 내부 강제 vs 포팅)할지. RH가 마지막 게이트면 kanban 1차 게이트 메커니즘은?
12. **redaction 적용 범위** — neurons task mirror 발행 시 `typed_payload` 전체인지 특정 필드(summary/description)만인지. dendrite 입력이 텍스트라 구조화 payload 매핑 규칙 미정.
13. **enrichment 호출 빈도/캐싱** — board 렌더마다 MCP `brain_context_resolve` 동기 질의 시 비용/지연. 캐시 TTL·무효화 트리거 정의.

### P3 — Phase 2 (양방향·conflict) 결정

14. **이중 SoT conflict 구체 규칙** — Jira와 .md가 동시에 다른 상태일 때 항상 .md 우선인지, 타임스탬프(`sync.jira.exportedAt`/신설 `sync.neurons.mirroredAt` vs frontmatter `updated`) 기반인지, 사용자 승인 요구인지.
15. **사람 확인 큐 구현체/SLA** — 파일 기반 vs neurons 카드 vs board 알림. Jira status 변경을 `sync.jira.status` 미러 반영 후 큐로 보내는 경로의 SLA 미정.
16. **역류 필드 범위** — status만 역류할지, assignee/labels 등도 역류할지. `local-wins`에서 어떤 필드를 provider-wins 예외로 둘지(예: Jira에서만 변경되는 sprint).
17. **FAILED→Blocked 테넌트 실재 검증** — Blocked 상태가 워크플로에 실재하는지 `.acli`로 검증, 없으면 To Do category 폴백.

### P4 — Phase 3 (B/C 진화) 결정

18. **B/C 전환 정량 임계값** — enrichment 사용빈도 "X 이상", 그래프 false-positive 율 임계 등 측정 지표·수치를 후속 확정.
19. **B단계 `knowledge_ref{}` write 화이트리스트** — neurons가 propose 가능한 필드 구체 범위.

---

## 부록 A. P0 실측 반영 (2026-06-20, Probe Findings)

본문 작성 후 4개 repo를 read-only 실측한 결과. 본문과 충돌 시 **이 부록이 우선**한다.

| 항목 | 본문 가정 | 실측 결과 | 영향 |
|---|---|---|---|
| **naming 3-way 매핑** | `/project/<slug>` 자동 매핑 후보 (toLowerCase) | **REFUTED.** idPrefix=`^[A-Z][A-Z0-9]*$`, brain_id=변환 없는 concat. `OC≠openclaw`, `VC≠vibe-coding`. | **명시 매핑 테이블 필수** (ADR-0001). |
| **registry 현황** | RegistrySpace(idPrefix 등) | **live vault registry.yaml = legacy schema** (`workspace_path`+`board`). 현행 로더 즉시 실패. idPrefix는 test fixture(OC/VC)에만. | **registry 마이그레이션을 선결로 격상** (ADR-0002, M2). `config/workspaces.json`(5)↔vault(6) drift. |
| **neurons status** | `typed_payload.task.status` | **enum 아닌 자유형 문자열.** `TERMINAL_TASK_STATUSES={done,resolved,closed,cancelled}`만 고정. | kanban→neurons 정규화 경계 필요 (ADR-0003). |
| **acli 계약** | (미상) | positional args, `--description` inline(`--description-file` 금지), 출력 **사람용 텍스트**(JSON 아님), read/write 계정 분리(`~/.config/acli/.acli-gateway.env` 600), Confluence write는 acli verb 없어 **REST publish recipe**(curl+Basic+v1). | §5.2.2·§5.3 계약 확정. readback은 별도 read. |
| **live 증명** | DEFERRED 추정 | **CONFIRMED.** `component.yml runtime_support_claimed:false`, capabilities.yml atlassian static_contract 부재. | safe tenant+명시 승인 전 불가. M5 human-gate 고정. |
| **Confluence archetype** | 6 archetype | board projection 1순위=**Operational updates**(6-section), 2순위 Quality reports, bind-back Implementation notes. 실 space.key 전부 placeholder. | M4 probe로 space.key 실값 확보. |
| **frontmatter 스키마** | 단일 IssueFrontmatter | **불일치.** 템플릿(`type/...`) vs live 실파일(`issueType/automation/...`). | canonical 확정 task 필요 (OQ). |

**부록 결론**: 본문 §6 로드맵의 Phase 0 앞에 **M2 registry 마이그레이션 + naming 매핑**이 물리적 선결로 추가된다. 자세한 실행 계획은 [`../specs/atlassian-porting/milestones.md`](../specs/atlassian-porting/milestones.md) 참조.
