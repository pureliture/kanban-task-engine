# Kanban Legacy Design Notes

Date: 2026-04-23
Status: Archived context
Superseded by: `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`

This note preserves durable context from two obsolete root-level design drafts:

- `2026-04-16-kanban-ticket-system-design.md`
- `2026-04-18-kanban-task-engine-v2-design.md`

The original drafts are not implementation sources. They assumed older layouts, stronger automatic execution triggers, and app-specific board strategies that have been superseded.

## Durable Decisions

- Markdown issue documents are the source of truth.
- The canonical model should stay Jira-compatible.
- Issue documents must be independent of individual code project repositories.
- OpenClaw and Claude Code execution should be adapter-backed, not hardcoded into the Markdown store.
- Work environments may not be able to run OpenClaw, so the engine must support a mode where humans move issues and export to Jira manually or through approved Atlassian tooling.
- Home environments may allow OpenClaw to move issues and start execution when policy allows it.
- Obsidian is useful as a Home UI, but the core engine must not depend on a custom Obsidian plugin.

## Superseded Assumptions

These assumptions appeared in the older drafts and should not be reintroduced without a new design decision:

- Live issue state lives under `~/Projects/kanban-task-engine/issues`.
- Moving a card to an active status automatically starts execution.
- `workspace*/issues` paths directly determine the execution agent.
- Logseq board output is the primary board target.
- Firebase or broad external write-back is part of the normal sync model.
- Jira can act as the document source of truth.

## Trigger Lessons

The early designs compared several trigger strategies:

- File watchers such as `fswatch`, `inotify`, or `chokidar`
- Cron or polling
- Note-app events from Obsidian or Logseq
- OpenClaw-native orchestration

The durable lesson is that trigger detection and execution must stay separate. File changes or board movement can express intent, but execution should be gated by recipe and policy. The default Home mode should require an explicit Run command unless a recipe opts into stronger automation.

## Execution Lessons

Earlier drafts mapped workspaces to OpenClaw or ACP/Claude Code executors. The durable form of that idea is adapter selection:

- `openclaw-executor` for OpenClaw-managed work
- `claude-code-executor` for Claude Code sessions
- `jira-exporter` for Work/Atlassian export

Executor selection should come from issue metadata plus recipe/policy, not from hardcoded path names.

## Security Lessons

The 2026-04-18 draft called out token handling for OpenClaw gateway access. The useful rule is still valid:

- Prefer existing OpenClaw device-auth/config patterns over ad hoc environment variables for long-lived credentials.
- Do not expose gateway tokens through process lists, logs, issue Markdown, or generated canonical JSON.
- External actions must pass policy gates before execution.

## Error-Handling Lessons

The older v2 draft had useful operational concerns:

- YAML/frontmatter parse failures should produce structured parse errors.
- Failed documents should go to a dead-letter path or queue instead of blocking the whole engine.
- Concurrent writes need atomic write patterns and lock handling.
- Gateway or executor failures need retry/backoff where safe.
- Rate limits need queueing/backpressure.

These are implementation concerns for the module runtime and executor slices.

## Board Lessons

The old drafts moved between Obsidian Dataview, Logseq queries, and generated board files. The durable lesson is:

- Issue Markdown remains the source of truth.
- Board files are views unless a later design explicitly makes them editable control surfaces.
- `spaces/` from the current `~/.openclaw/kanban` layout should be treated as legacy read-only migration input.
- New generated board views should live under `boards/`.

## Migration Lessons

The old drafts correctly identified that existing issue-like files may be scattered across OpenClaw workspace directories. Any migration plan should:

- inventory existing `workspace*/issues` or kanban-related files first;
- avoid destructive moves without a rollback path;
- preserve compatibility for old `~/.openclaw/kanban` references during migration;
- update frontmatter through a parser/serializer rather than ad hoc string edits;
- keep old designs marked as historical context only.

## Current Authoritative Direction

The authoritative layout is:

```text
~/.openclaw/workspace-kanban/
  Home kanban operator workspace.

~/.openclaw/workspace-kanban/kanban/
  Home Markdown issue vault and control plane.
  Standalone git repository, not a submodule.

~/Projects/kanban-task-engine/
  Shared engine, schema, canonical model, modules, adapters, tests, and default recipes.
```

Implementation should proceed from the current control-plane design spec, not from the obsolete source drafts.
