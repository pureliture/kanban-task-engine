import {
  adaptClaudeRunnerToAgent,
  createClaudeCliRunner,
  createCodexCliRunner,
  createNodeGitRunner,
  resolveExecutionTarget,
  runIssueWithAgent,
  type AgentBackend,
  type AgentRunner,
  type GitRunner,
} from '@kanban-task-engine/core/executor';
import { assertAdapterAllowed } from '@kanban-task-engine/core';
import { fail, ok, requireIssueId, type CliHandler, type CliResult } from '../index.js';
import { findIssueById } from '../vault.js';
import { loadActiveRecipePolicy } from '../policy.js';
import { formatCleanupGuidanceLines } from './cleanup-guidance.js';

export type CliAgentBackend = Exclude<AgentBackend, 'mock'>;

export type RunMode =
  | { kind: 'inspect'; issueId: string }
  | { kind: 'execute'; issueId: string; backend: AgentBackend; cliAgent?: CliAgentBackend; mockFail: boolean };

export type ParseRunArgsResult =
  | { ok: true; mode: RunMode }
  | { ok: false; message: string };

export type ResolveRunBackendResult =
  | { ok: true; backend: AgentBackend }
  | { ok: false; message: string };

export const commandRun: CliHandler = async (args, context) => {
  const parsed = parseRunArgs(args);
  if (!parsed.ok) return fail(parsed.message);
  const { mode } = parsed;

  if (!context.vaultRoot) {
    return fail('KANBAN_HOME is not configured');
  }

  const issue = await findIssueById(context.vaultRoot, mode.issueId);
  if (!issue) {
    return fail(`Issue not found: ${mode.issueId}`);
  }
  if (issue.status !== 'READY') {
    return fail(`Issue ${mode.issueId} is ${issue.status}; only READY issues can be run`);
  }

  const displayWorkingDir = issue.workingDir ?? `~/Projects/${issue.project || issue.space}`;
  if (mode.kind === 'execute') {
    const backendResult = resolveExecuteBackend(mode, issue);
    if (!backendResult.ok) return fail(backendResult.message);

    const policy = await loadActiveRecipePolicy(context);
    try {
      assertAdapterAllowed(policy, adapterIdForBackend(backendResult.backend), 'execute');
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const git = backendResult.backend === 'mock' ? createMockGitRunner() : createNodeGitRunner();
    let target;
    try {
      target = await resolveExecutionTarget(git, issue);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const result = await runIssueWithAgent({
      vaultRoot: context.vaultRoot,
      issuePath: issue.path,
      issueId: mode.issueId,
      workingDir: target.workingDir,
      baseRef: target.baseRef,
      git,
      agent: createAgentRunner(backendResult.backend, mode.mockFail),
    });

    const output = [
      `issue: ${result.issueId}`,
      `outcome: ${result.outcome}`,
      `runNumber: ${result.runNumber}`,
      `log: ${result.logPath}`,
      `metadata: ${result.metadataPath}`,
    ];
    if (result.outcome === 'FAILED') {
      output.push(...formatCleanupGuidanceLines({
        issue,
        worktreePath: result.worktreePath,
        artifactPath: result.logPath,
      }));
    }

    return ok(output.join('\n'));
  }

  return ok([
    `issue: ${issue.id}`,
    `title: ${issue.title}`,
    `status: ${issue.status}`,
    `working_dir: ${displayWorkingDir}`,
    `merge_into: ${issue.mergeInto ?? '<default>'}`,
  ].join('\n'));
};

export function parseRunArgs(args: string[]): ParseRunArgsResult {
  const positional: string[] = [];
  let execute = false;
  let mockExecutor = false;
  let mockFail = false;
  let agent: CliAgentBackend | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--mock-executor') {
      mockExecutor = true;
      continue;
    }
    if (arg === '--mock-fail') {
      mockFail = true;
      continue;
    }
    if (arg === '--agent') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        return { ok: false, message: '--agent requires a backend value' };
      }
      if (!isAgentFlagBackend(value)) {
        return { ok: false, message: `Unknown agent backend: ${value}` };
      }
      agent = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      return { ok: false, message: `Unknown option: ${arg}` };
    }
    positional.push(arg);
  }

  const issueId = parseIssueId(positional);
  if (typeof issueId !== 'string') return issueId;

  if (positional.length > 1) {
    return { ok: false, message: `Unexpected argument: ${positional[1]}` };
  }
  if (execute && mockExecutor) {
    return { ok: false, message: '--execute cannot be combined with --mock-executor' };
  }
  if (agent && !execute) {
    return { ok: false, message: '--agent requires --execute' };
  }
  if (mockFail && !mockExecutor) {
    return { ok: false, message: '--mock-fail requires --mock-executor' };
  }

  if (!execute && !mockExecutor) {
    return { ok: true, mode: { kind: 'inspect', issueId } };
  }

  return {
    ok: true,
    mode: {
      kind: 'execute',
      issueId,
      backend: mockExecutor ? 'mock' : agent ?? 'claude-code',
      cliAgent: agent,
      mockFail,
    },
  };
}

