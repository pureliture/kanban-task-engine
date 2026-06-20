# CLAUDE.md — atlassian-porting-home worktree overlay

이 worktree는 **"온톨로지 기반 통합 칸반보드 → Atlassian 포팅"** 장기 단일-goal 작업의 home이다.
저장소 루트의 `AGENTS.md`·`README.md` 계약이 우선하며, 이 파일은 본 작업에 한정한 overlay다.

## 경계 (불변식)

- **`.md` SoT 불침범**: 이 engine repo에는 live issue state가 없다. live 상태는 `~/.openclaw/workspace-kanban`(KANBAN_HOME) Vault에 있다. **운영 vault에 쓰지 않는다** (M2 마이그레이션은 사용자 승인 + 백업 후에만).
- **하이브리드 비대칭**: canonical 변환·정책·식별자는 kanban adapter contract, 실제 Atlassian write는 routine-harness 위임. 이 worktree에서 실 테넌트에 직접 write 금지.
- **이중 직렬 승인 게이트**: ① `RuntimePolicy.assertAdapterAllowed`(fail-closed, dryRun 기본) ② human 승인. live write는 둘 다 통과 시에만.

## SoT / 실행

- 요구 SoT: [`specs/atlassian-porting/requirements.md`](specs/atlassian-porting/requirements.md) — 변경은 여기서 시작.
- 실행 게이트: [`specs/atlassian-porting/milestones.md`](specs/atlassian-porting/milestones.md) — exit-gate 통과 전 다음 M 금지.
- 제품 설계: [`docs/atlassian-porting-pdd.md`](docs/atlassian-porting-pdd.md) (PDD + P0 실측 부록).
- 결정: [`docs/adr/0001`](docs/adr/0001-three-way-naming-mapping.md) · [`0002`](docs/adr/0002-registry-external-mapping-schema.md) · [`0003`](docs/adr/0003-status-transition-bridge.md).

## 실행 하니스 (user-level skill 직접 사용)

routine-harness를 **설치하지 않는다**. 이미 user-level에 있는 skill을 직접 사용:
- `grill-to-spec` — requirements.md를 SoT로 다듬을 때.
- `agentic-execution` — milestones.md 기반 act/observe/adjust 실행.
- `worktree-lifecycle` — worktree start/pause/handoff/cleanup.

## 검증 명령

```bash
pnpm -r build && pnpm -r test          # engine 전체
node --import tsx scripts/verify-naming-three-way.ts   # P0-1 (M2 후 동작)
PROBE_CONFIRM=yes JIRA_KEY=<k> bash scripts/probe-acli-transitions.sh  # M4, 승인 필수
```

## 크로스-repo

- neurons / dendrite / routine-harness 변경이 실제로 필요해지면 **그 시점에** 각 repo에서 `git worktree`로 격리 브랜치 생성 (선점 금지). 현재는 read-only 참조만.
