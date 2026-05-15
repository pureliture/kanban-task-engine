# Kanban Task Engine Obsidian Plugin

Repo-local desktop Obsidian companion plugin for `kanban-task-engine`.

## Scope

- Desktop Obsidian only.
- Markdown issue notes remain the source of truth.
- Generated board and Dataview index files remain projections.
- Commands call core use-cases directly; the plugin does not shell out to the CLI.
- Official smoke evidence must use copy-installed artifacts, not a dev symlink.

## Build

```bash
pnpm --filter @kanban-task-engine/obsidian-plugin build
```

This emits `packages/obsidian-plugin/main.js`.

## Disposable Smoke Install

```bash
SMOKE_VAULT=$(mktemp -d)
pnpm obsidian-plugin:smoke-install -- --vault "$SMOKE_VAULT"
```

The installer copies `manifest.json` and `main.js` into:

```text
$SMOKE_VAULT/.obsidian/plugins/kanban-task-engine/
```

For local iteration only:

```bash
pnpm obsidian-plugin:dev-link -- --vault "$SMOKE_VAULT"
```

## Commands

- `Kanban Task Engine: New Task`
- `Kanban Task Engine: Normalize Current Note`
- `Kanban Task Engine: Sync Current Board`
- `Kanban Task Engine: Preview Board Moves`
- `Kanban Task Engine: Apply Board Moves`
- `Kanban Task Engine: Move Current Issue`
- `Kanban Task Engine: Promote Raw Card`

The ribbon icon opens a read-only status/menu modal. It does not create, sync, apply, or move task state directly.
