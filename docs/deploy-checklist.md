# Deploy Checklist

이 checklist는 `kanban-task-engine` docs/CI/runtime 변경을 배포하거나 release candidate로 올리기 전에 사용합니다.

## Pre-Deploy

- [ ] `pnpm install --frozen-lockfile` succeeds with Node 22 and pnpm 10.32.1.
- [ ] `pnpm -r build` passes.
- [ ] `pnpm -r test` passes.
- [ ] `pnpm eval:superpowers` passes.
- [ ] `pnpm eval:hardening` passes.
- [ ] `git diff --check` passes.
- [ ] `README.md`, `docs/kanban-runtime.md`, and `docs/archive/README.md` all point to the 2026-05-02 hardening spec.
- [ ] `config/workspaces.json` remains documented as migration-only legacy config.
- [ ] No live Jira, Firebase, OpenClaw, Claude, or Codex credentials are required in CI.

## Deploy

- [ ] Deploy or merge only after CI is green on `pull_request`.
- [ ] For runtime automation releases, run `pnpm eval:hardening -- --strict-architecture` and review every remaining architecture allowlist entry.
- [ ] Smoke test `kanban sync`, `kanban board`, `kanban next`, and inspect-only `kanban run <id>` against a disposable vault.
- [ ] If execution is enabled, smoke test `kanban run <id> --execute --agent mock` against a disposable git repo and confirm `RUNNING` converges to `REVIEW` or `FAILED`.
- [ ] Confirm no-change success converges to `FAILED` and leaves diagnostic artifacts.

## Post-Deploy

- [ ] Check CI logs for warnings hidden behind successful exits.
- [ ] Confirm generated docs/eval output still names `pnpm eval:hardening`.
- [ ] Record any allowlist entries that remain after deploy as follow-up tickets.
- [ ] Remove `config/workspaces.json` or convert it to an explicit migration command in the next release window.

## Rollback Triggers

- `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`, or `pnpm eval:hardening` fails on `main`.
- CI uses a Node or pnpm version other than Node 22 and pnpm 10.32.1.
- Work mode can start Codex, Claude, Firebase, OpenClaw, or mobile sync side effects.
- no-change success reaches `REVIEW`.
- A run reaches `RUNNING` and does not converge to `REVIEW` or `FAILED`.
- Secret-like values appear in logs, JSON metadata, or JSONL events.

## Tech Debt Triage

P1 override applies to security, data loss, path traversal, policy bypass, and secret leakage even if the numeric score looks lower.

| Debt | Category | Priority | Handling |
| --- | --- | --- | --- |
| Architecture guard allowlist entries remain | Infrastructure debt | P2 until production automation, P1 before production automation | Retire by delegating CLI lifecycle writes to core services, using safe vault path helpers, and requiring adapter policy constructors. |
| `config/workspaces.json` remains in repo | Documentation/config debt | P2 | Keep migration-only for one release, then remove or replace with an explicit migration command. |
| CI lacks live integration credentials | Test debt | P2 | Keep CI deterministic; run live Jira/Codex/OpenClaw dogfood as an operator release gate outside public CI. |
| Old specs remain readable | Documentation debt | P3 | Keep archive index current and add superseded notes rather than deleting evidence. |
