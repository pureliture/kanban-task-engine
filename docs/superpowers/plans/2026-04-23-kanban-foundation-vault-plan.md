# Kanban Foundation and Vault Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Home kanban operator workspace and move the Home Markdown issue vault into `~/.openclaw/workspace-kanban/kanban` as a standalone git repository without breaking existing references.

**Architecture:** `~/.openclaw/workspace-kanban` is an OpenClaw operator workspace. Its nested `kanban/` directory is a separate standalone git repository and is ignored by the operator workspace. Existing `~/.openclaw/kanban` references remain valid through a compatibility symlink until later cleanup.

**Tech Stack:** zsh, git, Markdown, OpenClaw workspace files.

---

## File Structure

- Create: `~/.openclaw/workspace-kanban/AGENTS.md` - startup rules for the kanban operator.
- Create: `~/.openclaw/workspace-kanban/SOUL.md` - identity and operating style.
- Create: `~/.openclaw/workspace-kanban/USER.md` - minimal user context.
- Create: `~/.openclaw/workspace-kanban/MEMORY.md` - durable kanban operator memory.
- Create: `~/.openclaw/workspace-kanban/HEARTBEAT.md` - lightweight periodic checks.
- Create: `~/.openclaw/workspace-kanban/.gitignore` - ignores `kanban/` and runtime files.
- Create: `~/.openclaw/workspace-kanban/config/active-recipe.yaml` - selected automation recipe.
- Create: `~/.openclaw/workspace-kanban/config/module-overrides.yaml` - local module settings.
- Create: `~/.openclaw/workspace-kanban/config/kanban-home.yaml` - vault path reference.
- Move: `~/.openclaw/kanban` to `~/.openclaw/workspace-kanban/kanban`.
- Create: `~/.openclaw/kanban` symlink pointing to `~/.openclaw/workspace-kanban/kanban`.
- Modify: `~/.openclaw/.gitignore` if needed so `workspace-kanban/kanban/` is not tracked by parent state.
- Modify: `~/.openclaw` git index so old tracked `kanban/KANBAN.md`, `kanban/registry.yaml`, and `kanban/spaces/*.md` entries are removed before adding only the compatibility symlink.

## Preconditions

- Run all commands from a shell on the target machine.
- Do not delete any existing files.
- Do not use `git reset --hard` or `git checkout --`.
- If `~/.openclaw/workspace-kanban` already exists, inspect it and merge this plan with existing files instead of overwriting.

### Task 1: Record Safety Baseline

**Files:**
- Create: `docs/superpowers/plans/artifacts/kanban-foundation-baseline.md`

- [ ] **Step 1: Create the artifact directory**

Run:

```bash
mkdir -p docs/superpowers/plans/artifacts
```

Expected: command exits with code 0.

- [ ] **Step 2: Capture git and path state**

Run:

```bash
{
  echo "# Kanban Foundation Baseline"
  echo
  date
  echo
  echo "## Existing Paths"
  for p in "$HOME/.openclaw/kanban" "$HOME/.openclaw/workspace-kanban" "$HOME/.openclaw/workspace-kanban/kanban"; do
    if [ -e "$p" ] || [ -L "$p" ]; then
      ls -ld "$p"
    else
      echo "missing $p"
    fi
  done
  echo
  echo "## Git Status: ~/.openclaw"
  git -C "$HOME/.openclaw" status --short --untracked-files=normal || true
  echo
  echo "## Parent tracked kanban files"
  git -C "$HOME/.openclaw" ls-files kanban || true
  echo
  echo "## Current kanban git root"
  git -C "$HOME/.openclaw/kanban" rev-parse --show-toplevel 2>/dev/null || true
  echo
  echo "## Git Status: kanban-task-engine"
  git -C "$HOME/Projects/kanban-task-engine" status --short --untracked-files=normal || true
  echo
  echo "## Current kanban tree"
  find "$HOME/.openclaw/kanban" -maxdepth 3 -print 2>/dev/null | sort || true
} > docs/superpowers/plans/artifacts/kanban-foundation-baseline.md
```

Expected: `docs/superpowers/plans/artifacts/kanban-foundation-baseline.md` exists and contains the three path checks.

- [ ] **Step 3: Review baseline**

Run:

```bash
sed -n '1,220p' docs/superpowers/plans/artifacts/kanban-foundation-baseline.md
```

Expected: output shows whether `~/.openclaw/kanban` and `~/.openclaw/workspace-kanban` exist.

- [ ] **Step 4: Confirm parent currently tracks or ignores kanban**

Run:

