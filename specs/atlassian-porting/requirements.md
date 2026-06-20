# Requirements — 온톨로지 기반 통합 칸반보드 → Atlassian 포팅

> **이 문서가 SoT (grill-to-spec).** 변경은 여기서 시작한다. 구현/실행은 [`milestones.md`](./milestones.md)가 게이트한다.
> 입력 제품 설계: [`../../docs/atlassian-porting-pdd.md`](../../docs/atlassian-porting-pdd.md) (PDD, 8장). 부록에 P0 실측 반영.
> 상태: **M1 환경 셋업 (DRAFT)** · 최종 갱신 2026-06-20

---

## 1. 단일 Goal

개인의 `.md` Vault(KANBAN_HOME)를 **SoT**로 두고 작업을 운영한 뒤, 검증된 산출물만 **Atlassian(Jira/Confluence)으로 투영(projection)**하며, neurons가 축적한 knowledge(decision/drift/incident)를 board 카드에 **read-only로 enrichment**하는 통합 칸반 시스템을 만든다.

핵심 불변식: **`.md` SoT 불침범.** Atlassian·neurons는 종속 투영/거울이며 `.md`를 자동으로 덮어쓰지 않는다.

## 2. 확정 결정 (Decisions)

| ID | 결정 | 근거 |
|----|------|------|
| **D1** | 사용 맥락 = 개인 SoT → 팀 투영. `.md` Vault가 SoT, Atlassian은 공유용 투영 대상. | 발행은 migration이 아닌 projection. |
| **D2** | Atlassian 연동 = Export 먼저 → 양방향 확장. 1단계 단방향 발행으로 가치 검증, 2단계 WorkStateProvider 역류. | 점진·안전, SoT 오염 회피. |
| **D3** | 온톨로지 = read-only enrichment 우선. neurons = read-only mirror, `.md` 불침범. B(1급 통합)/C(그래프 자동화)는 로드맵 진화 경로. | 이중 SoT 위험 회피. |

## 3. 범위

### In-scope (전체 프로그램)
- kanban canonical → Atlassian export payload 변환·정책·식별자·write-back (kanban adapter contract)
- 실제 Atlassian write (Basic Auth·ADF/Storage·승인) = routine-harness 컴포넌트 위임 (하이브리드 비대칭)
- neurons MCP read-only enrichment (board 카드 메타·그래프)
- 3-way naming 매핑, 3-way status/transition 매핑, redaction 게이트

### Out-of-scope (현 프로그램)
- neurons를 task lifecycle SoT로 만드는 것 (D3 위배)
- live Atlassian 자동 발행 (human-gate 없이) — 항상 승인 경유
- B/C 진화는 전환 트리거 충족 전까지 비활성

## 4. 선결 조건 — P0 차단막 (실측 반영)

이 4개가 닫히기 전에는 어떤 Phase 구현도 시작하지 않는다. 상태는 [`milestones.md`](./milestones.md) M2~M5에서 추적.

| # | 차단막 | 실측 상태 | 해소 위치 |
|---|--------|-----------|-----------|
| **P0-1** | project naming 3-way 매핑 부재 | **REFUTED** toLowerCase 자동매핑 불가 (`OC≠openclaw`, `VC≠vibe-coding`). 명시 매핑 테이블 필수. + live registry가 **legacy schema**라 현행 로더 즉시 실패. | M2 (ADR-0001, ADR-0002) |
| **P0-2** | 3-way status/transition 매핑 부재 | kanban 6상태 CONFIRMED. neurons status는 **자유형 문자열**(enum 아님). Jira transition 동적조회 미확인. | M3 (ADR-0003) |
| **P0-3** | adapter-jira 인증/페이로드 충돌 | acli 계약 CONFIRMED (positional·`--description` inline·텍스트 출력·계정분리). kanban Bearer/평문 → RH Basic+ADF 위임 필요. | M3~M4 |
| **P0-4** | RH live write 증명 DEFERRED | CONFIRMED (`runtime_support_claimed:false`). safe tenant + 명시 승인 전까지 불가. | M5 (human-gate) |

