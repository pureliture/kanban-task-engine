import { CliAdapter, CliAdapterConfig } from '@kanban-task-engine/adapter-cli';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function createClaudeCodeAdapterConfig(cwd: string): CliAdapterConfig {
  return {
    command: 'claude',
    args: ['--print'],
    cwd,
    timeout: DEFAULT_TIMEOUT_MS,
  };
}

export function createClaudeCodeAdapter(cwd: string): CliAdapter {
  return new CliAdapter(createClaudeCodeAdapterConfig(cwd));
}
