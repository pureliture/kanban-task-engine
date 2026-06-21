# Milestones — 온톨로지 기반 통합 칸반보드 → Atlassian 포팅

> **실행 게이트 (agentic-execution).** SoT는 [`requirements.md`](./requirements.md). 이 문서는 진행 상태와 exit-gate를 추적한다.
> 규칙: 각 Milestone은 **exit-gate(증거 기반)** 통과 전까지 다음으로 넘어가지 않는다. live write가 닿는 단계는 **human-gate** 필수.
> 상태 범례: ☐ TODO · ◐ IN_PROGRESS · ☑ DONE · ✋ HUMAN-GATE

---

## 진행 상태 요약

| M | 제목 | 상태 | exit-gate |
|---|------|------|-----------|
| M1 | 환경/하니스 셋업 | ☑ DONE | worktree + requirements/milestones/ADR + 검증 스크립트 골격 존재 |
| M2 | registry 마이그레이션 + naming 매핑 | ☑ DONE | legacy→RegistrySpace 마이그레이션 + external 매핑 검증 통과 |
| M3 | status/transition 브리지 | ☑ DONE | 3-way 매핑 SoT 상수 + 단위테스트 green |
| M4 | acli read 경로 검증 (Atlassian) | ⏸ DEFERRED | Atlassian 현재 불가 — 보류 |
| M5 | safe-tenant live 증명 (Atlassian) | ⏸ DEFERRED | Atlassian 현재 불가 — 보류 |
| M-GH | GitHub Projects 칸반 발행 (Jira 대체) | ☑ DONE | draft 발행 + status 매핑 readback 검증 |
| — | Confluence | ✖ SKIP | 사용자 결정으로 완전 스킵 |
| M-N | neurons enrichment (Phase 1, read-only) | ☑ DONE | HTTP+stdio client, 실 mcp-http end-to-end 검증(ssh터널). 뱃지 데이터 표시는 brain 매칭 의존 |

---

## M1 — 환경/하니스 셋업 (현재)

**목표**: 장기 단일-goal 작업의 격리 작업공간·SoT·실행 게이트·ADR·검증 스크립트 골격 확보.

- ☑ home worktree 생성 (`claude/atlassian-porting-home`, main 기반)
- ☑ `requirements.md`(SoT) · `milestones.md`(게이트) 작성
- ☑ ADR 0001(naming) · 0002(registry external) · 0003(status bridge) 초안
- ☑ `scripts/verify-naming-three-way.ts` · `scripts/probe-acli-transitions.sh` 골격
- ☑ PDD를 worktree로 복사 + P0 실측 부록 반영 (`docs/atlassian-porting-pdd.md`)
- ☑ `CLAUDE.md` overlay (경계·검증명령·하니스 규칙)
- ☐ 실행 하니스: **user-level skill 직접 사용** (`grill-to-spec`, `agentic-execution`, `worktree-lifecycle`). routine-harness 설치 안 함.
- ☐ 추적 매체: 현재 worktree 내부 추적. live vault dogfooding 승격은 **M2 통과 후 결정**.

**exit-gate**: 위 산출물 존재 + `requirements.md`/`milestones.md` 정합.

---

## M2 — registry 마이그레이션 + naming 매핑 (P0-1) ☑ DONE (2026-06-20)

**목표**: live vault legacy registry를 현행 schema로 마이그레이션하고, kanban idPrefix ↔ neurons brain_id ↔ Confluence space.key 명시 매핑을 확립.

- ☑ ADR-0001 Accepted (명시 매핑 테이블 채택, toLowerCase REFUTED 근거)
- ☑ ADR-0002 Accepted (registry `external` 섹션 schema + legacy→RegistrySpace 마이그레이션)
- ☑ space별 idPrefix 확정 (OPC/STK/VBC/PSN/WEB/CAR, 사용자 승인)
- ☑ `RegistrySpace.external` schema 추가 (비파괴, core test 340 green)
- ☑ live registry.yaml 마이그레이션 (외부 백업 → atomic 교체, 6 space 로드 OK)
- ☑ `config/workspaces.json` career 추가 (drift 해소)
- ☑ `verify-naming-three-way.ts` 동작 — 0 error, 6 warn(confluence placeholder, M4)

