import path from 'path';
import { readExecutionLock, releaseExecutionLock } from '@kanban-task-engine/core/executor';
import { CliHandler, fail, ok, requireIssueId } from '../index.js';
import { findIssueById, updateIssueStatus } from '../vault.js';
import { formatCleanupGuidanceLines } from './cleanup-guidance.js';

const DEFAULT_STALE_LOCK_MS = 30 * 60 * 1000;

export const commandRecoverRun: CliHandler = async (args, context) => {
  const parsed = parseRecoverRunArgs(args);
  if (!parsed.ok) return fail(parsed.message);

  if (!context.vaultRoot) {
    return fail('KANBAN_HOME is not configured');
  }

  const issue = await findIssueById(context.vaultRoot, parsed.issueId);
  if (!issue) {
    return fail(`Issue not found: ${parsed.issueId}`);
  }
  if (issue.status !== 'RUNNING') {
    return fail(`Issue ${parsed.issueId} is ${issue.status}; only RUNNING issues can be recovered`);
  }

  const lockPath = path.join(context.vaultRoot, 'runtime', 'current.lock');
  const lock = await readExecutionLock(lockPath);
  if (lock) {
    if (lock.issueId !== parsed.issueId) {
      return fail(`Cannot recover ${parsed.issueId}: execution lock is held by ${lock.issueId}`);
    }
    const acquiredAt = Date.parse(lock.acquiredAt);
    const isStaleByTime = Number.isFinite(acquiredAt) && Date.now() - acquiredAt > DEFAULT_STALE_LOCK_MS;
    const processState = getLockProcessState(lock.pid);
    const canRecover = processState === 'dead' || (processState === 'unknown' && isStaleByTime);
    if (!canRecover) {
      return fail(`Cannot recover ${parsed.issueId}: active execution lock${lock.issueId ? ` held by ${lock.issueId}` : ''}`);
    }
    await releaseExecutionLock(lockPath);
  }

  const cleanupGuidance = formatCleanupGuidanceLines({
    issue,
    artifactPath: issue.path,
  });

  await updateIssueStatus(issue, {
    status: 'FAILED',
    logMessage: [
      `Recovered stale RUNNING issue: ${parsed.reason}. Worktree preserved; branch preserved.`,
      ...cleanupGuidance,
    ].join('\n'),
  });

  return ok([
    `issue: ${issue.id}`,
    'outcome: FAILED',
    'preserve_worktree: true',
    ...cleanupGuidance,
  ].join('\n'));
};

type ParseRecoverRunArgsResult =
  | { ok: true; issueId: string; reason: string }
  | { ok: false; message: string };

function parseRecoverRunArgs(args: string[]): ParseRecoverRunArgsResult {
  const positional: string[] = [];
  let reason: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--reason') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        return { ok: false, message: '--reason requires a value' };
      }
      reason = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      return { ok: false, message: `Unknown option: ${arg}` };
    }
    positional.push(arg);
  }

  const issueId = requireIssueId(positional, 'recover-run');
  if (typeof issueId !== 'string') return { ok: false, message: issueId.stderr.trimEnd() };
  if (positional.length > 1) {
    return { ok: false, message: `Unexpected argument: ${positional[1]}` };
  }
  if (!reason) {
    return { ok: false, message: '--reason is required' };
  }
  return { ok: true, issueId, reason };
}

type LockProcessState = 'alive' | 'dead' | 'unknown';

function getLockProcessState(pid: number | undefined): LockProcessState {
  if (typeof pid !== 'number') return 'unknown';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (isNodeError(error) && error.code === 'ESRCH') {
      return 'dead';
    }
    return 'unknown';
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