```bash
git -C "$HOME/.openclaw" ls-files kanban
```

Expected: output may include existing tracked files such as `kanban/KANBAN.md`, `kanban/registry.yaml`, and `kanban/spaces/*.md`. Record this output in the baseline artifact. Slice 2 removes these entries from the parent index.

- [ ] **Step 5: Commit the baseline artifact**

Run:

```bash
git add docs/superpowers/plans/artifacts/kanban-foundation-baseline.md
git commit --no-gpg-sign -m "docs: record kanban foundation baseline" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds and includes only the baseline artifact.

### Task 2: Create the Operator Workspace Shell

**Files:**
- Create: `~/.openclaw/workspace-kanban/AGENTS.md`
- Create: `~/.openclaw/workspace-kanban/SOUL.md`
- Create: `~/.openclaw/workspace-kanban/USER.md`
- Create: `~/.openclaw/workspace-kanban/MEMORY.md`
- Create: `~/.openclaw/workspace-kanban/HEARTBEAT.md`
- Create: `~/.openclaw/workspace-kanban/.gitignore`
- Create: `~/.openclaw/workspace-kanban/memory/.gitkeep`

- [ ] **Step 1: Create workspace directories**

Run:

```bash
mkdir -p "$HOME/.openclaw/workspace-kanban/memory" "$HOME/.openclaw/workspace-kanban/config" "$HOME/.openclaw/workspace-kanban/runs"
```

Expected: command exits with code 0.

- [ ] **Step 2: Write AGENTS.md**

Create `~/.openclaw/workspace-kanban/AGENTS.md` with:

```markdown
# AGENTS.md - Kanban Operator Workspace

This workspace operates the Home kanban control plane.

## Session Startup

Before doing anything else:

1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/YYYY-MM-DD.md` for today and yesterday when present
4. Read `MEMORY.md`

## Scope

- The Markdown issue vault is `kanban/`.
- `kanban/` is a standalone git repository and must not be committed from this workspace repository.
- Use `config/active-recipe.yaml` and `config/module-overrides.yaml` to decide which automation modules are enabled.

## Boundaries

- Do not start issue execution from card movement unless the active recipe explicitly allows it.
- Do not write secrets into issue Markdown, events, or canonical JSON.
- Prefer explicit Run commands for execution.
```

- [ ] **Step 3: Write identity files**

Create `~/.openclaw/workspace-kanban/SOUL.md` with:

```markdown
# SOUL.md - Kanban Operator

You operate the Home kanban control plane.

## Core Truths

- Markdown issue files are the source of truth.
- Automation follows policy and recipe files.
- Issue movement and execution are separate.
- Prefer traceable, reversible changes.
```

Create `~/.openclaw/workspace-kanban/USER.md` with:

```markdown
# USER.md - About Your Human

## Context

The user wants a modular kanban automation system where Home can use OpenClaw and Claude Code, while Work uses the same schema with Jira export only.
```

Create `~/.openclaw/workspace-kanban/MEMORY.md` with:

```markdown
# MEMORY.md - Kanban Operator Memory

## Stable Context

- Home issue vault path: `~/.openclaw/workspace-kanban/kanban`
- Engine repo: `~/Projects/kanban-task-engine`
- Markdown issue files under `kanban/issues/` are the source of truth.
- Canonical JSON is generated/internal.
```

Create `~/.openclaw/workspace-kanban/HEARTBEAT.md` with:

```markdown
# HEARTBEAT.md

- Check for READY issues only when explicitly requested or when a recipe says to watch.
- Do not start execution unless policy allows it.
- If nothing needs attention, reply `HEARTBEAT_OK`.
```

- [ ] **Step 4: Write .gitignore**

Create `~/.openclaw/workspace-kanban/.gitignore` with:

```gitignore
.DS_Store
*.tmp
*.log
kanban/
runs/
runtime/
.secrets/
secrets.json
```

- [ ] **Step 5: Keep the empty memory directory tracked**

Run:

```bash
touch "$HOME/.openclaw/workspace-kanban/memory/.gitkeep"
```

Expected: command exits with code 0.

- [ ] **Step 6: Initialize workspace git repo if needed**

Run:

```bash
if ! git -C "$HOME/.openclaw/workspace-kanban" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$HOME/.openclaw/workspace-kanban" init
fi
```

Expected: `git -C "$HOME/.openclaw/workspace-kanban" rev-parse --show-toplevel` prints `/Users/ddalkak/.openclaw/workspace-kanban`.

- [ ] **Step 7: Commit workspace shell**

Run:

```bash
git -C "$HOME/.openclaw/workspace-kanban" add AGENTS.md SOUL.md USER.md MEMORY.md HEARTBEAT.md .gitignore memory/.gitkeep
git -C "$HOME/.openclaw/workspace-kanban" commit --no-gpg-sign -m "config: initialize kanban operator workspace" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

- [ ] **Step 8: If the parent `.openclaw` repo uses workspace submodules, register the new workspace pointer**

Run:

```bash
git -C "$HOME/.openclaw" submodule status workspace-kanban >/dev/null 2>&1 || true
```

Expected: if this prints a missing-path error, defer parent registration until the operator workspace commit exists. Follow the existing `.openclaw/.gitmodules` pattern only after confirming the other `workspace-*` entries are managed that way.

### Task 3: Add Operator Configuration

**Files:**
- Create: `~/.openclaw/workspace-kanban/config/active-recipe.yaml`
- Create: `~/.openclaw/workspace-kanban/config/module-overrides.yaml`
- Create: `~/.openclaw/workspace-kanban/config/kanban-home.yaml`

- [ ] **Step 1: Write active recipe config**

Create `~/.openclaw/workspace-kanban/config/active-recipe.yaml` with:

```yaml
recipe: home-assisted
vaultPath: ~/.openclaw/workspace-kanban/kanban
enginePath: ~/Projects/kanban-task-engine
```

- [ ] **Step 2: Write module overrides**

Create `~/.openclaw/workspace-kanban/config/module-overrides.yaml` with:

```yaml
modules:
  watcher:
    enabled: false
  manual-command-trigger:
    enabled: true
  openclaw-executor:
    enabled: false
  claude-code-executor:
    enabled: false
  git-checkpoint:
    enabled: true
```

- [ ] **Step 3: Write kanban home config**

Create `~/.openclaw/workspace-kanban/config/kanban-home.yaml` with:

```yaml
kanbanHome: ~/.openclaw/workspace-kanban/kanban
issuesPath: ~/.openclaw/workspace-kanban/kanban/issues
boardsPath: ~/.openclaw/workspace-kanban/kanban/boards
legacySpacesPath: ~/.openclaw/workspace-kanban/kanban/spaces
```

- [ ] **Step 4: Commit operator config**

Run:

```bash
git -C "$HOME/.openclaw/workspace-kanban" add config/active-recipe.yaml config/module-overrides.yaml config/kanban-home.yaml
git -C "$HOME/.openclaw/workspace-kanban" commit --no-gpg-sign -m "config: add kanban operator defaults" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 4: Move the Home Vault

**Files:**
- Move: `~/.openclaw/kanban` to `~/.openclaw/workspace-kanban/kanban`
- Create: `~/.openclaw/kanban` symlink
- Create: `~/.openclaw/workspace-kanban/kanban/.gitignore`

- [ ] **Step 1: Verify move is safe**

Run:

```bash
test -d "$HOME/.openclaw/kanban"
test ! -e "$HOME/.openclaw/workspace-kanban/kanban"
```

Expected: both commands exit with code 0. If the second command fails, stop and inspect the existing target path.

- [ ] **Step 2: Move the vault**

Run:

```bash
mv "$HOME/.openclaw/kanban" "$HOME/.openclaw/workspace-kanban/kanban"
```

Expected: `test -d "$HOME/.openclaw/workspace-kanban/kanban"` exits with code 0.

- [ ] **Step 3: Create compatibility symlink**

Run:

```bash
ln -s "$HOME/.openclaw/workspace-kanban/kanban" "$HOME/.openclaw/kanban"
```

Expected: `readlink "$HOME/.openclaw/kanban"` prints `/Users/ddalkak/.openclaw/workspace-kanban/kanban`.

- [ ] **Step 4: Create vault directories**

Run:

```bash
mkdir -p \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/openclaw" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/vibe-coding/ai-cli-orch-wrapper" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/vibe-coding/kanban-task-engine" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/vibe-coding/cc-openclaw-harness" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/vibe-coding/flow-weaver" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/stocks" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/web" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/personal" \
  "$HOME/.openclaw/workspace-kanban/kanban/issues/career" \
  "$HOME/.openclaw/workspace-kanban/kanban/boards" \
  "$HOME/.openclaw/workspace-kanban/kanban/templates" \
  "$HOME/.openclaw/workspace-kanban/kanban/events" \
  "$HOME/.openclaw/workspace-kanban/kanban/canonical/generated" \
  "$HOME/.openclaw/workspace-kanban/kanban/exports/tmp" \
  "$HOME/.openclaw/workspace-kanban/kanban/archive" \
  "$HOME/.openclaw/workspace-kanban/kanban/runtime"
```

