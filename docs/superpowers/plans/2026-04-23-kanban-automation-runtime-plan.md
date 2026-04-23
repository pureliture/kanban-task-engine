# Kanban Automation Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the composable module runtime, recipe/policy loader, and Home execution modules needed for explicit issue execution.

**Architecture:** Modules declare their inputs, outputs, side effects, and policy requirements. Recipes select and order modules. Home execution starts from an explicit command, transitions issues through policy gates, invokes OpenClaw or Claude Code adapters, writes an execution log, records events, and optionally checkpoints the vault git repo.

**Tech Stack:** TypeScript, Vitest, Node `fs/promises`, `child_process`, existing `EventBus`, `StateMachine`, `FileWatcher`, `CliAdapter`, `OpenClawAdapter`.

---

## File Structure

- Create: `packages/core/src/runtime/module.ts` - module contracts.
- Create: `packages/core/src/runtime/module-runner.ts` - sequential runner with policy gates.
- Create: `packages/core/src/runtime/policy.ts` - policy contract and side-effect checks.
- Create: `packages/core/src/recipes/recipe-loader.ts` - load default and operator recipe YAML.
- Create: `packages/core/src/modules/manual-command-trigger.ts` - explicit run command parser.
- Create: `packages/core/src/modules/state-transition-module.ts` - safe issue transition.
- Create: `packages/core/src/modules/audit-log-module.ts` - JSONL event writer.
- Create: `packages/core/src/modules/git-checkpoint-module.ts` - vault commit module.
- Create: `packages/adapter-claude-code/package.json` - standalone Claude Code adapter package.
- Create: `packages/adapter-claude-code/tsconfig.json` - TypeScript config.
- Create: `packages/adapter-claude-code/src/claude-code-adapter.ts` - Claude Code adapter wrapper.
- Create: `packages/adapter-claude-code/src/index.ts` - package exports.
- Modify: `packages/adapter-openclaw/src/openclaw-adapter.ts` - align with core `ExecutionAdapter`.
- Create: `recipes/home-assisted.yaml`
- Create: `recipes/home-full-auto.yaml`
- Create: `recipes/validate-only.yaml`
- Create: `packages/core/tests/module-runner.test.ts`
- Create: `packages/core/tests/recipe-loader.test.ts`
- Create: `packages/core/tests/home-execution-flow.test.ts`
- Create: `packages/adapter-claude-code/tests/claude-code-adapter.test.ts`

### Task 1: Define Module Runtime Contracts

**Files:**
- Create: `packages/core/src/runtime/module.ts`
- Create: `packages/core/src/runtime/policy.ts`
- Create: `packages/core/tests/module-runner.test.ts`

- [x] **Step 1: Write failing module runner tests**

Create `packages/core/tests/module-runner.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ModuleRunner } from '../src/runtime/module-runner';
import { AutomationModule } from '../src/runtime/module';

describe('ModuleRunner', () => {
  it('runs modules in order and passes context forward', async () => {
    const first: AutomationModule = {
      name: 'first',
      sideEffects: [],
      run: vi.fn(async ctx => ({ ...ctx, values: { ...ctx.values, first: true } })),
    };
    const second: AutomationModule = {
      name: 'second',
      sideEffects: [],
      run: vi.fn(async ctx => ({ ...ctx, values: { ...ctx.values, second: ctx.values.first } })),
    };

    const result = await new ModuleRunner([first, second]).run({ values: {}, policy: { allowedSideEffects: [] } });
    expect(result.values).toEqual({ first: true, second: true });
  });

  it('blocks disallowed side effects', async () => {
    const module: AutomationModule = {
      name: 'writer',
      sideEffects: ['writeIssue'],
      run: vi.fn(async ctx => ctx),
    };

    await expect(new ModuleRunner([module]).run({ values: {}, policy: { allowedSideEffects: [] } }))
      .rejects.toThrow('Module writer requires disallowed side effect: writeIssue');
  });
});
```

- [x] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/module-runner.test.ts
```

Expected: FAIL because runtime files do not exist.

- [x] **Step 3: Implement policy and module contracts**

Create `packages/core/src/runtime/policy.ts`:

```typescript
export type ModuleSideEffect =
  | 'readIssue'
  | 'writeIssue'
  | 'startExecution'
  | 'writeEvent'
  | 'gitCommit'
  | 'externalRequest';

