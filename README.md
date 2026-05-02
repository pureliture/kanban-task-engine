# kanban-task-engine

Markdown issue vault를 source of truth로 두고 Home/Work 환경의 task lifecycle, board rendering, adapter policy, agent execution을 같은 schema로 다루는 TypeScript workspace입니다.

최신 runtime contract는 `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`입니다. 2026-04-23 control-plane spec은 vault layout과 배경 설계 문서로 유지하되, no-change execution, `next --execute`, Work metadata, hardening CI 판단은 2026-05-02 spec을 따릅니다.

## Quick Start

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm eval:superpowers
pnpm eval:hardening
```

운영 vault를 대상으로 CLI를 실행할 때는 `KANBAN_HOME`을 Markdown vault root로 지정합니다.

```bash
KANBAN_HOME=$HOME/.openclaw/workspace-kanban/kanban pnpm --filter @kanban-task-engine/cli start -- sync
```

`config/workspaces.json`은 migration-only legacy config입니다. 한 release 동안 구 layout을 확인하는 단서로만 보존하고, 신규 runtime은 vault의 `registry.yaml`, active recipe, `KANBAN_HOME`을 기준으로 동작해야 합니다.

## Home And Work Modes

Home mode는 OpenClaw operator workspace와 local Markdown vault를 사용합니다. 정책이 허용하는 경우 board generation, audit log, git checkpoint, agent execution을 실행할 수 있습니다.

Work mode는 같은 schema와 parser를 사용하지만 automation surface를 좁힙니다. Work에서 허용되는 외부 통합은 Atlassian/Jira export이며, Markdown write-back은 `sync.jira.key`, `sync.jira.status`, `sync.jira.exportedAt` 같은 namespaced metadata로 제한합니다. Firebase, OpenClaw execution, mobile real-time sync는 Work mode에서 허용하지 않습니다.

## CLI

주요 operator commands:

- `kanban sync`: vault issue를 읽고 validation warning과 count를 출력합니다.
- `kanban board`: registry 기반 board를 생성합니다.
- `kanban next`: 가장 우선순위가 높은 `READY` issue를 조회만 합니다.
- `kanban next --execute`: 선택된 `READY` issue를 `run <id> --execute`와 같은 lifecycle로 실행합니다.
- `kanban run <id>`: inspect-only입니다. worktree 생성, agent 실행, status mutation을 하지 않습니다.
- `kanban run <id> --execute --agent codex|claude-code|mock`: 명시적으로 실행합니다.
- `kanban approve|abort|retry|recover-run`: `REVIEW`, `FAILED`, stale `RUNNING` cleanup lifecycle을 처리합니다.

`RUNNING`에 도달한 run은 `REVIEW` 또는 `FAILED`로 수렴해야 합니다. agent가 exit 0을 반환했지만 file change가 없는 no-change success는 approve 가능한 checkpoint가 없으므로 `FAILED`로 기록합니다.

## Recipes

Runtime recipe는 module ordering과 `RuntimePolicy`를 함께 정의합니다.

- `recipes/home-assisted.yaml`: Home 기본 assisted recipe입니다.
- `recipes/validate-only.yaml`: mutation 없이 schema/policy validation을 확인합니다.
- `recipes/work-jira-export.yaml`: Work export용 recipe입니다. Jira write-back은 `sync.jira.*`만 허용합니다.
- `recipes/examples/home-full-auto.yaml`: 필요한 module factory가 모두 준비되기 전까지 예시로만 둡니다.

Active recipe resolution은 `KANBAN_RECIPE`, `<vaultRoot>/config/active-recipe.yaml`, bundled Home assisted recipe 순서로 이루어져야 합니다.

## Safety Model

Safety gate는 schema validation, registry-aware vault traversal, safe path containment, runtime policy, adapter guard, execution preflight, git checkpoint 순서로 겹쳐져야 합니다.

- Markdown issue id는 filesystem path segment로 쓰이므로 traversal, slash, NUL, leading dash를 거부합니다.
- CLI는 core vault/runtime service를 재사용해야 하며 lifecycle YAML write를 command별로 재구현하지 않습니다.
- Adapter는 `RuntimePolicy` 없이 permissive하게 동작하면 안 됩니다.
- CI는 `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`, `pnpm eval:hardening`, `git diff --check`를 실행합니다.
- 배포 전 확인은 `docs/deploy-checklist.md`를 따릅니다.
