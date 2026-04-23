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
