# Archive Index

Archived and older planning docs are kept for evidence, but the current implementation contract is `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md`.

## Current Docs

| Purpose | Current document |
| --- | --- |
| Runtime contract | `docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md` |
| Operator guide | `docs/kanban-runtime.md` |
| Deploy readiness | `docs/deploy-checklist.md` |
| Control-plane layout background | `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` |
| AgentRunner backend background | `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md` |

## Superseded Notes

| Older document | Current interpretation |
| --- | --- |
| `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md` | Keep for vault layout and Home/Work control-plane background. The 2026-05-02 hardening spec supersedes no-change execution, `kanban next`, Work metadata, and deploy/CI readiness. |
| `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md` | Keep for AgentRunner and Codex backend lifecycle. The 2026-05-02 hardening spec owns runtime policy, adapter guard, CLI preflight, and documentation gates. |
| `docs/archive/2026-04-23-kanban-legacy-design-notes.md` | Historical design notes only. Use current specs above before implementing. |
| `docs/archive/2026-04-24-agent-runner-codex-eval-loop.md` | Historical eval-loop evidence only. Use `scripts/eval-superpowers.ts` and `scripts/check-hardening.ts` for current gates. |

## Contract Changes To Remember

- no-change success is `FAILED`, not `REVIEW`.
- bare `kanban next` is discovery-only; `kanban next --execute` is the execution trigger.
- Work metadata write-back uses `sync.jira.*`; flat `jiraKey`, `jiraStatus`, and `exportedAt` are deprecated.
- `config/workspaces.json` is migration-only legacy config for one release and must not be treated as the new runtime source of truth.