export function resolveExecuteBackend(
  mode: Extract<RunMode, { kind: 'execute' }>,
  issue: { executor?: string },
): ResolveRunBackendResult {
  if (mode.backend === 'mock') {
    return { ok: true, backend: 'mock' };
  }
  return resolveRunBackend({
    cliAgent: mode.cliAgent,
    issueExecutor: issue.executor,
  });
}

export function resolveRunBackend(input: {
  cliAgent?: CliAgentBackend;
  issueExecutor?: string;
}): ResolveRunBackendResult {
  if (input.cliAgent) {
    return { ok: true, backend: input.cliAgent };
  }
  if (!input.issueExecutor) {
    return { ok: true, backend: 'claude-code' };
  }
  if (isAgentFlagBackend(input.issueExecutor)) {
    return { ok: true, backend: input.issueExecutor };
  }
  return { ok: false, message: `Unknown issue executor: ${input.issueExecutor}` };
}

function parseIssueId(positional: string[]): string | ParseRunArgsResult {
  const issueId = requireIssueId(positional, 'run');
  if (typeof issueId === 'string') return issueId;
  return cliResultToParseError(issueId);
}

function cliResultToParseError(result: CliResult): ParseRunArgsResult {
  return { ok: false, message: result.stderr.trimEnd() };
}

function isAgentFlagBackend(value: string): value is CliAgentBackend {
  return value === 'claude-code' || value === 'codex';
}

function createMockGitRunner(): GitRunner {
  let revParseCount = 0;
  return {
    async run(args) {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        revParseCount += 1;
        return { stdout: `${revParseCount === 1 ? 'mock-base' : 'mock-head'}\n`, stderr: '' };
      }
      if (args[0] === 'symbolic-ref' && args[1] === 'refs/remotes/origin/HEAD' && args[2] === '--short') {
        return { stdout: 'origin/main\n', stderr: '' };
      }
      if (args[0] === 'status' && args[1] === '--porcelain') {
        return { stdout: ' M mock-change.txt\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
}

function createMockAgentRunner(fail: boolean): AgentRunner {
  return {
    backend: 'mock',
    async run() {
      return fail
        ? { exitCode: 1, stdout: '', stderr: 'mock claude failed' }
        : { exitCode: 0, stdout: 'mock claude completed', stderr: '' };
    },
  };
}

function createAgentRunner(backend: AgentBackend, mockFail: boolean): AgentRunner {
  if (backend === 'mock') return createMockAgentRunner(mockFail);
  if (backend === 'codex') return createCodexCliRunner();
  return adaptClaudeRunnerToAgent(createClaudeCliRunner());
}

function adapterIdForBackend(backend: AgentBackend): 'claude-code' | 'codex' | 'cli' {
  if (backend === 'mock') return 'cli';
  return backend;
}