**exit-gate**: ☑ 마이그레이션된 registry를 현행 로더가 읽고(6 space), naming 검증 스크립트 0 error.

**후속(분리)**: vibe-coding 기존 issue 3건은 `issue-*` id(idPrefix 비기반). `id.startsWith('VBC-')` 검증은 *issue 로드* 시점에 일어나므로 M2(registry)엔 불필요. id 재발급(`issue-* → VBC-*`)은 `KANBAN.md`/board의 `[[issue-*]]` wikilink 동반 수정이 필요 → **issue 로딩/board projection 활성화 시점의 별도 task**로 분리. 백업: `~/kanban-migration-backups/20260620T092430Z/`.

## M2.5 — issue id 재발급 + 현행 스키마 변환 ☑ DONE (2026-06-20)

canonical frontmatter = 현행 issue-schema(`type` 계열, `issueType` 아님)로 확정(`migrate-tickets.ts`가 변환 방향 증명).

- ☑ vibe-coding 3 issue id 재발급: `issue-board-sync-002`→`VBC-board-sync-002`, `issue-home-recipe-003`→`VBC-home-recipe-003`, `issue-obsidian-kanban-board-001`→`VBC-obsidian-kanban-board-001` (슬러그 보존)
- ☑ frontmatter 현행 변환: `issueType:story`→`type:task`, `createdAt/updatedAt`→`created/updated`, `priority` Jira명→P1/P2, deprecated(`syncTarget/jiraProject/jiraKey`) 제거, `automation.trigger/allowedActions` 제거, `executor:`(빈값)→`agent`(automation.startExecution 의도 근거)
- ☑ 섹션 정규화: `Goal`→`목적`, `Notes`→`컨텍스트`, `Implementation Tasks`→`실행 힌트` + `## 로그` 추가(필수섹션 충족)
- ☑ `KANBAN.md` `[[issue-*]]`→`[[VBC-*]]` 3개 수정 (board `vibe-coding.md`엔 wikilink 없음; `.obsidian/`는 Obsidian 관리라 미변경)
- ☑ 옛 파일 삭제(백업 보유), 파일명 동기화
- ☑ 검증: `parseIssueMarkdown` + `validateIssueFrontmatterForRegistry(VBC, container)` 3/3 통과

---

## M3 — status/transition 브리지 (P0-2, P0-3) ☑ DONE (2026-06-20)

**목표**: kanban 6상태 ↔ neurons 자유형 status ↔ Jira transition을 schema 패키지 단일 SoT 상수로 정의.

- ☑ ADR-0003 Accepted (3-way 매핑 SoT 상수)
- ☑ `STATUS_BRIDGE` 단일 SoT 상수 (`status.ts`): category·neurons·jiraHint·jiraCategory
- ☑ `toJiraStatusHint`를 mapper에 연결 (`jira-mapper` payload.statusHint, 이전 미연결)
- ☑ 역방향 헬퍼: `fromNeuronsStatus`(terminal→DONE, 미지정 null=fail-closed), `fromJiraCategory`
- ☑ `resolveJiraTransition` READY/REVIEW 카테고리 폴백 (transition 실측은 M4 의존, 골격+테스트 완료)
- ☑ 단위테스트: schema 37/37, adapter-jira 3/3, core 340/340 green

**exit-gate**: ☑ 매핑 단위테스트 green, 전체 빌드 통과.

**범위 분리**: canonical → `AtlassianExportPayload`(ADF/Storage) **전체** 변환기는 M3에서 제외 → Phase 0 발행 구현 task로. ADF/Storage 직렬화는 routine-harness 책임(PDD §5.2.2)이고 M3는 status bridge SoT까지.

---

## M4 — acli read 경로 검증 (P0-3 일부)

**목표**: safe tenant에서 read-only로 acli 계약·transition·space.key를 실측 (write 없음).