export interface RuntimePolicy {
  allowedSideEffects: ModuleSideEffect[];
}

export function assertSideEffectsAllowed(moduleName: string, required: ModuleSideEffect[], policy: RuntimePolicy): void {
  for (const sideEffect of required) {
    if (!policy.allowedSideEffects.includes(sideEffect)) {
      throw new Error(`Module ${moduleName} requires disallowed side effect: ${sideEffect}`);
    }
  }
}
```

Create `packages/core/src/runtime/module.ts`:

```typescript
import { RuntimePolicy, ModuleSideEffect } from './policy';

export interface ModuleContext {
  values: Record<string, unknown>;
  policy: RuntimePolicy;
}

export interface AutomationModule {
  name: string;
  sideEffects: ModuleSideEffect[];
  run(context: ModuleContext): Promise<ModuleContext>;
}
```

- [x] **Step 4: Implement module runner**

Create `packages/core/src/runtime/module-runner.ts`:

```typescript
import { AutomationModule, ModuleContext } from './module';
import { assertSideEffectsAllowed } from './policy';

export class ModuleRunner {
  constructor(private modules: AutomationModule[]) {}

  async run(initialContext: ModuleContext): Promise<ModuleContext> {
    let context = initialContext;
    for (const module of this.modules) {
      assertSideEffectsAllowed(module.name, module.sideEffects, context.policy);
      context = await module.run(context);
    }
    return context;
  }
}
```

- [x] **Step 5: Export runtime APIs**

Add to `packages/core/src/index.ts`:

```typescript
export { ModuleRunner } from './runtime/module-runner';
export type { AutomationModule, ModuleContext } from './runtime/module';
export type { RuntimePolicy, ModuleSideEffect } from './runtime/policy';
```

- [x] **Step 6: Run module tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/module-runner.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit runtime contracts**

Run:

```bash
git add packages/core/src/runtime packages/core/src/index.ts packages/core/tests/module-runner.test.ts
git commit --no-gpg-sign -m "feat: add automation module runtime contracts" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 2: Add Recipe Loader

**Files:**
- Create: `packages/core/src/recipes/recipe-loader.ts`
- Create: `packages/core/tests/recipe-loader.test.ts`
- Create: `recipes/home-assisted.yaml`
- Create: `recipes/home-full-auto.yaml`
- Create: `recipes/validate-only.yaml`

- [x] **Step 1: Write default recipe files**

Create `recipes/home-assisted.yaml`:

```yaml
mode: home-assisted
vaultPath: ~/.openclaw/workspace-kanban/kanban
modules:
  - manual-command-trigger
  - state-transition
  - claude-code-executor
  - audit-log
  - git-checkpoint
policy:
  allowedSideEffects:
    - readIssue
    - writeIssue
    - startExecution
    - writeEvent
    - gitCommit
```

Create `recipes/home-full-auto.yaml`:

```yaml
mode: home-full-auto
vaultPath: ~/.openclaw/workspace-kanban/kanban
modules:
  - watcher
  - state-transition
  - openclaw-executor
  - audit-log
  - git-checkpoint
policy:
  allowedSideEffects:
    - readIssue
    - writeIssue
    - startExecution
    - writeEvent
    - gitCommit
    - externalRequest
```

Create `recipes/validate-only.yaml`:

```yaml
mode: validate-only
modules:
  - parser
  - validator
policy:
  allowedSideEffects:
    - readIssue
```

- [x] **Step 2: Write failing recipe loader tests**

Create `packages/core/tests/recipe-loader.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseRecipeYaml } from '../src/recipes/recipe-loader';

describe('recipe loader', () => {
  it('parses a valid recipe', () => {
    const recipe = parseRecipeYaml(`
mode: validate-only
modules:
  - parser
policy:
  allowedSideEffects:
    - readIssue
`);
    expect(recipe.mode).toBe('validate-only');
    expect(recipe.modules).toEqual(['parser']);
    expect(recipe.policy.allowedSideEffects).toEqual(['readIssue']);
  });

  it('rejects recipe without mode', () => {
    expect(() => parseRecipeYaml('modules: []')).toThrow('Recipe mode is required');
  });
});
```

