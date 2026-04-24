# Kanban CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first user-facing `kanban` CLI for vault inspection, validation, and generated board rendering without adding execution or status-changing behavior.

**Architecture:** Add a new `@kanban-task-engine/cli` workspace package that wires `cac` commands to existing core store, resolver, and board-rendering APIs. All commands share one context builder for vault resolution, registry loading, output streams, and `MarkdownStore` construction. Command handlers return structured results so tests can assert JSON output, human output, and exit codes without spawning real external adapters.

**Tech Stack:** TypeScript 5.4, pnpm workspaces, Vitest 1.x, cac, yaml, Node `fs/promises`, Node `path`, Node streams, existing `@kanban-task-engine/core` and `@kanban-task-engine/schema` packages.

---

## File Structure

- Create: `packages/cli/package.json` - workspace package metadata, `kanban` binary, `cac` dependency, test/build scripts.
- Create: `packages/cli/tsconfig.json` - TypeScript config matching existing package conventions.
- Create: `packages/cli/src/bin.ts` - executable entrypoint that runs the CLI and assigns `process.exitCode`.
- Create: `packages/cli/src/index.ts` - `cac` command registration, help text, global `--vault`, command dispatch, and usage-error handling.
- Create: `packages/cli/src/context.ts` - shared `CliContext`, vault path resolution, registry parsing, `WorkspaceResolver` and `MarkdownStore` construction, stream defaults, and JSON result type.
- Create: `packages/cli/src/commands/doctor.ts` - `kanban doctor` checks and human/JSON output.
- Create: `packages/cli/src/commands/validate.ts` - `kanban validate [issue-id]` validation flow, parse-error collection, human/JSON output, and exit code mapping.
- Create: `packages/cli/src/commands/render-board.ts` - `kanban render-board [--check] [--space <space>]` board generation, stale detection, writes, human output, and exit code mapping.
- Create: `packages/cli/tests/helpers.ts` - temp vault fixture creation, stream capture, JSON parsing, and command invocation helpers.
- Create: `packages/cli/tests/fixtures/minimal-vault/registry.yaml` - minimal registry with one container space and one single space.
- Create: `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md` - valid task fixture.
- Create: `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-002-invalid.md` - invalid issue fixture for validation-error reporting.
- Create: `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/_epics/VC-010-cli-mvp.md` - Epic fixture that must not render as a board card.
- Create: `packages/cli/tests/fixtures/minimal-vault/issues/openclaw/OC-001-openclaw-task.md` - single-space issue fixture.
- Create: `packages/cli/tests/fixtures/minimal-vault/boards/vibe-coding.md` - intentionally stale board fixture for `--check`.
- Create: `packages/cli/tests/fixtures/minimal-vault/boards/openclaw.md` - current or writable single-space board fixture.
- Create: `packages/cli/tests/commands/doctor.test.ts` - doctor checks, JSON contract, and exit codes.
- Create: `packages/cli/tests/commands/validate.test.ts` - all-issue validation, single-id validation, parse-error sanitization, JSON output, and usage errors.
- Create: `packages/cli/tests/commands/render-board.test.ts` - board writes, `--check` stale detection, `--space`, Epic exclusion, relative links, and JSON-like structured result checks through command return values.
- Create: `packages/cli/tests/context.test.ts` - `--vault`, `KANBAN_HOME`, default home, tilde expansion, relative path resolution, and missing-vault errors.
- Create: `packages/cli/tests/help.test.ts` - `kanban --help` smoke test proving only `doctor`, `validate`, and `render-board` are listed.
- Modify: `pnpm-workspace.yaml` only if it does not already include `packages/*`.
- Do not modify: `packages/adapter-cli/**`; it is an execution adapter, not the user-facing CLI.
- Do not implement: status transitions, execution commands, git merge/worktree behavior, Jira/GitHub/Firebase network calls, OpenClaw/Claude execution, or external adapter calls.

## Preconditions

- Execute this plan after the contract-hardening and vault-store plans land, because this CLI relies on core-owned canonical validation, `MarkdownStore.findByIssueId()`, resolver-backed store construction, recursive `MarkdownStore.listTasks()`, and `WorkspaceResolver.fromRegistry()`.
- Work from an isolated worktree. For this planning branch, use `~/.config/superpowers/worktrees/kanban-task-engine/docs-gpt55-review-specs`.
- Run `git status --short` before each task. If other agents have modified docs outside this plan, do not touch or revert them.
- Keep commits scoped to the files listed in each task. If a command exposes a missing API from a prerequisite plan, stop and update the implementation notes instead of adding compatibility code inside the CLI package.
- Use `pnpm --filter @kanban-task-engine/cli test`, `pnpm --filter @kanban-task-engine/cli build`, root `pnpm test`, and root `pnpm build` exactly as written in the verification tasks.