## 5. 실측 확정 사실 (Probe Findings)

- **registry**: live `~/.openclaw/workspace-kanban/kanban/registry.yaml`은 legacy(`workspace_path`+`board`). idPrefix는 test fixture(OC/VC)에만. `config/workspaces.json`(5)과 live vault(6, career 포함) **config drift** 존재.
- **idPrefix 정규식**: `^[A-Z][A-Z0-9]*$` (`registry.ts:84`). prefix-subset 충돌(OC vs OCA) 방지 로직 없음.
- **neurons brain_id**: `/project/<project>`, 변환 로직 전무(`native_memory_mirror.py:16-19` 단순 concat). 실 샘플 `/project/neurons`, `/project/dendrite`, `/project/kanban-task-engine`.
- **neurons status**: 자유형 문자열, `TERMINAL_TASK_STATUSES = {done,resolved,closed,cancelled}`만 고정.
- **acli 계약**: positional args, payload `--description "$(tr -d '\n' < body.adf.json)"` inline(`--description-file` 금지), 출력 사람용 텍스트(JSON 비전제, readback 별도 read), read/write 계정 분리(`~/.config/acli/.acli-gateway.env` mode 600), Confluence write는 acli verb 없어 REST publish recipe(system curl + Basic + v1).
- **Confluence archetype**: 1순위 `Operational updates`(6-section), 2순위 `Quality reports`, bind-back `Implementation notes`. 실 space.key는 전부 placeholder(`<SPACE_KEY>`).
- **frontmatter 불일치**: 템플릿(`type/...`) vs live 실파일(`issueType/automation/...`). canonical 확정 필요.

## 6. 기능 요구 (Phase 매핑)

PDD §6 로드맵을 그대로 따른다. 각 Phase의 DoD는 PDD §6.3, GAP 매핑은 §6.5 참조.

- **Phase 0 (MVP)**: 선행 차단막(P0-1/2/3) + Jira/Confluence 단방향 발행(dryRun 기본 ON, 승인 게이트).
- **Phase 1**: neurons MCP read-only enrichment + redaction 배선.
- **Phase 2**: WorkStateProvider 역류 + 이중 SoT conflict 정책(`local-wins` lifecycle 보호).
- **Phase 3**: A→B→C 진화 (전환 트리거 충족 시).

## 7. 비기능 / 거버넌스 (PDD §7)

- **SoT 권위 비중첩**: lifecycle 축 = `.md`(`local-wins` 고정), knowledge 축 = neurons Ledger(read-only). 같은 필드를 다투지 않아 conflict 구조적 불가.
- **이중 직렬 승인 게이트**: ① kanban `RuntimePolicy.assertAdapterAllowed`(fail-closed, dryRun 기본) ② routine-harness human 승인(실 write 직전). 둘 다 통과해야 발행.
- **redaction**: 발행 직전 dendrite `redact_public_ingress_text`(redaction.v2) 경유 (neurons·Atlassian 두 출구).
- **멱등성**: `idempotencyKey = <slug>:<task_id>:<contentHash>`, `sync.jira.key` 존재 시 upsert.
- **readback 검증**: 발행 직후 read 계정 재조회로 핵심 필드 일치 확인.

## 8. Open Questions (PDD §8, 19개 — backlog)

P0(착수 전): naming 3-way 실측 / Jira transition id 가변성 / RH live 증명 / acli 호출 계약.
P1~P4 결정은 PDD §8 참조. 각 OQ는 해소되는 Milestone에 연결(milestones.md).

## 9. Acceptance / DoD (프로그램 수준)

1. P0 차단막 4개 모두 closed (검증 task 통과).
2. safe tenant에서 칸반 1프로젝트가 `dryRun → 승인 → 실제 발행`되어 Jira issue/Confluence page 생성, `.md`에 `sync.jira` 기록, **403/400 0건**.
3. `.md` SoT가 발행 과정에서 **1바이트도 자동 변경되지 않음** (불침범 증명).
4. neurons enrichment가 board에 read-only로 표시되고 `.md` 미변경.