- [x] **Step 3: Run failing test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/recipe-loader.test.ts
```

Expected: FAIL because `recipe-loader` is missing.

- [x] **Step 4: Implement recipe loader**

Create `packages/core/src/recipes/recipe-loader.ts`:

```typescript
import YAML from 'yaml';
import { RuntimePolicy } from '../runtime/policy';

export interface AutomationRecipe {
  mode: string;
  vaultPath?: string;
  modules: string[];
  policy: RuntimePolicy;
}

export function parseRecipeYaml(content: string): AutomationRecipe {
  const parsed = YAML.parse(content) as Partial<AutomationRecipe> | null;
  if (!parsed || typeof parsed.mode !== 'string' || parsed.mode.trim() === '') {
    throw new Error('Recipe mode is required');
  }
  if (!Array.isArray(parsed.modules)) {
    throw new Error('Recipe modules must be an array');
  }
  if (!parsed.policy || !Array.isArray(parsed.policy.allowedSideEffects)) {
    throw new Error('Recipe policy.allowedSideEffects must be an array');
  }
  return parsed as AutomationRecipe;
}
```

- [x] **Step 5: Export recipe loader**

Add to `packages/core/src/index.ts`:

```typescript
export type { AutomationRecipe } from './recipes/recipe-loader';
export { parseRecipeYaml } from './recipes/recipe-loader';
```

- [x] **Step 6: Run recipe tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/recipe-loader.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit recipes**

Run:

```bash
git add recipes packages/core/src/recipes packages/core/src/index.ts packages/core/tests/recipe-loader.test.ts
git commit --no-gpg-sign -m "feat: load automation recipes" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 3: Add Manual Command and Transition Modules

**Files:**
- Create: `packages/core/src/modules/manual-command-trigger.ts`
- Create: `packages/core/src/modules/state-transition-module.ts`
- Create: `packages/core/tests/home-execution-flow.test.ts`

- [x] **Step 1: Write failing Home flow test**

Create `packages/core/tests/home-execution-flow.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createManualCommandTrigger } from '../src/modules/manual-command-trigger';
import { createStateTransitionModule } from '../src/modules/state-transition-module';
import { ModuleRunner } from '../src/runtime/module-runner';

describe('home execution flow modules', () => {
  it('turns explicit run command into RUNNING transition request', async () => {
    const runner = new ModuleRunner([
      createManualCommandTrigger(),
      createStateTransitionModule(),
    ]);

    const result = await runner.run({
      values: {
        command: 'run issue-auth-refresh-001',
        issue: {
          task_ref: { provider: 'local', external_key: 'auth-platform', external_id: 'issue-auth-refresh-001' },
          workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
          summary: '토큰 갱신 플로우 개선',
          classification: { issue_type: 'Story', priority: 'High', labels: [], component: [] },
          ownership: { assignee: '', reporter: '' },
          planning: {},
          automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
          sync: { last_synced_at: '2026-04-20', last_source: 'local' },
        },
      },
      policy: { allowedSideEffects: ['writeIssue'] },
    });

    expect((result.values.issue as any).workflow.normalized_status).toBe('RUNNING');
  });
});
```

- [x] **Step 2: Run failing Home flow test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/home-execution-flow.test.ts
```

Expected: FAIL because module files are missing.

- [x] **Step 3: Implement manual command trigger**

Create `packages/core/src/modules/manual-command-trigger.ts`:

```typescript
import { AutomationModule } from '../runtime/module';

export function createManualCommandTrigger(): AutomationModule {
  return {
    name: 'manual-command-trigger',
    sideEffects: [],
    async run(context) {
      const command = String(context.values.command ?? '');
      const match = command.match(/^run\s+(.+)$/i);
      if (!match) return context;
      return {
        ...context,
        values: {
          ...context.values,
          requestedIssueId: match[1],
          requestedStatus: 'RUNNING',
        },
      };
    },
  };
}
```

- [x] **Step 4: Implement state transition module**

Create `packages/core/src/modules/state-transition-module.ts`:

```typescript
import { CanonicalTaskModel, NormalizedStatus } from '../types';
import { StateMachine } from '../state-machine';
import { AutomationModule } from '../runtime/module';

