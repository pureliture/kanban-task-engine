import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { resolveKanbanHome, getAllowedIssueBasePath } from '../src/config/kanban-home';
import { validatePath } from '../src/store/path-validator';

describe('kanban home config', () => {
  it('defaults to workspace-kanban vault', () => {
    vi.stubEnv('KANBAN_HOME', '');
    expect(resolveKanbanHome()).toBe(path.join(os.homedir(), '.openclaw', 'workspace-kanban', 'kanban'));
    vi.unstubAllEnvs();
  });

  it('uses KANBAN_HOME when provided', () => {
    vi.stubEnv('KANBAN_HOME', '~/custom-kanban');
    expect(resolveKanbanHome()).toBe(path.join(os.homedir(), 'custom-kanban'));
    vi.unstubAllEnvs();
  });

  it('allows paths under issues', () => {
    vi.stubEnv('KANBAN_HOME', '~/custom-kanban');
    const allowed = getAllowedIssueBasePath();
    expect(allowed).toBe(path.join(os.homedir(), 'custom-kanban', 'issues'));
    expect(validatePath(path.join(allowed, 'openclaw', 'issue-1.md'))).toContain('issue-1.md');
    vi.unstubAllEnvs();
  });
});
