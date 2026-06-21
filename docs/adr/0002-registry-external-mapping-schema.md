# ADR-0002 — registry `external` 매핑 schema + legacy 마이그레이션

- 상태: **Accepted** (M2 완료, 2026-06-20)
- 날짜: 2026-06-20
- 맥락: [requirements.md](../../specs/atlassian-porting/requirements.md) P0-1, ADR-0001

## 맥락

ADR-0001이 명시 3-way 매핑 테이블을 요구한다. 그러나 두 가지 실측 제약이 있다:

1. **live vault `registry.yaml`은 legacy schema** (`workspace_path` + `board`만). 현행 `RegistrySpace` 로더(`vault-record-loader.ts:57` `vault.read('registry.yaml')`)가 **즉시 실패**한다.
2. 현행 `RegistrySpace`에 external 매핑 필드가 없다 (`registry.ts:10-18`). live vault(6 space, career 포함)와 `config/workspaces.json`(5)에 **config drift**도 존재.

## 결정

1. **legacy → RegistrySpace 마이그레이션**을 M2 선결 작업으로 수행. live vault 6 space를 현행 schema(`idPrefix`, `issues`, `epics`, `board`, `epicBoard`)로 변환.
2. `RegistrySpace`에 선택적 **`external` 섹션** 추가:
   ```yaml
   external:
     brain_id: /project/<slug>          # neurons (ADR-0001)
     confluence_space_key: <SPACE_KEY>  # Confluence (M4에서 실값 확인)
     jira_project_key: <KEY>            # Jira
   ```
3. **prefix-subset/중복 충돌 검사는 registry 로더에 강제하지 않는다.** 실측 결과 기존 시스템은 여러 space가 같은 idPrefix를 갖는 것을 의도적으로 허용한다(id→space 역추출 없이 space 선택 라우팅; `reconcile-board.test.ts`가 명시). 따라서 충돌 검사는 atlassian 발행 게이트인 `scripts/verify-naming-three-way.ts`에서만 수행한다(로더 비파괴).
4. `config/workspaces.json` ↔ registry drift 해소 (career 포함 일치).

## 실측 반영 (M2 실행, 2026-06-20)

- live `issues/` 디렉터리는 이미 현행 관례(`issues/openclaw` 등 존재). registry 키만 legacy `workspace` → `openclaw`로 rename(디렉터리와 정합).
- `external`은 `brain_id`만 채움. `confluence_space_key`/`jira_project_key`는 실값 부재라 생략(M4 probe까지 verify에서 warn).
- 마이그레이션 결과: 6 space 현행 schema 로드 OK, core build/test 340 green, verify-naming 0 error.

## 근거

마이그레이션 없이는 어떤 통합도 시작 불가(로더 실패). external 섹션은 ADR-0001 매핑을 데이터로 표현하며 `verify-naming-three-way.ts`가 검증한다. external은 선택적이라 기존 로직 비파괴.

## 귀결

- live vault 쓰기가 필요 → 사용자 승인 게이트 (Q3 미결, M2에서 확정).
- idPrefix 값은 사용자 지정 (자동배정 금지).
- 마이그레이션은 되돌릴 수 있게 (원본 백업 후).