export function createStateTransitionModule(stateMachine = new StateMachine()): AutomationModule {
  return {
    name: 'state-transition',
    sideEffects: ['writeIssue'],
    async run(context) {
      const issue = context.values.issue as CanonicalTaskModel | undefined;
      const requestedStatus = context.values.requestedStatus as NormalizedStatus | undefined;
      if (!issue || !requestedStatus) return context;
      const updated = stateMachine.transition(issue, requestedStatus);
      return { ...context, values: { ...context.values, issue: updated } };
    },
  };
}
```

- [x] **Step 5: Export modules**

Add to `packages/core/src/index.ts`:

```typescript
export { createManualCommandTrigger } from './modules/manual-command-trigger';
export { createStateTransitionModule } from './modules/state-transition-module';
```

- [x] **Step 6: Run Home flow test**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/home-execution-flow.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit command and transition modules**

Run:

```bash
git add packages/core/src/modules packages/core/src/index.ts packages/core/tests/home-execution-flow.test.ts
git commit --no-gpg-sign -m "feat: add manual run transition modules" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 4: Add Audit Log and Git Checkpoint Modules

**Files:**
- Create: `packages/core/src/modules/audit-log-module.ts`
- Create: `packages/core/src/modules/git-checkpoint-module.ts`
- Create: `packages/core/tests/audit-log-module.test.ts`
- Create: `packages/core/tests/git-checkpoint-module.test.ts`

- [x] **Step 1: Write failing audit log test**

Create `packages/core/tests/audit-log-module.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createAuditLogModule } from '../src/modules/audit-log-module';

describe('audit log module', () => {
  it('writes one JSONL event', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-events-'));
    const module = createAuditLogModule(path.join(dir, 'events.jsonl'));
    await module.run({
      values: { event: { type: 'issue.transitioned', issueId: 'issue-1' } },
      policy: { allowedSideEffects: ['writeEvent'] },
    });
    const content = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf-8');
    expect(content).toContain('"type":"issue.transitioned"');
  });
});
```

- [x] **Step 2: Implement audit log module**

Create `packages/core/src/modules/audit-log-module.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { AutomationModule } from '../runtime/module';

export function createAuditLogModule(filePath: string): AutomationModule {
  return {
    name: 'audit-log',
    sideEffects: ['writeEvent'],
    async run(context) {
      const event = context.values.event;
      if (!event) return context;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`);
      return context;
    },
  };
}
```

- [x] **Step 3: Write failing git checkpoint test**

Create `packages/core/tests/git-checkpoint-module.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createGitCheckpointModule } from '../src/modules/git-checkpoint-module';

describe('git checkpoint module', () => {
  it('builds non-interactive git commands', async () => {
    const commands: string[][] = [];
    const module = createGitCheckpointModule('/vault', 'checkpoint', async command => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '' };
    });
    await module.run({ values: {}, policy: { allowedSideEffects: ['gitCommit'] } });
    expect(commands).toEqual([
      ['git', '-C', '/vault', 'add', '-A'],
      ['git', '-C', '/vault', 'commit', '--no-gpg-sign', '-m', 'checkpoint'],
    ]);
  });
});
```

- [x] **Step 4: Implement git checkpoint module**

Create `packages/core/src/modules/git-checkpoint-module.ts`:

```typescript
import { spawn } from 'child_process';
import { AutomationModule } from '../runtime/module';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string[]) => Promise<CommandResult>;

