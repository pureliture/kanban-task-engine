# Kanban Runtime

The authoritative design is `docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md`.

## Repositories

- Engine repo: `~/Projects/kanban-task-engine`
- Home operator workspace: `~/.openclaw/workspace-kanban`
- Home issue vault: `~/.openclaw/workspace-kanban/kanban`

## Source of Truth

Markdown issue files under `kanban/issues/` are the source of truth. Canonical JSON is generated internal state and should not be edited by hand.

## Work Mode

Work mode uses the same schema and parser, but external integration is limited to Atlassian/Jira export. Jira can write selected metadata such as `jiraKey`, `jiraStatus`, and `exportedAt` back to Markdown when policy allows it.