import { describe, expect, it } from 'vitest';
import {
  addAll,
  commitAll,
  createWorktreeBranch,
  deleteBranch,
  fetchOrigin,
  getDefaultBranch,
  GitRunner,
  mergeFfOnly,
  removeWorktree,
  revParse,
} from '../../src/executor/git';

function fakeRunner(stdout = ''): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      return { stdout, stderr: '' };
    },
  };
}

describe('git executor helpers', () => {
  it('fetches origin with prune', async () => {
    const runner = fakeRunner();
    await fetchOrigin(runner, '/repo');
    expect(runner.calls).toEqual([['fetch', 'origin', '--prune']]);
  });

  it('resolves origin default branch', async () => {
    const runner = fakeRunner('origin/main\n');
    await expect(getDefaultBranch(runner, '/repo')).resolves.toBe('main');
  });

  it('creates a worktree branch from a base ref', async () => {
    const runner = fakeRunner();
    await createWorktreeBranch(runner, '/repo', 'kanban/VC-001', '/repo/.worktrees/kanban/VC-001', 'origin/main');
    expect(runner.calls[0]).toEqual(['worktree', 'add', '-b', 'kanban/VC-001', '/repo/.worktrees/kanban/VC-001', 'origin/main']);
  });

  it('removes worktree and branch with force by default', async () => {
    const runner = fakeRunner();
    await removeWorktree(runner, '/repo', '/repo/.worktrees/kanban/VC-001');
    await deleteBranch(runner, '/repo', 'kanban/VC-001');
    expect(runner.calls).toEqual([
      ['worktree', 'remove', '--force', '/repo/.worktrees/kanban/VC-001'],
      ['branch', '-D', 'kanban/VC-001'],
    ]);
  });

  it('runs ff-only merge', async () => {
    const runner = fakeRunner();
    await mergeFfOnly(runner, '/repo', 'kanban/VC-001');
    expect(runner.calls).toEqual([['merge', '--ff-only', 'kanban/VC-001']]);
  });

  it('resolves a ref with rev-parse', async () => {
    const runner = fakeRunner('abc123\n');
    await expect(revParse(runner, '/repo', 'HEAD')).resolves.toBe('abc123');
    expect(runner.calls).toEqual([['rev-parse', 'HEAD']]);
  });

  it('adds all changes with add -A', async () => {
    const runner = fakeRunner();
    await addAll(runner, '/repo');
    expect(runner.calls).toEqual([['add', '-A']]);
  });

  it('commits all staged changes with explicit author config', async () => {
    const runner = fakeRunner();
    await commitAll(runner, '/repo', 'VC-001 checkpoint', 'Created by kanban-task-engine run lifecycle.');
    expect(runner.calls).toEqual([[
      '-c',
      'user.name=Kanban Engine',
      '-c',
      'user.email=kanban-engine@example.invalid',
      'commit',
      '-m',
      'VC-001 checkpoint',
      '-m',
      'Created by kanban-task-engine run lifecycle.',
    ]]);
  });
});
