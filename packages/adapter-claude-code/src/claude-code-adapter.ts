import { CliAdapter, CliAdapterConfig } from '@kanban-task-engine/adapter-cli';
import type { RuntimePolicy } from '@kanban-task-engine/core';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function createClaudeCodeAdapterConfig(cwd: string): CliAdapterConfig {
  return {
    command: 'claude',
    args: ['--print'],
    cwd,
    timeout: DEFAULT_TIMEOUT_MS,
  };
}

export function createClaudeCodeAdapter(cwd: string, policy: RuntimePolicy): CliAdapter {
  return new CliAdapter(createClaudeCodeAdapterConfig(cwd), policy);
}
