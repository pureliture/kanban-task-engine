import os from 'os';
import path from 'path';

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function resolveKanbanHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.KANBAN_HOME && env.KANBAN_HOME.trim() !== ''
    ? env.KANBAN_HOME
    : '~/.openclaw/workspace-kanban/kanban';
  return path.resolve(expandHome(configured));
}

export function getAllowedIssueBasePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveKanbanHome(env), 'issues');
}
