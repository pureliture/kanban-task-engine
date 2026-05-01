import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { acquireExecutionLock, readExecutionLock } from '../../src/executor/lock';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kanban-lock-'));
}

describe('execution lock', () => {
  it('acquires and releases a lock file', async () => {
    const dir = await tmpDir();
    const lockPath = path.join(dir, 'runtime', 'current.lock');

    const lock = await acquireExecutionLock(lockPath, {
      issueId: 'VC-001',
      pid: 123,
    }, { now: new Date('2026-04-24T00:00:00.000Z') });

    expect(await readExecutionLock(lockPath)).toEqual({
      issueId: 'VC-001',
      pid: 123,
      acquiredAt: '2026-04-24T00:00:00.000Z',
    });

    await lock.release();
    expect(await readExecutionLock(lockPath)).toBeNull();
  });

  it('rejects a second active lock', async () => {
    const dir = await tmpDir();
    const lockPath = path.join(dir, 'runtime', 'current.lock');
    await acquireExecutionLock(lockPath, { issueId: 'VC-001' });

    await expect(acquireExecutionLock(lockPath, { issueId: 'VC-002' })).rejects.toThrow('already held by VC-001');
  });

  it('replaces a stale lock', async () => {
    const dir = await tmpDir();
    const lockPath = path.join(dir, 'runtime', 'current.lock');
    await acquireExecutionLock(lockPath, {
      issueId: 'VC-001',
      acquiredAt: '2026-04-24T00:00:00.000Z',
    });

    const lock = await acquireExecutionLock(lockPath, { issueId: 'VC-002' }, {
      now: new Date('2026-04-24T00:10:00.000Z'),
      staleMs: 60_000,
    });

    expect(lock.data.issueId).toBe('VC-002');
  });
});
