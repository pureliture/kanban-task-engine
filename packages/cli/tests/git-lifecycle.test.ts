import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { GitRunner } from '@kanban-task-engine/core/executor';
import type { CliIssue } from '../src/vault';
import { approveWithGit } from '../src/commands/git-lifecycle';

function issue(input: { id?: string; workingDir: string }): CliIssue {
  return {
    id: input.id ?? 'VC-001',
    title: 'Review issue',
    type: 'task',
    status: 'REVIEW',
    priority: 'P1',
    project: 'kanban-task-engine',
    space: 'vibe-coding',
    path: '/vault/issues/VC-001.md',
    relativePath: 'issues/VC-001.md',
    executor: 'codex',
    workingDir: input.workingDir,
    mergeInto: 'main',
  };
}

describe('git lifecycle helpers', () => {
  it('returns cleanup warning after approve merges succeed but worktree cleanup fails', async () => {
    const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-approve-cleanup-'));
    const worktreePath = path.join(workingDir, '.worktrees', 'kanban', 'VC-001');
    await fs.mkdir(worktreePath, { recursive: true });
    const calls: string[][] = [];
    const runner: GitRunner = {
      async run(args) {
        calls.push(args);
        if (args[0] === 'status') return { stdout: '', stderr: '' };
        if (args[0] === 'worktree' && args[1] === 'remove') {
          throw new Error('cleanup remove failed');
        }
        return { stdout: '', stderr: '' };
      },
    };

    const result = await approveWithGit(issue({ workingDir }), runner);

    expect(calls).toContainEqual(['merge', '--ff-only', 'origin/main']);
    expect(calls).toContainEqual(['merge', '--ff-only', 'kanban/VC-001']);
    expect(result).toMatchObject({
      mergeInto: 'main',
      cleanupWarning: 'cleanup remove failed',
    });
  });
});