- ☐ safe tenant 확보 + 사용자 명시 승인 **← 자동 진행 차단막. 필요: tenant base URL, read 계정(email+API token), 대상 Jira project key + Confluence space key**
- ☐ `probe-acli-transitions.sh` 실행 (read 모드, `workitem view --json` availableTransitions 파싱 가능 여부)
- ☐ Confluence 실 space.key 확인 (placeholder 해소) → registry external 채움
- ☐ acli 출력 파싱 계약 고정 (텍스트 → 구조화)

**exit-gate**: transition 목록·space.key 실값 확보, acli read 계약 문서화.
**✋ human-gate**: tenant 접근은 사용자 승인 하에만. **M3까지 자동 완주, 여기서 정지(2026-06-20).**

---

## M-GH — GitHub Projects 칸반 발행 (Jira 대체) ☑ DONE (2026-06-20)

**배경**: Atlassian(Jira/Confluence)이 현재 불가 → Confluence 완전 스킵, Jira는 GitHub Projects 칸반으로 대체 테스트(사용자 결정).

**실측**: gh 인증(scope `project`), Project `AI-Harness-Construct`(`PVT_kwHOA6302M4BT5fA`), Status 옵션 5개(Backlog/Ready/In Progress/In Review/Done) optionId 확보. adapter-github는 WorkStateProvider(read+pushStatus Projects v2 GraphQL)만, issue create·canonical→github 매퍼 없음.

- ☑ 발행 경로: `scripts/publish-github-projects.sh` — kanban `.md` → **draft item 카드**(공개 repo issue 오염 0, 되돌리기=카드 삭제). dryRun 기본, `--no-dry-run` 실행.
- ☑ status 매핑: TODO→Backlog, READY→Ready, RUNNING→In Progress, REVIEW→In Review, DONE→Done. **FAILED→Blocked 갭**(project에 Blocked 옵션 부재) → In Review 폴백.
- ☑ 실 발행: VBC 3건 → `AI-Harness-Construct`에 draft 카드 3개 + status 설정.
- ☑ readback: Backlog/Backlog/Ready 일치 확인.

**exit-gate**: ☑ dryRun→실발행→readback 일치.

**후속 통합 완료 (2026-06-20, c)**: adapter-github에 `createDraftInProject`(dryRun 지원)·`fetchProjectDrafts`·`canonicalToGithubDraft`·`parseKanbanIdFromBody`·`resolveStatusOptionId`(런타임 옵션 조회 + FAILED→Blocked 부재 시 In Review 폴백) 정식 통합. 단위테스트 `github-draft.test.ts` 5건. adapter-github 15 test green.

**역방향 sync 검증 완료 (b)**: GitHub 카드 status 변경(VBC-obsidian Ready→In Progress) → `fetchProjectDrafts` 동일 쿼리로 읽어 → 역매핑(In Progress→RUNNING) → `.md`(READY)와 **drift 감지** 동작 확인. 실 `.md` write는 운영 보존 위해 dryRun(READY→RUNNING은 valid transition임도 확인).

**정리 완료 (d)**: 발행 draft 카드 3개 삭제, project에 남은 kanban 카드 0.

**잔여 후속**: 역방향 실 `.md` write-back(WriteBack 경유) + conflict 정책(Phase 2). bash `publish-github-projects.sh`와 adapter TS 경로 일원화(현재 둘 다 존재, body 패턴은 `kanban-id:`로 통일됨).

## M5 — safe-tenant live 증명 (P0-4) ⏸ DEFERRED (Atlassian 현재 불가)

**목표**: PDD Phase 0 DoD — safe tenant에서 실제 발행 1건 성공.

- ☐ 비프로덕션 space 골든 테스트 (Jira create + Confluence Operational-updates archetype)
- ☐ dryRun → 승인(이중 게이트) → 실 발행
- ☐ readback 검증 (핵심 필드 일치)
- ☐ `.md`에 `sync.jira.{key,status,exportedAt}` write-back, `.md` 본문 불변 확인
- ☐ capabilities.yml에 atlassian static_contract 등록 (DEFERRED 해소)

**exit-gate**: 실 발행 성공 + readback 일치 + 403/400 0건 + SoT 불침범 증명.
**✋ human-gate**: 모든 실 write는 human 승인 직후에만.

