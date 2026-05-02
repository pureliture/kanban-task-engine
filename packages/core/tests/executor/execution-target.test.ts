import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { GitRunner } from '../../src/executor/git';
import { resolveExecutionTarget } from '../../src/executor/execution-target';

function fakeGitRunner(defaultBranch = 'main'): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args[0] === 'symbolic-ref') {
        return { stdout: `origin/${defaultBranch}\n`, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
}

describe('resolveExecutionTarget', () => {
  it('normalizes ~/ paths using os.homedir()', async () => {
    const runner = fakeGitRunner();

    const target = await resolveExecutionTarget(runner, {
      id: 'VC-001',
      workingDir: '~/Projects/kanban-task-engine',
      mergeInto: 'main',
    });

    expect(target.workingDir).toBe(path.join(os.homedir(), 'Projects', 'kanban-task-engine'));
  });

  it('uses merge_into to derive baseRef origin/<mergeInto>', async () => {
    const runner = fakeGitRunner('develop');

    const target = await resolveExecutionTarget(runner, {
      id: 'VC-001',
      workingDir: '/repo',
      mergeInto: 'origin/main',
    });

    expect(target).toMatchObject({
      workingDir: '/repo',
      mergeInto: 'main',
      baseRef: 'origin/main',
    });
    expect(runner.calls).toEqual([]);
  });

  it('defaults mergeInto to repository default branch only when missing', async () => {
    const runner = fakeGitRunner('trunk');

    const target = await resolveExecutionTarget(runner, {
      id: 'VC-001',
      workingDir: '/repo',
    });

    expect(target).toMatchObject({
      workingDir: '/repo',
      mergeInto: 'trunk',
      baseRef: 'origin/trunk',
    });
    expect(runner.calls).toEqual([
      ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
    ]);
  });

  it('rejects missing working_dir before RUNNING mutation', async () => {
    await expect(resolveExecutionTarget(fakeGitRunner(), {
      id: 'VC-001',
    })).rejects.toThrow('Issue VC-001 does not define working_dir');
  });
});
