export type AgentBackend = 'mock' | 'claude-code' | 'codex';

export interface AgentRunInput {
  promptPath: string;
  cwd: string;
  ndjsonPath?: string;
  lastMessagePath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  command?: string[];
  ndjsonPath?: string;
  lastMessagePath?: string;
}

export interface AgentRunner {
  backend: AgentBackend;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface LegacyClaudeRunner {
  run(promptPath: string, cwd: string): Promise<AgentRunResult>;
}

export function adaptClaudeRunnerToAgent(claude: LegacyClaudeRunner): AgentRunner {
  return {
    backend: 'claude-code',
    run(input) {
      return claude.run(input.promptPath, input.cwd);
    },
  };
}