---

## M-N — neurons enrichment (Phase 1, read-only) ◐ READY-TO-START

**목표 (D3 A노선)**: neurons knowledge(decision/drift/incident)를 board 카드에 read-only overlay로 표시. `.md` SoT 불침범, neurons = read-only mirror. 조회 실패는 fail-soft(enrichment 없는 board 정상).

**실측 완료 (Explore, 2026-06-20):**
- 호출: `neuron-knowledge mcp-stdio --ledger <path> [--enable-graph]` — JSON-RPC over stdio, 인증 없음(로컬 프로세스 신뢰). TS는 `child_process.spawn`. HTTP(`mcp-http` :8765)는 미머지 WIP.
- tool: `brain.query`(brain_id,query) · `brain_memory_search`(project,card_types[]) · `brain_incident_search`(symptom,project) · `brain_drift_explain`(subject,project) · `brain_context_resolve`(repository,branch,current_request,project — **project당 1회 batch**) · `brain_evidence_get`(source_ref_id, on-demand).
- brain_id 연결: `space.external.brain_id`(M2에서 설정, 예 `/project/openclaw`) 우선, slug=`brain_id.replace('/project/','')`. `toLowerCase` fallback은 REFUTED.
- kanban 주입점: `packages/core/src/boards/board-projection.ts:83`(batch fetch 후 issues 병합) + `obsidian-board-renderer.ts:79 renderCard()`(`ObsidianBoardIssue`에 `enrichment?` 확장). overlay DTO 분리 → CanonicalTaskModel 불변.
- EnrichmentOverlay 매핑: decisions←`brain_memory_search(card_types=[decision])`, driftCount←`brain_drift_explain.drift_events.length`, incidents←`brain_incident_search`, graphNeighbors←`graph_results[].relations`.

**선결 (착수 전 검증):**
1. neurons ledger 경로 확보 + `brain.resolve({query:""})`로 실 brain_id 목록 확인 → registry `external.brain_id` 실값 검증.
2. graphiti `--enable-graph` 가동 여부(없으면 `NullGraphMemoryAdapter` → graph 결과 빈 배열).

**작업 단계 (2026-06-20 코드 완료):**
- ☑ `packages/neurons-enrichment` 신규 — `StdioMcpClient`(JSON-RPC over stdio) + `McpClient` 추상화 + `parseToolResult`
- ☑ core 포트 `BoardEnrichment`/`BoardEnrichmentProvider`(`boards/board-enrichment.ts`) + `NeuronsBoardEnrichmentProvider` tool 매핑
- ☑ `ObsidianBoardIssue.enrichment?` 확장 + `renderCard` 🧠 뱃지 (checksum 미포함 = SoT 불침범)
- ☑ `board-projection.ts` `applyBoardEnrichment` fail-soft 주입 + CLI `board` env opt-in 배선(`KANBAN_NEURONS_LEDGER`, `KANBAN_NEURONS_GRAPH`)
- ☑ `HttpMcpClient`(Streamable HTTP, mcp 2025-06-18, session stateless, JSON/SSE 파싱) + CLI 우선순위 배선(`KANBAN_NEURONS_MCP_URL` → `KANBAN_NEURONS_LEDGER` stdio → none)
- ☑ 단위테스트: core 뱃지 4(+checksum 불침범), provider 6, HTTP 3. 전체 green(core 344, neurons-enrichment 9, cli 74)
- ☑ **실 mcp-http end-to-end 검증** — `HttpMcpClient`→provider→실 neurons(ssh 터널) 통과. `structuredContent` 파싱·graph_status `available` 확인. (probe 카운트 0 = brain 매칭 데이터 없음, 파이프라인은 동작)
- ☑ **레이턴시 최적화(c, 2026-06-21)**: TTL 캐시(`brainSlug:issueId` 중복 호출 제거) + issue 동시성 cap 병렬화(직렬 루프 제거), CLI env 튜닝(`KANBAN_NEURONS_CACHE_TTL_MS`/`KANBAN_NEURONS_CONCURRENCY`). 테스트 +4(캐시 히트/TTL 만료/비활성/동시성 cap). neurons 무수정. **batch(`brain_context_resolve`)는 보류** — issue별 매칭 불확실 + graph 300s 블로킹 우려(openQuestion 유지). 실 mcp-http 실측(ssh 터널): 1회차 9 tool 호출 1842ms → 2회차 캐시 히트 **0 호출 0ms**.
- ☐ Tailscale 우분투 online 복구 시 ssh 터널 없이 tailnet IP 직접 연결

