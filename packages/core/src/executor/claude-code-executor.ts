import { adaptClaudeRunnerToAgent, AgentRunResult, AgentRunner, LegacyClaudeRunner } from './agent-runner.js';
import { spawnAgentProcess } from './agent-process.js';
import { GitRunner } from './git.js';
import { runIssueWithAgent } from './run-issue.js';

export type ClaudeRunResult = AgentRunResult;

export interface ClaudeRunner extends LegacyClaudeRunner {
  run(promptPath: string, cwd: string): Promise<ClaudeRunResult>;
}

export interface ClaudeCliRunnerOptions {
  executable?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunIssueWithClaudeInput {
  vaultRoot: string;
  issuePath: string;
  issueId: string;
  workingDir: string;
  git: GitRunner;
  claude: ClaudeRunner;
  now?: Date;
  baseRef?: string;
  fetch?: boolean;
  staleLockMs?: number;
}

export interface RunIssueWithClaudeResult {
  issueId: string;
  outcome: 'REVIEW' | 'FAILED';
  runNumber: number;
  logPath: string;
  metadataPath: string;
  worktreePath: string;
}

export async function runIssueWithClaude(input: RunIssueWithClaudeInput): Promise<RunIssueWithClaudeResult> {
  return runIssueWithAgent({
    vaultRoot: input.vaultRoot,
    issuePath: input.issuePath,
    issueId: input.issueId,
    workingDir: input.workingDir,
    git: input.git,
    agent: adaptClaudeRunnerToAgent(input.claude),
    now: input.now,
    baseRef: input.baseRef,
    fetch: input.fetch,
    staleLockMs: input.staleLockMs,
  });
}

export function createClaudeCliRunner(options: ClaudeCliRunnerOptions = {}): ClaudeRunner {
  const executable = options.executable ?? 'claude';
  return {
    run(promptPath, cwd) {
      return spawnAgentProcess({
        executable,
        args: ['-p', `@${promptPath}`],
        cwd,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        env: process.env,
      });
    },
  };
}

export function createClaudeAgentRunner(options: ClaudeCliRunnerOptions = {}): AgentRunner {
  return adaptClaudeRunnerToAgent(createClaudeCliRunner(options));
}
