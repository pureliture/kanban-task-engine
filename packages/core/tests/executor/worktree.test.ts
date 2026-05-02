import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createKanbanWorktree, cleanupKanbanWorktree, getKanbanBranchName, getKanbanWorktreePath } from '../../src/executor/worktree';
import { GitRunner } from '../../src/executor/git';

function fakeRunner(branchList = ''): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args[0] === 'branch' && args[1] === '--list') {
        return { stdout: branchList, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
}

describe('worktree executor helpers', () => {
  it('derives branch and worktree paths', () => {
    expect(getKanbanBranchName('VC-001')).toBe('kanban/VC-001');
    expect(getKanbanWorktreePath('/repo', 'VC-001')).toBe('/repo/.worktrees/kanban/VC-001');
  });

  it('fetches before creating worktree by default', async () => {
    const runner = fakeRunner();
    const result = await createKanbanWorktree({
      runner,
      workingDir: '/repo',
      issueId: 'VC-001',
      baseRef: 'origin/main',
    });

    expect(result).toEqual({
      branchName: 'kanban/VC-001',
      worktreePath: '/repo/.worktrees/kanban/VC-001',
    });
    expect(runner.calls).toEqual([
      ['fetch', 'origin', '--prune'],
      ['worktree', 'add', '-b', 'kanban/VC-001', '/repo/.worktrees/kanban/VC-001', 'origin/main'],
    ]);
  });

  it('cleans up the worktree then branch', async () => {
    const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-worktree-test-'));
    const worktreePath = path.join(workingDir, '.worktrees', 'kanban', 'VC-001');
    await fs.mkdir(worktreePath, { recursive: true });
    const runner = fakeRunner('kanban/VC-001\n');
    await cleanupKanbanWorktree(runner, workingDir, 'VC-001');
    expect(runner.calls).toEqual([
      ['worktree', 'remove', '--force', worktreePath],
      ['branch', '--list', 'kanban/VC-001'],
      ['branch', '-D', 'kanban/VC-001'],
    ]);
  });
});