**exit-gate**: ☑ 단위(🧠 뱃지 렌더 + checksum/`.md` SoT 불침범) + 실 mcp-http end-to-end 연결·파싱 동작.

**선결 해소(메모리 stale 정정)**: Mac에 `neuron-knowledge` 없는 건 정상 — neurons는 **우분투 서버 컨테이너** 가동(ledger=PG, `.db` 아님). mcp-http는 **이미 배포돼 healthy**(`neurons-mcp-neuron-knowledge-mcp-1`, `--host 127.0.0.1 --port 8765 --enable-graph --graph-required`, loopback). Mac은 tailnet offline → **ssh 터널**(`ssh -fN -L 8765:127.0.0.1:8765 ragflow-ubuntu`) + `KANBAN_NEURONS_MCP_URL=http://127.0.0.1:8765/mcp`로 연결.

**잔여(뱃지 실데이터)**: neurons에 kanban project brain(예 `/project/vibe-coding`) 데이터가 없어 현재 enrichment 카운트 0. 실 뱃지가 뜨려면 neurons에 kanban knowledge 적재 필요(별도 작업).

**openQuestion**: TS↔Python stdio 동기 렌더 블로킹→캐시/프리페치 · `brain_evidence_get` device_id_hash 획득(evidence content는 deferred, locator만).

## 누적 working state (agentic-execution 메모)

- 2026-06-20: M1 착수. worktree·SoT·게이트·ADR 골격 생성. 하니스는 user-level skill 사용으로 확정(설치 불요). 추적은 worktree 내부, live dogfooding은 M2 후 결정.
- 2026-06-20: M2 완료. idPrefix(OPC/STK/VBC/PSN/WEB/CAR) 확정. `RegistrySpace.external`(brain_id) 추가(비파괴). live registry legacy→현행 마이그레이션(외부 백업 후 atomic 교체), workspace→openclaw rename, `_epics`/epicBoard 생성, workspaces.json career 추가. 검증: core 340 test green, verify-naming 0 error. prefix-subset 검사는 로더 비강제(기존 idPrefix 중복 허용)→verify 게이트로 이관. id 재발급은 M2.5로 분리. 다음=M3.
- 2026-06-20: M3 완료. `STATUS_BRIDGE` 3-way SoT 상수(`status.ts`) + 역방향(`fromNeuronsStatus`/`fromJiraCategory`) + 폴백(`resolveJiraTransition`). `toJiraStatusHint`를 `jira-mapper` payload.statusHint에 연결(이전 미연결). 검증: schema 37, adapter-jira 3, core 340 전부 green. AtlassianExportPayload 전체 변환기는 Phase 0로 분리. **M4는 safe tenant 자격증명 필요 → 자동 진행 정지.** 다음=사용자 tenant 입력 또는 M2.5(id 재발급).
- 2026-06-20: 노선 변경(사용자) — Atlassian 현재 불가 → Confluence 완전 스킵, Jira→GitHub Projects 칸반 대체. M4/M5(Atlassian) DEFERRED.
- 2026-06-20: M2.5 완료(b). vibe-coding 3 issue `issue-*`→`VBC-*` 재발급 + 현행 스키마 변환 + KANBAN.md wikilink, 검증 3/3.
- 2026-06-20: M-GH 완료(a). `scripts/publish-github-projects.sh`로 kanban .md 3건 → GitHub Project `AI-Harness-Construct`에 draft 카드 발행(dryRun→실발행→readback 일치). status 매핑 검증. FAILED→Blocked는 옵션 부재로 In Review 폴백. adapter-github 정식 통합은 후속.
