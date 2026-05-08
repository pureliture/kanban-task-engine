# AGENTS.md - Kanban Task Engine

이 repo는 Markdown issue vault를 source of truth로 두고 Home/Work task lifecycle을 하나의 schema와 adapter contract로 다루는 TypeScript workspace입니다.

## 공통 작업 원칙

이 repo의 세부 규칙은 root `~/.openclaw/AGENTS.md`의 공통 원칙을 따른다.

- 구현 전에 모호한 가정, 가능한 해석, 위험한 변경 범위를 먼저 드러낸다.
- 요청받은 문제를 해결하는 최소 변경을 우선하고, 단일 사용처를 위한 추상화나 미래 기능을 만들지 않는다.
- 기존 package/schema/adapter 구조와 recipe policy를 따른다. 관련 없는 리팩터링, 포맷 변경, dead code 삭제는 하지 않는다.
- 모든 변경 라인은 사용자 요청, task data safety, 또는 검증 필요성과 직접 연결되어야 한다.
- 비사소한 변경은 성공 기준과 검증 명령을 먼저 정하고, 완료 전에 실제 결과를 확인한다.

## Repo Boundary

- Engine repo에는 live issue state를 두지 않는다. 실제 상태는 별도 Vault 저장소에 둔다.
- Canonical JSON, board files, run artifacts는 생성 산출물이며 두 번째 source of truth가 되어서는 안 된다.
- `kanban/` 또는 외부 Vault 저장소를 수정해야 하는 작업은 해당 저장소 정책을 먼저 확인한다.
- `.DS_Store`, `.pnpm-store/`, `node_modules/`, generated board artifacts를 stage하지 않는다.

## Validation

변경 범위에 맞춰 가장 좁은 검증부터 실행한다.

```bash
pnpm -r build
pnpm -r test
pnpm test:docs
pnpm docs:verify
```
