# Kanban Board and Documentation Spec

Date: 2026-04-24
Status: Draft for review
Parent: `docs/superpowers/specs/2026-04-24-kanban-mvp-hardening-spec.md`

## 1. Purpose

This spec covers registry-aware board generation, Epic index generation, example vaults, and user-facing documentation.

It should be implemented after the contract and inspection/board CLI specs.

## 2. Board Generation

Board generation reads:

```text
registry.yaml
issues/**/*.md
```

Board generation writes:

```text
boards/<space>.md
boards/<space>-epics.md
```

## 3. Main Board Contract

The main board includes only non-Epic issues.

Columns:

```text
TODO
READY
RUNNING
REVIEW
DONE
FAILED
```

Each card line includes:

```text
- [<title>](<relative issue path>) `<priority>` `<project>`
```

For single spaces, project may be omitted or rendered as `space:<space>`.

Epics are excluded from main boards.

## 4. Epic Index Contract

The Epic index is a generated table, not a Kanban board.

Columns:

```text
Epic
Status
Priority
TODO
READY
RUNNING
REVIEW
DONE
FAILED
Total
```

Child issue relationship:

```text
child.frontmatter.epic === epic.frontmatter.id
```

Broken references:

- A non-Epic issue with an `epic` value that does not exist is reported as a warning.
- A duplicate Epic id is an error.

## 5. Registry Contract

Registry entries must provide enough information to generate boards.

Minimum shape:

```yaml
spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
```

## 6. Stale Board Check

`kanban render-board --check`:

- Generates board text in memory.
- Compares with existing board files.
- Exits nonzero when files differ.
- Reports stale file paths.
- Does not write.

## 7. Example Vault

Create:

```text
examples/minimal-vault/
  registry.yaml
  issues/openclaw/OC-001-sample-task.md
  issues/openclaw/_epics/OC-010-sample-epic.md
  issues/vibe-coding/kanban-task-engine/VC-001-sample-task.md
  issues/vibe-coding/_epics/VC-010-sample-epic.md
  boards/openclaw.md
  boards/openclaw-epics.md
  boards/vibe-coding.md
  boards/vibe-coding-epics.md
```

The example vault must be small enough for CLI tests.

## 8. Documentation

Required files:

```text
README.md
docs/getting-started.md
docs/architecture.md
docs/schema.md
docs/vault-layout.md
docs/cli.md
docs/execution-harness.md
docs/adapters/claude-code.md
docs/adapters/openclaw.md
docs/adapters/jira.md
docs/adapters/github.md
docs/adapters/firebase.md
```

Adapter docs must clearly label implementation status:

```text
available
experimental
planned
```

## 9. README Contract

README sections:

```text
What this is
What this is not
Quick start
Core concepts
Current implementation status
Roadmap
```

Required statements:

- This is not a Trello clone.
- This is not a general web kanban UI.
- This is not Jira bidirectional sync.
- This is a Markdown issue control plane for humans and AI executors.

Quick start rules:

- Only list commands that exist.
- If execution is not implemented yet, do not show `kanban run`.
- Use `examples/minimal-vault`.

## 10. Plan/Spec Cleanup

Existing plan documents that are historical or superseded should be labeled rather than silently deleted.

Required cleanup:

- Mark stale implementation plans as historical if their steps no longer match current schema.
- Keep the current authoritative design file.
- Make this spec pack the current decomposition for GPT-5.5 review follow-up.

## 11. Out of Scope

- Web UI.
- Drag/drop board interactions.
- Realtime collaboration.
- Mobile sync.
- Bidirectional Jira sync.

## 12. Acceptance Criteria

- Main boards exclude Epics.
- Epic index includes child counts by status.
- Broken Epic references are reported.
- `render-board --check` detects stale fixture output.
- `examples/minimal-vault` validates with `kanban validate`.
- README quick start only uses implemented commands.
- Docs do not claim unsupported execution behavior.
- Full workspace verification passes:

```bash
pnpm test
pnpm build
```
