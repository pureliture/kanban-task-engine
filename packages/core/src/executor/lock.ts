import fs from 'fs/promises';
import path from 'path';

export interface ExecutionLockData {
  issueId: string;
  acquiredAt: string;
  pid?: number;
}

export interface AcquireLockOptions {
  staleMs?: number;
  now?: Date;
}

export interface ExecutionLock {
  path: string;
  data: ExecutionLockData;
  release(): Promise<void>;
}

export async function readExecutionLock(lockPath: string): Promise<ExecutionLockData | null> {
  try {
    return JSON.parse(await fs.readFile(lockPath, 'utf8')) as ExecutionLockData;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function acquireExecutionLock(
  lockPath: string,
  data: Omit<ExecutionLockData, 'acquiredAt'> & { acquiredAt?: string },
  options: AcquireLockOptions = {},
): Promise<ExecutionLock> {
  const now = options.now ?? new Date();
  const lockData: ExecutionLockData = {
    ...data,
    acquiredAt: data.acquiredAt ?? now.toISOString(),
  };

  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await removeStaleLock(lockPath, now, options.staleMs);

  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(`${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      const current = await readExecutionLock(lockPath);
      throw new Error(`Execution lock already held${current?.issueId ? ` by ${current.issueId}` : ''}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }

  return {
    path: lockPath,
    data: lockData,
    release: () => releaseExecutionLock(lockPath),
  };
}

export async function releaseExecutionLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
}

async function removeStaleLock(lockPath: string, now: Date, staleMs?: number): Promise<void> {
  if (!staleMs) return;
  const current = await readExecutionLock(lockPath);
  if (!current) return;

  const acquiredAt = Date.parse(current.acquiredAt);
  if (Number.isFinite(acquiredAt) && now.getTime() - acquiredAt > staleMs) {
    await releaseExecutionLock(lockPath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
