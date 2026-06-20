# ADR-0001 — 3-way naming 매핑: 명시 매핑 테이블 채택

- 상태: **Accepted** (M2 완료, 2026-06-20)
- 날짜: 2026-06-20
- 맥락: [requirements.md](../../specs/atlassian-porting/requirements.md) P0-1

## 맥락

kanban `project`(idPrefix), neurons `brain_id`, Confluence `space.key`를 잇는 canonical join key가 필요하다. PDD는 `/project/<slug>`를 후보로 제시했으나, 자동 변환 가능성은 미검증이었다.

## 실측 (Probe Findings, confirmed)

- kanban idPrefix 정규식 = `^[A-Z][A-Z0-9]*$` (대문자+숫자, 하이픈/소문자 불가). `packages/core/src/store/registry.ts:84`
- neurons brain_id = `/project/<project>`, **변환 로직 전무** (단순 concat). `worker/lib/agent_knowledge/session_memory/native_memory_mirror.py:16-19`
- 실 brain_id 샘플: `/project/neurons`, `/project/dendrite`, `/project/kanban-task-engine`, `/project/vibe-coding` 계열은 소문자+하이픈.
- `OC.toLowerCase() = "oc" ≠ "openclaw"`, `VC → "vc" ≠ "vibe-coding"`.

## 결정

**toLowerCase 등 알고리즘 자동 매핑을 채택하지 않는다.** 대신 registry에 **명시적 3-way 매핑 테이블**을 둔다 (ADR-0002의 `external` 섹션). 각 space는 `idPrefix`, `brain_id`, `confluence_space_key`를 명시적으로 선언한다.

- canonical join key = registry space 레코드 그 자체 (idPrefix가 1급 키, external이 투영 주소).
- prefix-subset 충돌(OC vs OCA)은 `validateRegistry`에서 명시적으로 거부.

## 근거

자동 변환은 `OC≠openclaw` 반례로 즉시 깨진다. 명시 테이블은 추측을 제거하고 검증 가능(`verify-naming-three-way.ts`)하다.

## 귀결

- registry schema 확장 필요 → ADR-0002.
- `verify-naming-three-way.ts`가 매핑 정합성을 게이트.
- 신규 space 추가 시 3-way 값을 모두 선언해야 함(누락 시 발행 fail-closed).