## Task 1: CLI Package Skeleton and Help Surface

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/tests/help.test.ts`
- Read-only check: `pnpm-workspace.yaml` already uses `packages/*`; do not modify it unless the verification command in Step 1 proves the new package is not discovered.

- [ ] **Step 1: Verify workspace package discovery**

Run:

```bash
test -f pnpm-workspace.yaml && cat pnpm-workspace.yaml
```

Expected: output includes `packages/*`. If `pnpm-workspace.yaml` does not exist or does not include `packages/*`, create or update only that file so the new CLI package is discovered:

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: Create the CLI package manifest**

Create `packages/cli/package.json`:

```json
{
  "name": "@kanban-task-engine/cli",
  "version": "0.1.0",
  "description": "User-facing kanban CLI for Markdown vault inspection and board rendering",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "kanban": "./dist/bin.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@kanban-task-engine/core": "workspace:*",
    "@kanban-task-engine/schema": "workspace:*",
    "cac": "^6.7.14",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 3: Create TypeScript config**

Create `packages/cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 4: Write the failing help smoke test**

Create `packages/cli/tests/help.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createKanbanCli } from '../src';

describe('kanban help', () => {
  it('lists only inspection, validation, and board-rendering commands', () => {
    const cli = createKanbanCli();
    const help = cli.outputHelp();

    expect(help).toContain('doctor');
    expect(help).toContain('validate');
    expect(help).toContain('render-board');
    expect(help).not.toContain(' run');
    expect(help).not.toContain(' approve');
    expect(help).not.toContain(' abort');
    expect(help).not.toContain(' retry');
    expect(help).not.toContain(' init');
  });
});
```

- [ ] **Step 5: Run the help test to verify it fails**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- help.test.ts
```

Expected: FAIL because `packages/cli/src/index.ts` does not exist.

- [ ] **Step 6: Implement minimal CLI registration**

Create `packages/cli/src/index.ts`:

```ts
import { cac, CAC } from 'cac';

export interface RunCliOptions {
  argv?: string[];
}

export function createKanbanCli(): CAC {
  const cli = cac('kanban');

  cli.option('--vault <path>', 'Vault root path');

  cli
    .command('doctor', 'Report whether the local vault and toolchain are usable')
    .option('--json', 'Print stable JSON output')
    .action(() => undefined);

  cli
    .command('validate [issueId]', 'Validate Markdown issues in the vault')
    .option('--json', 'Print stable JSON output')
    .action(() => undefined);

  cli
    .command('render-board', 'Generate Markdown board files from vault issues')
    .option('--check', 'Do not write files; exit nonzero when generated output differs')
    .option('--space <space>', 'Render only one registry space')
    .action(() => undefined);

  cli.help();
  cli.version('0.1.0');

  return cli;
}

export async function runCli(options: RunCliOptions = {}): Promise<number> {
  const cli = createKanbanCli();
  cli.parse(options.argv ?? process.argv, { run: false });
  await cli.runMatchedCommand();
  return 0;
}
```

Create `packages/cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { runCli } from './index';

runCli()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
```

- [ ] **Step 7: Run the help test to verify it passes**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- help.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run the CLI package build**

Run:

```bash
pnpm --filter @kanban-task-engine/cli build
```

Expected: PASS and `packages/cli/dist/bin.js` exists.

- [ ] **Step 9: Commit the package skeleton**

Run:

```bash
git add packages/cli pnpm-workspace.yaml
git diff --cached --name-only
git commit -m "feat(cli): add kanban cli package skeleton"
```

Expected: staged files are limited to `packages/cli/**` and, only when needed, `pnpm-workspace.yaml`.

## Task 2: Shared CLI Context Resolution

**Files:**

- Create: `packages/cli/src/context.ts`
- Create: `packages/cli/tests/context.test.ts`
- Create: `packages/cli/tests/helpers.ts`
- Create fixture directory: `packages/cli/tests/fixtures/minimal-vault/`

- [ ] **Step 1: Create minimal vault fixtures**

Create this fixture tree:

```text
packages/cli/tests/fixtures/minimal-vault/
  registry.yaml
  issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md
  issues/vibe-coding/kanban-task-engine/VC-002-invalid.md
  issues/vibe-coding/_epics/VC-010-cli-mvp.md
  issues/openclaw/OC-001-openclaw-task.md
  boards/vibe-coding.md
  boards/openclaw.md
```

Create `packages/cli/tests/fixtures/minimal-vault/registry.yaml`:

```yaml
spaces:
  vibe-coding:
    type: container
    issues: issues/vibe-coding
    board: boards/vibe-coding.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
  openclaw:
    type: single
    issues: issues/openclaw
    board: boards/openclaw.md
```

Create `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md`:

```markdown
---
id: VC-001
title: Contract hardening
type: task
status: READY
executor: claude-code
project: kanban-task-engine
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P1
---

## 목적
Harden the task contracts.

## 컨텍스트
The CLI reads this issue through MarkdownStore.

## Acceptance Criteria
- The issue validates.

## 실행 힌트
Run focused tests.
```

Create `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/kanban-task-engine/VC-002-invalid.md`:

```markdown
---
id: VC-002
title: Invalid issue
type: task
status: READY
executor: claude-code
project: kanban-task-engine
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P1
---

## 목적
This issue intentionally omits required sections.
```

Create `packages/cli/tests/fixtures/minimal-vault/issues/vibe-coding/_epics/VC-010-cli-mvp.md`:

```markdown
---
id: VC-010
title: CLI MVP
type: epic
status: TODO
executor: human
project: ""
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P0
---

## 목표
Ship the inspection CLI.

## 범위
Doctor, validate, and render-board only.

## 성공 지표
- CLI commands pass tests.

## 하위 티켓
- VC-001
```

Create `packages/cli/tests/fixtures/minimal-vault/issues/openclaw/OC-001-openclaw-task.md`:

```markdown
---
id: OC-001
title: OpenClaw task
type: task
status: TODO
executor: human
project: openclaw
created: 2026-04-24T00:00:00.000Z
updated: 2026-04-24T00:00:00.000Z
priority: P2
---

## 목적
Validate single-space issue behavior.

## 컨텍스트
The openclaw space is not a container project.

## Acceptance Criteria
- The issue validates.

## 실행 힌트
Run focused tests.
```

Create `packages/cli/tests/fixtures/minimal-vault/boards/vibe-coding.md`:

```markdown
# stale board
```

Create `packages/cli/tests/fixtures/minimal-vault/boards/openclaw.md`:

```markdown
# stale openclaw board
```

- [ ] **Step 2: Create test helpers**

Create `packages/cli/tests/helpers.ts`:

```ts
import { mkdtemp, cp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Writable } from 'stream';

export class CaptureStream extends Writable {
  private chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  text(): string {
    return this.chunks.join('');
  }
}

export async function copyMinimalVault(): Promise<{ vaultRoot: string; cleanup: () => Promise<void> }> {
  const vaultRoot = await mkdtemp(path.join(tmpdir(), 'kanban-cli-vault-'));
  const source = path.join(__dirname, 'fixtures', 'minimal-vault');
  await cp(source, vaultRoot, { recursive: true });

  return {
    vaultRoot,
    cleanup: () => rm(vaultRoot, { recursive: true, force: true }),
  };
}

export function parseJsonOutput<T>(output: string): T {
  return JSON.parse(output) as T;
}
```

- [ ] **Step 3: Write failing context tests**

Create `packages/cli/tests/context.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { homedir } from 'os';
import { buildCliContext, resolveVaultRoot } from '../src/context';
import { CaptureStream, copyMinimalVault } from './helpers';

describe('CLI context resolution', () => {
  const originalKanbanHome = process.env.KANBAN_HOME;

  afterEach(() => {
    if (originalKanbanHome === undefined) {
      delete process.env.KANBAN_HOME;
    } else {
      process.env.KANBAN_HOME = originalKanbanHome;
    }
    vi.restoreAllMocks();
  });

  it('prefers explicit --vault over KANBAN_HOME', async () => {
    const explicit = await copyMinimalVault();
    const envVault = await copyMinimalVault();
    process.env.KANBAN_HOME = envVault.vaultRoot;

    try {
      const resolved = await resolveVaultRoot({ vault: explicit.vaultRoot, cwd: process.cwd() });
      expect(resolved).toBe(path.resolve(explicit.vaultRoot));
    } finally {
      await explicit.cleanup();
      await envVault.cleanup();
    }
  });

  it('uses KANBAN_HOME when --vault is absent', async () => {
    const fixture = await copyMinimalVault();
    process.env.KANBAN_HOME = fixture.vaultRoot;

    try {
      const resolved = await resolveVaultRoot({ cwd: process.cwd() });
      expect(resolved).toBe(path.resolve(fixture.vaultRoot));
    } finally {
      await fixture.cleanup();
    }
  });

  it('falls back to <OPENCLAW_HOME>/workspace-kanban/kanban', async () => {
    delete process.env.KANBAN_HOME;
    const resolved = await resolveVaultRoot({ cwd: process.cwd(), checkExists: false });
    expect(resolved).toBe(path.join(homedir(), '.openclaw', 'workspace-kanban', 'kanban'));
  });

  it('expands tilde and resolves relative vault paths from cwd', async () => {
    expect(await resolveVaultRoot({ vault: '~/kanban-test', cwd: '/tmp', checkExists: false })).toBe(
      path.join(homedir(), 'kanban-test')
    );
    expect(await resolveVaultRoot({ vault: 'relative-vault', cwd: '/tmp', checkExists: false })).toBe(
      path.join('/tmp', 'relative-vault')
    );
  });

  it('fails clearly when the vault path is missing', async () => {
    await expect(resolveVaultRoot({ vault: '/definitely/missing/kanban-vault', cwd: process.cwd() })).rejects.toThrow(
      'Vault path does not exist: /definitely/missing/kanban-vault'
    );
  });

  it('builds one shared context with registry, resolver, store, stdout, and stderr', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout, stderr });
      expect(context.vaultRoot).toBe(path.resolve(fixture.vaultRoot));
      expect(context.registryPath).toBe(path.join(context.vaultRoot, 'registry.yaml'));
      expect(context.resolver).toBeDefined();
      expect(context.store).toBeDefined();
      expect(context.stdout).toBe(stdout);
      expect(context.stderr).toBe(stderr);
    } finally {
      await fixture.cleanup();
    }
  });
});
```

- [ ] **Step 4: Run context tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- context.test.ts
```

Expected: FAIL because `packages/cli/src/context.ts` does not exist.

- [ ] **Step 5: Implement shared context builder**

Create `packages/cli/src/context.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import { Writable } from 'stream';
import YAML from 'yaml';
import { MarkdownStore, WorkspaceResolver } from '@kanban-task-engine/core';

export interface CliContext {
  vaultRoot: string;
  registryPath: string;
  registry: {
    spaces: Record<string, { type: 'single' | 'container'; issues: string; board: string; projects?: Record<string, { path: string }> }>;
  };
  resolver: WorkspaceResolver;
  store: MarkdownStore;
  stdout: Writable;
  stderr: Writable;
}

export interface BuildCliContextOptions {
  vault?: string;
  cwd?: string;
  stdout?: Writable;
  stderr?: Writable;
}

export interface ResolveVaultRootOptions {
  vault?: string;
  cwd: string;
  checkExists?: boolean;
}

export interface CommandJsonResult {
  ok: boolean;
  command: string;
  vaultRoot: string;
  errors: Array<{ file?: string; issueId?: string; message: string }>;
  warnings: Array<{ file?: string; issueId?: string; message: string }>;
}

export async function resolveVaultRoot(options: ResolveVaultRootOptions): Promise<string> {
  const checkExists = options.checkExists ?? true;
  const rawVault = options.vault ?? process.env.KANBAN_HOME ?? '<OPENCLAW_HOME>/workspace-kanban/kanban';
  const expanded = expandHome(rawVault);
  const resolved = path.resolve(options.cwd, expanded);

  if (checkExists) {
    try {
      await fs.access(resolved);
    } catch {
      throw new Error(`Vault path does not exist: ${resolved}`);
    }
  }

  return resolved;
}

export async function buildCliContext(options: BuildCliContextOptions = {}): Promise<CliContext> {
  const vaultRoot = await resolveVaultRoot({ vault: options.vault, cwd: options.cwd ?? process.cwd() });
  const registryPath = path.join(vaultRoot, 'registry.yaml');
  const registryText = await fs.readFile(registryPath, 'utf-8');
  const registry = YAML.parse(registryText);
  const resolver = WorkspaceResolver.fromRegistry(registry, vaultRoot);
  const store = new MarkdownStore({ vaultRoot, resolver });

  return {
    vaultRoot,
    registryPath,
    registry,
    resolver,
    store,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
  };
}

export function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return path.join(homedir(), input.slice(2));
  return input;
}

export function writeJson(stdout: Writable, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
```

If TypeScript reports that `new MarkdownStore({ vaultRoot, resolver })` is not accepted, the vault-store prerequisite has not landed; stop instead of changing CLI scope.

- [ ] **Step 6: Run context tests to verify they pass**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- context.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit shared context and fixtures**

Run:

```bash
git add packages/cli/src/context.ts packages/cli/tests/context.test.ts packages/cli/tests/helpers.ts packages/cli/tests/fixtures
git diff --cached --name-only
git commit -m "feat(cli): add shared vault context"
```

Expected: staged files are limited to CLI context, helpers, and fixtures.

## Task 3: Doctor Command

**Files:**

- Create: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/tests/commands/doctor.test.ts`

- [ ] **Step 1: Write failing doctor tests**

Create `packages/cli/tests/commands/doctor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runDoctorCommand } from '../../src/commands/doctor';
import { buildCliContext } from '../../src/context';
import { CaptureStream, copyMinimalVault, parseJsonOutput } from '../helpers';

describe('doctor command', () => {
  it('prints stable JSON and exits 0 when required checks pass', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout, stderr });
      const exitCode = await runDoctorCommand(context, { json: true });
      const output = parseJsonOutput<{ ok: boolean; command: string; vaultRoot: string; errors: unknown[]; warnings: unknown[] }>(stdout.text());

      expect(exitCode).toBe(0);
      expect(output.ok).toBe(true);
      expect(output.command).toBe('doctor');
      expect(output.vaultRoot).toBe(context.vaultRoot);
      expect(output.errors).toEqual([]);
      expect(stderr.text()).toBe('');
    } finally {
      await fixture.cleanup();
    }
  });

  it('prints a concise human table', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runDoctorCommand(context, { json: false });

      expect(exitCode).toBe(0);
      expect(stdout.text()).toContain('check');
      expect(stdout.text()).toContain('vault root');
      expect(stdout.text()).toContain('registry.yaml');
      expect(stdout.text()).toContain('issues/');
      expect(stdout.text()).toContain('boards/');
      expect(stdout.text()).not.toContain('Error:');
    } finally {
      await fixture.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run doctor tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- doctor.test.ts
```

Expected: FAIL because `runDoctorCommand` does not exist.

- [ ] **Step 3: Implement doctor checks and output**

Create `packages/cli/src/commands/doctor.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { CliContext, CommandJsonResult, writeJson } from '../context';

export interface DoctorOptions {
  json?: boolean;
}

interface DoctorCheck {
  name: string;
  required: boolean;
  ok: boolean;
  message: string;
}

export async function runDoctorCommand(context: CliContext, options: DoctorOptions): Promise<number> {
  const checks: DoctorCheck[] = [];

  checks.push({ name: 'node', required: true, ok: true, message: process.version });
  checks.push(await executableCheck('pnpm', true));
  checks.push(await executableCheck('git', true));
  checks.push(await pathCheck('vault root', context.vaultRoot, true));
  checks.push(await pathCheck('registry.yaml', context.registryPath, true));
  checks.push(await pathCheck('issues/', path.join(context.vaultRoot, 'issues'), true));
  checks.push(await pathCheck('boards/', path.join(context.vaultRoot, 'boards'), true));
  checks.push(await optionalFuturePathCheck('events/', path.join(context.vaultRoot, 'events')));
  checks.push(await optionalFuturePathCheck('runtime/', path.join(context.vaultRoot, 'runtime')));
  checks.push(await executableCheck('claude', false));

  const requiredFailures = checks.filter(check => check.required && !check.ok);
  const warnings = checks
    .filter(check => !check.required && !check.ok)
    .map(check => ({ message: `${check.name}: ${check.message}` }));

  if (options.json) {
    const result: CommandJsonResult = {
      ok: requiredFailures.length === 0,
      command: 'doctor',
      vaultRoot: context.vaultRoot,
      errors: requiredFailures.map(check => ({ message: `${check.name}: ${check.message}` })),
      warnings,
    };
    writeJson(context.stdout, result);
  } else {
    context.stdout.write('check|required|status|message\n');
    for (const check of checks) {
      context.stdout.write(`${check.name}|${check.required ? 'yes' : 'no'}|${check.ok ? 'ok' : 'fail'}|${check.message}\n`);
    }
  }

  return requiredFailures.length === 0 ? 0 : 1;
}

async function pathCheck(name: string, targetPath: string, required: boolean): Promise<DoctorCheck> {
  try {
    await fs.access(targetPath);
    return { name, required, ok: true, message: targetPath };
  } catch {
    return { name, required, ok: false, message: `missing: ${targetPath}` };
  }
}

async function optionalFuturePathCheck(name: string, targetPath: string): Promise<DoctorCheck> {
  try {
    await fs.access(targetPath);
    return { name, required: false, ok: true, message: targetPath };
  } catch {
    return { name, required: false, ok: true, message: `not present; reserved for state-changing commands: ${targetPath}` };
  }
}

async function executableCheck(name: string, required: boolean): Promise<DoctorCheck> {
  const ok = await canSpawn(name, ['--version']);
  return {
    name,
    required,
    ok: required ? ok : true,
    message: ok ? 'available' : required ? 'not found on PATH' : 'not found on PATH; optional',
  };
}

function canSpawn(command: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0 || code === null));
  });
}
```

- [ ] **Step 4: Wire doctor into the CLI dispatcher**

Update `packages/cli/src/index.ts` so the `doctor` action builds context and returns the command exit code:

```ts
import { cac, CAC } from 'cac';
import { buildCliContext } from './context';
import { runDoctorCommand } from './commands/doctor';

export interface RunCliOptions {
  argv?: string[];
}

export function createKanbanCli(): CAC {
  const cli = cac('kanban');

  cli.option('--vault <path>', 'Vault root path');

  cli
    .command('doctor', 'Report whether the local vault and toolchain are usable')
    .option('--json', 'Print stable JSON output')
    .action(async (options: { json?: boolean; vault?: string }) => {
      const context = await buildCliContext({ vault: options.vault });
      return runDoctorCommand(context, { json: options.json });
    });

  cli
    .command('validate [issueId]', 'Validate Markdown issues in the vault')
    .option('--json', 'Print stable JSON output')
    .action(() => undefined);

  cli
    .command('render-board', 'Generate Markdown board files from vault issues')
    .option('--check', 'Do not write files; exit nonzero when generated output differs')
    .option('--space <space>', 'Render only one registry space')
    .action(() => undefined);

  cli.help();
  cli.version('0.1.0');

  return cli;
}

export async function runCli(options: RunCliOptions = {}): Promise<number> {
  const cli = createKanbanCli();
  cli.parse(options.argv ?? process.argv, { run: false });
  const result = await cli.runMatchedCommand();
  return typeof result === 'number' ? result : 0;
}
```

- [ ] **Step 5: Run doctor tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run help smoke test again**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- help.test.ts
```

Expected: PASS and help still lists only `doctor`, `validate`, and `render-board`.

- [ ] **Step 7: Commit doctor command**

Run:

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/doctor.ts packages/cli/tests/commands/doctor.test.ts
git commit -m "feat(cli): add doctor command"
```

Expected: commit succeeds with only CLI files staged.

## Task 4: Validate Command

**Files:**

- Create: `packages/cli/src/commands/validate.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/tests/commands/validate.test.ts`

- [ ] **Step 1: Write failing validate tests**

Create `packages/cli/tests/commands/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCliContext } from '../../src/context';
import { runValidateCommand } from '../../src/commands/validate';
import { CaptureStream, copyMinimalVault, parseJsonOutput } from '../helpers';

describe('validate command', () => {
  it('validates all issues, reports invalid files, and does not print parser stacks', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runValidateCommand(context, {});

      expect(exitCode).toBe(1);
      expect(stdout.text()).toContain('VC-002');
      expect(stdout.text()).toContain('VC-002-invalid.md');
      expect(stdout.text()).not.toContain('at ');
      expect(stdout.text()).not.toContain('YAMLParseError');
    } finally {
      await fixture.cleanup();
    }
  });

  it('validates one issue id using findByIssueId', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runValidateCommand(context, { issueId: 'VC-001' });

      expect(exitCode).toBe(0);
      expect(stdout.text()).toContain('VC-001');
      expect(stdout.text()).toContain('valid');
      expect(stdout.text()).not.toContain('VC-002');
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns stable JSON output', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runValidateCommand(context, { json: true });
      const output = parseJsonOutput<{ ok: boolean; command: string; vaultRoot: string; errors: Array<{ file?: string; issueId?: string; message: string }>; warnings: unknown[] }>(stdout.text());

      expect(exitCode).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.command).toBe('validate');
      expect(output.vaultRoot).toBe(context.vaultRoot);
      expect(output.errors.some(error => error.issueId === 'VC-002')).toBe(true);
      expect(output.warnings).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns usage exit code 2 when the issue id is missing', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runValidateCommand(context, { issueId: 'NO-404' });

      expect(exitCode).toBe(2);
      expect(stdout.text()).toContain('Issue not found: NO-404');
    } finally {
      await fixture.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run validate tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- validate.test.ts
```

Expected: FAIL because `runValidateCommand` does not exist.

- [ ] **Step 3: Implement validate command**

Create `packages/cli/src/commands/validate.ts`:

```ts
import { CliContext, CommandJsonResult, writeJson } from '../context';

export interface ValidateOptions {
  issueId?: string;
  json?: boolean;
}

interface ValidationError {
  file?: string;
  issueId?: string;
  message: string;
}

export async function runValidateCommand(context: CliContext, options: ValidateOptions): Promise<number> {
  const errors: ValidationError[] = [];

  if (options.issueId) {
    const task = await context.store.findByIssueId(options.issueId);
    if (!task) {
      errors.push({ issueId: options.issueId, message: `Issue not found: ${options.issueId}` });
      printValidateOutput(context, options, errors);
      return 2;
    }

    printValidateOutput(context, options, []);
    if (!options.json) {
      context.stdout.write(`${options.issueId} valid\n`);
    }
    return 0;
  }

  const parseErrors: ValidationError[] = [];
  const originalPolicyEngine = (context.store as unknown as { policyEngine?: { onParseError?: (error: Error, filePath: string) => void } }).policyEngine;
  (context.store as unknown as { policyEngine?: { onParseError?: (error: Error, filePath: string) => void } }).policyEngine = {
    ...originalPolicyEngine,
    onParseError(error: Error, filePath: string) {
      parseErrors.push({ file: filePath, issueId: inferIssueId(filePath), message: sanitizeError(error) });
      originalPolicyEngine?.onParseError?.(error, filePath);
    },
  };

  const tasks = await context.store.listTasks();
  errors.push(...parseErrors);

  printValidateOutput(context, options, errors);
  if (!options.json && errors.length === 0) {
    context.stdout.write(`${tasks.length} issues valid\n`);
  }

  return errors.length === 0 ? 0 : 1;
}

function printValidateOutput(context: CliContext, options: ValidateOptions, errors: ValidationError[]): void {
  if (options.json) {
    const result: CommandJsonResult = {
      ok: errors.length === 0,
      command: 'validate',
      vaultRoot: context.vaultRoot,
      errors,
      warnings: [],
    };
    writeJson(context.stdout, result);
    return;
  }

  for (const error of errors) {
    const location = [error.issueId, error.file].filter(Boolean).join(' ');
    context.stdout.write(`${location}: ${error.message}\n`);
  }
}

function sanitizeError(error: Error): string {
  return error.message.split('\n')[0] ?? String(error);
}

function inferIssueId(filePath: string): string | undefined {
  const match = filePath.match(/([A-Z]+-\d+)/);
  return match?.[1];
}
```

If `MarkdownStore` does not expose parse errors in a way this command can capture without private field access, add a public callback option to the store in the vault-store implementation before this task. Do not print raw exceptions or stack traces from the CLI.

- [ ] **Step 4: Wire validate into the CLI dispatcher**

Update the `validate` command in `packages/cli/src/index.ts`:

```ts
import { runValidateCommand } from './commands/validate';
```

Replace the current validate action with:

```ts
  cli
    .command('validate [issueId]', 'Validate Markdown issues in the vault')
    .option('--json', 'Print stable JSON output')
    .action(async (issueId: string | undefined, options: { json?: boolean; vault?: string }) => {
      const context = await buildCliContext({ vault: options.vault });
      return runValidateCommand(context, { issueId, json: options.json });
    });
```

- [ ] **Step 5: Run validate tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- validate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run CLI test suite so far**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test
```

Expected: PASS for help, context, doctor, and validate tests.

- [ ] **Step 7: Commit validate command**

Run:

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/validate.ts packages/cli/tests/commands/validate.test.ts
git commit -m "feat(cli): add validate command"
```

Expected: commit succeeds with only CLI files staged.

## Task 5: Render-Board Command

**Files:**

- Create: `packages/cli/src/commands/render-board.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/tests/commands/render-board.test.ts`

- [ ] **Step 1: Write failing render-board tests**

Create `packages/cli/tests/commands/render-board.test.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildCliContext } from '../../src/context';
import { runRenderBoardCommand } from '../../src/commands/render-board';
import { CaptureStream, copyMinimalVault } from '../helpers';

describe('render-board command', () => {
  it('detects stale board output in --check mode without writing', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const boardPath = path.join(fixture.vaultRoot, 'boards', 'vibe-coding.md');
      const before = await fs.readFile(boardPath, 'utf-8');
      const exitCode = await runRenderBoardCommand(context, { check: true, space: 'vibe-coding' });
      const after = await fs.readFile(boardPath, 'utf-8');

      expect(exitCode).toBe(1);
      expect(stdout.text()).toContain('stale');
      expect(after).toBe(before);
    } finally {
      await fixture.cleanup();
    }
  });

  it('writes generated board files by default', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runRenderBoardCommand(context, { space: 'vibe-coding' });
      const board = await fs.readFile(path.join(fixture.vaultRoot, 'boards', 'vibe-coding.md'), 'utf-8');

      expect(exitCode).toBe(0);
      expect(stdout.text()).toContain('written');
      expect(board).toContain('# vibe-coding');
      expect(board).toContain('VC-001');
      expect(board).toContain('../issues/vibe-coding/kanban-task-engine/VC-001-contract-hardening.md');
    } finally {
      await fixture.cleanup();
    }
  });

  it('excludes epics from kanban cards', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      await runRenderBoardCommand(context, { space: 'vibe-coding' });
      const board = await fs.readFile(path.join(fixture.vaultRoot, 'boards', 'vibe-coding.md'), 'utf-8');

      expect(board).toContain('VC-001');
      expect(board).not.toContain('VC-010');
      expect(board).not.toContain('CLI MVP');
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns usage exit code 2 for unknown spaces', async () => {
    const fixture = await copyMinimalVault();
    const stdout = new CaptureStream();

    try {
      const context = await buildCliContext({ vault: fixture.vaultRoot, stdout });
      const exitCode = await runRenderBoardCommand(context, { space: 'missing' });

      expect(exitCode).toBe(2);
      expect(stdout.text()).toContain('Unknown space: missing');
    } finally {
      await fixture.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run render-board tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- render-board.test.ts
```

Expected: FAIL because `runRenderBoardCommand` does not exist.

- [ ] **Step 3: Implement render-board command**

Create `packages/cli/src/commands/render-board.ts`:

```ts
import fs from 'fs/promises';
import path from 'path';
import { renderBoardMarkdown, BoardIssue, CanonicalTaskModel } from '@kanban-task-engine/core';
import { CliContext } from '../context';

export interface RenderBoardOptions {
  check?: boolean;
  space?: string;
}

export async function runRenderBoardCommand(context: CliContext, options: RenderBoardOptions): Promise<number> {
  const spaces = Object.keys(context.registry.spaces);
  const selectedSpaces = options.space ? [options.space] : spaces;

  for (const space of selectedSpaces) {
    if (!context.registry.spaces[space]) {
      context.stdout.write(`Unknown space: ${space}\n`);
      return 2;
    }
  }

  const tasks = await context.store.listTasks();
  let stale = false;

  for (const space of selectedSpaces) {
    const registrySpace = context.registry.spaces[space];
    const boardPath = path.join(context.vaultRoot, registrySpace.board);
    const boardIssues = tasks
      .filter(task => belongsToSpace(task, space))
      .filter(task => task.classification.issue_type !== 'Epic')
      .map(task => toBoardIssue(context, task));

    const next = renderBoardMarkdown({
      boardTitle: space,
      generatedAt: new Date(0).toISOString(),
      issues: boardIssues,
    });

    let current = '';
    try {
      current = await fs.readFile(boardPath, 'utf-8');
    } catch {
      current = '';
    }

    if (options.check) {
      if (current !== next) {
        stale = true;
        context.stdout.write(`${path.relative(context.vaultRoot, boardPath)} stale\n`);
      } else {
        context.stdout.write(`${path.relative(context.vaultRoot, boardPath)} current\n`);
      }
      continue;
    }

    await fs.mkdir(path.dirname(boardPath), { recursive: true });
    await fs.writeFile(boardPath, next, 'utf-8');
    context.stdout.write(`${path.relative(context.vaultRoot, boardPath)} written\n`);
  }

  return options.check && stale ? 1 : 0;
}

function belongsToSpace(task: CanonicalTaskModel, space: string): boolean {
  const key = task.task_ref.external_key;
  return key === space || key.startsWith(`${space}/`) || task.automation.workspace === space;
}

function toBoardIssue(context: CliContext, task: CanonicalTaskModel): BoardIssue {
  const filePath = context.resolver.resolveIssuePath(task.task_ref);
  return {
    id: task.task_ref.external_id,
    title: task.summary,
    status: task.workflow.normalized_status,
    priority: task.classification.priority,
    project: task.automation.workspace ?? task.task_ref.external_key,
    path: path.relative(context.vaultRoot, filePath),
  };
}
```

If `WorkspaceResolver.resolveIssuePath(task.task_ref)` does not exist, use the resolver path API introduced by the vault-store plan. Do not add a second path resolver inside the CLI.

- [ ] **Step 4: Wire render-board into the CLI dispatcher**

Update `packages/cli/src/index.ts`:

```ts
import { runRenderBoardCommand } from './commands/render-board';
```

Replace the current render-board action with:

```ts
  cli
    .command('render-board', 'Generate Markdown board files from vault issues')
    .option('--check', 'Do not write files; exit nonzero when generated output differs')
    .option('--space <space>', 'Render only one registry space')
    .action(async (options: { check?: boolean; space?: string; vault?: string }) => {
      const context = await buildCliContext({ vault: options.vault });
      return runRenderBoardCommand(context, { check: options.check, space: options.space });
    });
```

- [ ] **Step 5: Run render-board tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- render-board.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all CLI tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test
```

Expected: PASS.

- [ ] **Step 7: Commit render-board command**

Run:

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/render-board.ts packages/cli/tests/commands/render-board.test.ts
git commit -m "feat(cli): add render-board command"
```

Expected: commit succeeds with only CLI files staged.

## Task 6: CLI Exit Codes, Usage Errors, and Spawn Smoke Tests

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/bin.ts`
- Create: `packages/cli/tests/cli-smoke.test.ts`

- [ ] **Step 1: Write failing spawn-level smoke tests**

Create `packages/cli/tests/cli-smoke.test.ts`:

```ts
import { execaNode } from 'execa';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { copyMinimalVault } from './helpers';

const binPath = path.join(__dirname, '..', 'src', 'bin.ts');

describe('kanban binary smoke tests', () => {
  it('prints help with only MVP commands', async () => {
    const result = await execaNode(binPath, ['--help'], { reject: false, nodeOptions: ['--loader', 'tsx/esm'] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).toContain('validate');
    expect(result.stdout).toContain('render-board');
    expect(result.stdout).not.toContain(' run');
    expect(result.stdout).not.toContain(' approve');
  });

  it('returns exit code 0 for doctor --json on a valid vault', async () => {
    const fixture = await copyMinimalVault();
    try {
      const result = await execaNode(binPath, ['--vault', fixture.vaultRoot, 'doctor', '--json'], {
        reject: false,
        nodeOptions: ['--loader', 'tsx/esm'],
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).command).toBe('doctor');
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns exit code 1 when validate finds invalid issue fixtures', async () => {
    const fixture = await copyMinimalVault();
    try {
      const result = await execaNode(binPath, ['--vault', fixture.vaultRoot, 'validate'], {
        reject: false,
        nodeOptions: ['--loader', 'tsx/esm'],
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('VC-002');
    } finally {
      await fixture.cleanup();
    }
  });
});
```

Add `execa` to `packages/cli/package.json` dev dependencies:

```json
"execa": "^8.0.1"
```

- [ ] **Step 2: Run smoke tests to verify failure**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- cli-smoke.test.ts
```

Expected: FAIL if the binary does not propagate returned exit codes or if `execa` is not installed yet.

- [ ] **Step 3: Make CLI usage errors return exit code 2**

Update `runCli()` in `packages/cli/src/index.ts`:

```ts
export async function runCli(options: RunCliOptions = {}): Promise<number> {
  const cli = createKanbanCli();

  try {
    cli.parse(options.argv ?? process.argv, { run: false });
    const result = await cli.runMatchedCommand();
    return typeof result === 'number' ? result : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
```

Update `packages/cli/src/bin.ts` so unhandled internal errors remain exit code 1:

```ts
#!/usr/bin/env node
import { runCli } from './index';

runCli()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
```

- [ ] **Step 4: Run smoke tests**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- cli-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build the CLI package**

Run:

```bash
pnpm --filter @kanban-task-engine/cli build
```

Expected: PASS.

- [ ] **Step 6: Commit exit-code and smoke-test coverage**

Run:

```bash
git add packages/cli/package.json packages/cli/src/index.ts packages/cli/src/bin.ts packages/cli/tests/cli-smoke.test.ts
git commit -m "test(cli): cover binary help and exit codes"
```

Expected: commit succeeds with only CLI files staged.

## Task 7: Full Workspace Verification

**Files:**

- Test: `packages/cli/**`
- Modify: `packages/cli/**` only for diagnostics from the verification commands in this task.

- [ ] **Step 1: Run focused CLI verification**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test
pnpm --filter @kanban-task-engine/cli build
```

Expected: both commands pass.

- [ ] **Step 2: Run full workspace verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands pass.

- [ ] **Step 3: Verify user-facing command scope**

Run:

```bash
node packages/cli/dist/bin.js --help
```

Expected: help lists `doctor`, `validate`, and `render-board`; it does not list `init`, `run`, `approve`, `abort`, `retry`, git, worktree, merge, Jira, GitHub, Firebase, OpenClaw, or Claude execution commands.

- [ ] **Step 4: Inspect final diff scope**

Run:

```bash
git status --short
git diff --name-only HEAD
```

Expected: only CLI package files and optional workspace discovery metadata appear. No files under `packages/adapter-cli/**` or external adapter packages should be modified.

- [ ] **Step 5: Commit verification fixes if any were needed**

If Step 1 or Step 2 required a CLI-only fix, run:

```bash
git add packages/cli
git commit -m "fix(cli): pass workspace verification"
```

Expected: commit succeeds with only CLI files staged. If no fixes were needed, skip this commit.

## Self-Review Checklist

- [ ] Spec package layout is covered by Tasks 1-2: `packages/cli/package.json`, `tsconfig.json`, `src/bin.ts`, `src/index.ts`, `src/context.ts`, command files, command tests, context tests, and fixture vault are all created.
- [ ] Binary name `kanban` and package name `@kanban-task-engine/cli` are covered in Task 1.
- [ ] Shared CLI context resolution is covered in Task 2: `--vault`, `KANBAN_HOME`, default `<OPENCLAW_HOME>/workspace-kanban/kanban`, tilde expansion, relative path resolution, missing-vault errors, registry path, resolver, store, stdout, and stderr.
- [ ] `kanban doctor` is covered in Task 3: Node, pnpm, git, vault root, `registry.yaml`, `issues/`, `boards/`, `events/`, `runtime/`, optional `claude`, human table, JSON output, exit code 0/1.
- [ ] `kanban validate` is covered in Task 4: all-issue validation through `MarkdownStore.listTasks()`, single issue validation through `findByIssueId()`, file path and issue id reporting, continued validation after parse errors, no raw parser stacks, JSON output, exit codes 0/1/2.
- [ ] `kanban render-board` is covered in Task 5: registry and issue reads, default writes, `--check`, `--space`, stale detection, Epic exclusion, relative links, and exit codes 0/1/2.
- [ ] JSON output contract is covered in Tasks 3-4 with `CommandJsonResult` fields `ok`, `command`, `vaultRoot`, `errors`, and `warnings`.
- [ ] Help smoke testing is covered in Tasks 1 and 6, and confirms only inspection, validation, and board-rendering commands are listed.
- [ ] Full workspace verification is covered in Task 7 with `pnpm --filter @kanban-task-engine/cli test`, `pnpm --filter @kanban-task-engine/cli build`, root `pnpm test`, and root `pnpm build`.
- [ ] Out-of-scope exclusions are preserved: no status transitions, execution commands, git merge/worktree behavior, external adapter calls, Jira/GitHub/Firebase network calls, OpenClaw execution, or Claude execution.