const defaultRunner: CommandRunner = command => new Promise(resolve => {
  const child = spawn(command[0], command.slice(1), { stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', data => { stdout += data.toString(); });
  child.stderr?.on('data', data => { stderr += data.toString(); });
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

export function createGitCheckpointModule(vaultPath: string, message: string, runner: CommandRunner = defaultRunner): AutomationModule {
  return {
    name: 'git-checkpoint',
    sideEffects: ['gitCommit'],
    async run(context) {
      await runner(['git', '-C', vaultPath, 'add', '-A']);
      const result = await runner(['git', '-C', vaultPath, 'commit', '--no-gpg-sign', '-m', message]);
      if (result.code !== 0 && !result.stdout.includes('nothing to commit') && !result.stderr.includes('nothing to commit')) {
        throw new Error(result.stderr || result.stdout || `git commit failed with code ${result.code}`);
      }
      return context;
    },
  };
}
```

- [x] **Step 5: Export and run tests**

Add to `packages/core/src/index.ts`:

```typescript
export { createAuditLogModule } from './modules/audit-log-module';
export { createGitCheckpointModule } from './modules/git-checkpoint-module';
```

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/audit-log-module.test.ts tests/git-checkpoint-module.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit audit and checkpoint modules**

Run:

```bash
git add packages/core/src/modules packages/core/src/index.ts packages/core/tests/audit-log-module.test.ts packages/core/tests/git-checkpoint-module.test.ts
git commit --no-gpg-sign -m "feat: add audit and checkpoint modules" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 5: Add Claude Code Adapter Package

**Files:**
- Create: `packages/adapter-claude-code/package.json`
- Create: `packages/adapter-claude-code/tsconfig.json`
- Create: `packages/adapter-claude-code/src/claude-code-adapter.ts`
- Create: `packages/adapter-claude-code/src/index.ts`
- Create: `packages/adapter-claude-code/tests/claude-code-adapter.test.ts`

- [x] **Step 1: Write package files**

Create `packages/adapter-claude-code/package.json`:

```json
{
  "name": "@kanban-task-engine/adapter-claude-code",
  "version": "0.1.0",
  "description": "Claude Code execution adapter for kanban-task-engine",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@kanban-task-engine/adapter-cli": "workspace:*",
    "@kanban-task-engine/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

Create `packages/adapter-claude-code/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [x] **Step 2: Write failing adapter test**

Create `packages/adapter-claude-code/tests/claude-code-adapter.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createClaudeCodeAdapterConfig } from '../src/claude-code-adapter';

describe('Claude Code adapter config', () => {
  it('builds claude command config with cwd', () => {
    const config = createClaudeCodeAdapterConfig('/repo');
    expect(config.command).toBe('claude');
    expect(config.args).toEqual(['--print']);
    expect(config.cwd).toBe('/repo');
  });
});
```

- [x] **Step 3: Run failing test**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-claude-code test -- tests/claude-code-adapter.test.ts
```

Expected: FAIL because module is missing.

- [x] **Step 4: Implement adapter config**

Create `packages/adapter-claude-code/src/claude-code-adapter.ts`:

```typescript
import { CliAdapter, CliAdapterConfig } from '@kanban-task-engine/adapter-cli';

export function createClaudeCodeAdapterConfig(cwd: string): CliAdapterConfig {
  return {
    command: 'claude',
    args: ['--print'],
    cwd,
    timeout: 30 * 60 * 1000,
  };
}

export function createClaudeCodeAdapter(cwd: string): CliAdapter {
  return new CliAdapter(createClaudeCodeAdapterConfig(cwd));
}
```

- [x] **Step 5: Export adapter**

Create `packages/adapter-claude-code/src/index.ts`:

```typescript
export { createClaudeCodeAdapter, createClaudeCodeAdapterConfig } from './claude-code-adapter';
```

- [x] **Step 6: Run adapter tests**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-claude-code test -- tests/claude-code-adapter.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Claude Code adapter**

Run:

```bash
git add packages/adapter-claude-code pnpm-lock.yaml
git commit --no-gpg-sign -m "feat: add claude code cli adapter" -m "Co-Authored-By: OpenClaw <openclaw@local>"
```

Expected: commit succeeds.

### Task 6: Runtime Verification

**Files:**
- Read: all changed runtime, module, recipe, adapter files.

- [x] **Step 1: Run core runtime tests**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/module-runner.test.ts tests/recipe-loader.test.ts tests/home-execution-flow.test.ts tests/audit-log-module.test.ts tests/git-checkpoint-module.test.ts
```

Expected: PASS.

- [x] **Step 2: Run CLI adapter tests**

Run:

```bash
pnpm --filter @kanban-task-engine/adapter-cli test
pnpm --filter @kanban-task-engine/adapter-claude-code test
```

Expected: PASS.

- [x] **Step 3: Build changed packages**

Run:

```bash
pnpm --filter @kanban-task-engine/core build
pnpm --filter @kanban-task-engine/adapter-cli build
pnpm --filter @kanban-task-engine/adapter-claude-code build
```

Expected: PASS.

- [x] **Step 4: Verify clean state**

Run:

```bash
git status --short
```

Expected: no output. If generated `dist/` files appear and are tracked in this repo, include them in the last relevant commit; otherwise keep build output ignored.