Expected: command exits with code 0.

- [ ] **Step 5: Write vault .gitignore**

Create `~/.openclaw/workspace-kanban/kanban/.gitignore` with:

```gitignore
.DS_Store
runtime/
canonical/generated/
exports/tmp/
*.lock
*.tmp
```

- [ ] **Step 6: Initialize vault git repo**

Run:

```bash
if ! git -C "$HOME/.openclaw/workspace-kanban/kanban" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$HOME/.openclaw/workspace-kanban/kanban" init
fi
```

Expected: `git -C "$HOME/.openclaw/workspace-kanban/kanban" rev-parse --show-toplevel` prints `/Users/ddalkak/.openclaw/workspace-kanban/kanban`.

- [ ] **Step 7: Commit vault baseline**

Run:

```bash
git -C "$HOME/.openclaw/workspace-kanban/kanban" add .
git -C "$HOME/.openclaw/workspace-kanban/kanban" commit --no-gpg-sign -m "config: initialize home kanban vault" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds or prints that there is nothing to commit if the vault was already initialized with identical content.

### Task 5: Remove Old Vault Files from Parent Index

**Files:**
- Modify index only: `~/.openclaw` tracked `kanban/*` entries
- Add to parent index: `~/.openclaw/kanban` symlink

- [ ] **Step 1: Inspect parent tracked kanban paths**

Run:

```bash
git -C "$HOME/.openclaw" ls-files kanban
```

Expected: output lists tracked old vault files, or prints nothing if the parent has already stopped tracking them.

- [ ] **Step 2: Remove old tracked vault files from parent index**

Run:

```bash
git -C "$HOME/.openclaw" rm --cached -r kanban
```

Expected: removes tracked `kanban/*` entries from the parent index without deleting the symlink target. If git reports no pathspec match, continue.

- [ ] **Step 3: Add only the compatibility symlink to the parent index**

Run:

```bash
git -C "$HOME/.openclaw" add kanban
git -C "$HOME/.openclaw" diff --cached --name-status -- kanban
```

Expected: diff shows deletion of old tracked files and an added `kanban` symlink entry. It must not show files under `workspace-kanban/kanban/`.

- [ ] **Step 4: Commit parent compatibility boundary**

Run:

```bash
git -C "$HOME/.openclaw" commit --no-gpg-sign -m "config: move kanban vault behind workspace symlink" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds and parent `.openclaw` no longer tracks live vault files.

### Task 6: Verify Separation

**Files:**
- Read: `~/.openclaw/workspace-kanban/.gitignore`
- Read: `~/.openclaw/workspace-kanban/kanban/.git`

- [ ] **Step 1: Verify symlink and repo roots**

Run:

```bash
readlink "$HOME/.openclaw/kanban"
git -C "$HOME/.openclaw/workspace-kanban" rev-parse --show-toplevel
git -C "$HOME/.openclaw/workspace-kanban/kanban" rev-parse --show-toplevel
```

Expected:

```text
/Users/ddalkak/.openclaw/workspace-kanban/kanban
/Users/ddalkak/.openclaw/workspace-kanban
/Users/ddalkak/.openclaw/workspace-kanban/kanban
```

- [ ] **Step 2: Verify parent ignores nested vault**

Run:

```bash
git -C "$HOME/.openclaw/workspace-kanban" status --short --untracked-files=normal
```

Expected: output does not include `kanban/`.

- [ ] **Step 3: Verify parent tracks no live vault files**

Run:

```bash
git -C "$HOME/.openclaw" ls-files kanban
```

Expected: output is either exactly `kanban` for the compatibility symlink, or empty if the parent deliberately ignores the symlink. It must not list `kanban/KANBAN.md`, `kanban/registry.yaml`, or `kanban/spaces/*.md`.

- [ ] **Step 4: Verify legacy path still resolves**

Run:

```bash
find "$HOME/.openclaw/kanban" -maxdepth 2 -print | sort | sed -n '1,80p'
```

Expected: output lists files from `/Users/ddalkak/.openclaw/kanban`, backed by the symlink target.

- [ ] **Step 5: Commit operator workspace final state**

Run:

```bash
git -C "$HOME/.openclaw/workspace-kanban" add .
git -C "$HOME/.openclaw/workspace-kanban" commit --no-gpg-sign -m "config: verify kanban vault boundary" -m "Co-Authored-By: OpenClaw <openclaw@local>" || true
```

Expected: either commit succeeds or git reports nothing to commit. It must not stage `kanban/`.
