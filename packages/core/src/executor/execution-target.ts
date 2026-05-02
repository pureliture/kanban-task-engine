import os from 'os';
import path from 'path';
import { getDefaultBranch, GitRunner } from './git.js';

export interface ExecutionTargetIssue {
  id: string;
  workingDir?: string;
  mergeInto?: string;
}

export interface ExecutionTarget {
  workingDir: string;
  mergeInto: string;
  baseRef: string;
}

export async function resolveExecutionTarget(
  runner: GitRunner,
  issue: ExecutionTargetIssue,
): Promise<ExecutionTarget> {
  const workingDir = normalizeWorkingDir(requireWorkingDir(issue));
  const mergeInto = normalizeMergeInto(issue.mergeInto)
    ?? await getDefaultBranch(runner, workingDir);

  return {
    workingDir,
    mergeInto,
    baseRef: `origin/${mergeInto}`,
  };
}

function requireWorkingDir(issue: ExecutionTargetIssue): string {
  if (!issue.workingDir) {
    throw new Error(`Issue ${issue.id} does not define working_dir`);
  }
  return issue.workingDir;
}

function normalizeWorkingDir(workingDir: string): string {
  if (workingDir === '~') {
    return os.homedir();
  }
  if (workingDir.startsWith('~/')) {
    return path.join(os.homedir(), workingDir.slice(2));
  }
  return workingDir;
}

function normalizeMergeInto(mergeInto?: string): string | undefined {
  const normalized = mergeInto?.trim().replace(/^origin\//, '');
  return normalized || undefined;
}
