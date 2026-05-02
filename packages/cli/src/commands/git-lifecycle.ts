import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  checkoutBranch,
  cleanupKanbanWorktree,
  createNodeGitRunner,
  deleteBranch,
  fetchOrigin,
  getKanbanBranchName,
  getKanbanWorktreePath,
  getStatusPorcelain,
  GitRunner,
  isAncestor,
  mergeFfOnly,
  removeWorktree,
  resolveExecutionTarget,
} from '@kanban-task-engine/core/executor';
import type { CliIssue } from '../vault.js';

export interface GitLifecycleResult {
  mergeInto: string;
  cleanupWarning?: string;
}

interface ApproveFailureGuidanceInput {
  issueId: string;
  workingDir: string;
  mergeInto: string;
  baseRef: string;
  kanbanBranch: string;
  worktreePath: string;
  cause: unknown;
  localTargetDiverged?: boolean;
  restoreWarning?: string;
}

export async function approveWithGit(
  issue: CliIssue,
  runner: GitRunner = createNodeGitRunner(),
): Promise<GitLifecycleResult> {
  const workingDir = requireWorkingDir(issue);
  await fetchOrigin(runner, workingDir);
  const target = await resolveExecutionTarget(runner, issue);
  const worktreePath = getKanbanWorktreePath(target.workingDir, issue.id);
  const worktreeStatus = await getStatusPorcelain(runner, worktreePath);
  if (worktreeStatus.trim() !== '') {
    throw new Error(`worktree is not clean: ${worktreePath}`);
  }

  const kanbanBranch = getKanbanBranchName(issue.id);
  const originalBranch = await getCurrentBranch(runner, target.workingDir);
  await checkoutBranch(runner, target.workingDir, target.mergeInto);
  try {
    await mergeFfOnly(runner, target.workingDir, target.baseRef);
  } catch (error) {
    const restoreWarning = await restoreOriginalBranch(runner, target.workingDir, originalBranch, target.mergeInto);
    throw new Error(formatApproveFailureGuidance({
      issueId: issue.id,
      workingDir: target.workingDir,
      mergeInto: target.mergeInto,
      baseRef: target.baseRef,
      kanbanBranch,
      worktreePath,
      cause: error,
      localTargetDiverged: true,
      restoreWarning,
    }));
  }
  try {
    await mergeFfOnly(runner, target.workingDir, kanbanBranch);
  } catch (error) {
    const restoreWarning = await restoreOriginalBranch(runner, target.workingDir, originalBranch, target.mergeInto);
    throw new Error(formatApproveFailureGuidance({
      issueId: issue.id,
      workingDir: target.workingDir,
      mergeInto: target.mergeInto,
      baseRef: target.baseRef,
      kanbanBranch,
      worktreePath,
      cause: error,
      restoreWarning,
    }));
  }
  let cleanupWarning: string | undefined;
  try {
    await cleanupKanbanWorktree(runner, target.workingDir, issue.id);
  } catch (error) {
    cleanupWarning = formatCause(error);
  }
  cleanupWarning = appendWarning(
    cleanupWarning,
    await restoreOriginalBranch(runner, target.workingDir, originalBranch, target.mergeInto),
  );
  return { mergeInto: target.mergeInto, cleanupWarning };
}

export async function discardAbortWithGit(issue: CliIssue): Promise<GitLifecycleResult> {
  const runner = createNodeGitRunner();
  const workingDir = requireWorkingDir(issue);
  await fetchOrigin(runner, workingDir);
  const target = await resolveExecutionTarget(runner, issue);
  const branchName = getKanbanBranchName(issue.id);
  if (await branchExists(runner, target.workingDir, branchName)) {
    const safeToDiscard = await isAncestor(runner, target.workingDir, branchName, target.baseRef);
    if (!safeToDiscard) {
      throw new Error(`${branchName} is not an ancestor of ${target.baseRef}; refusing to discard`);
    }
  }

  await cleanupKanbanWorktree(runner, target.workingDir, issue.id);
  return { mergeInto: target.mergeInto };
}

export async function retryWithGit(issue: CliIssue): Promise<void> {
  const workingDir = requireWorkingDir(issue);
  const runner = createNodeGitRunner();
  const branchName = getKanbanBranchName(issue.id);
  const worktreePath = getKanbanWorktreePath(workingDir, issue.id);

  if (await exists(worktreePath)) {
    await removeWorktree(runner, workingDir, worktreePath, true);
  }

  const branchList = await runner.run(['branch', '--list', branchName], { cwd: workingDir });
  if (branchList.stdout.trim() !== '') {
    await deleteBranch(runner, workingDir, branchName, true);
  }
}

function requireWorkingDir(issue: CliIssue): string {
  if (!issue.workingDir) {
    throw new Error(`Issue ${issue.id} does not define working_dir`);
  }
  if (issue.workingDir === '~') {
    return os.homedir();
  }
  if (issue.workingDir.startsWith('~/')) {
    return path.join(os.homedir(), issue.workingDir.slice(2));
  }
  return issue.workingDir;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function branchExists(runner: GitRunner, repoPath: string, branchName: string): Promise<boolean> {
  const branchList = await runner.run(['branch', '--list', branchName], { cwd: repoPath });
  return branchList.stdout.trim() !== '';
}

async function getCurrentBranch(runner: GitRunner, repoPath: string): Promise<string | undefined> {
  const result = await runner.run(['branch', '--show-current'], { cwd: repoPath });
  return result.stdout.trim() || undefined;
}

async function restoreOriginalBranch(
  runner: GitRunner,
  repoPath: string,
  originalBranch: string | undefined,
  currentTargetBranch: string,
): Promise<string | undefined> {
  if (!originalBranch || originalBranch === currentTargetBranch) return undefined;
  try {
    await checkoutBranch(runner, repoPath, originalBranch);
    return undefined;
  } catch (error) {
    return `failed to restore original branch ${originalBranch}: ${formatCause(error)}`;
  }
}

function appendWarning(existing: string | undefined, next: string | undefined): string | undefined {
  if (!existing) return next;
  if (!next) return existing;
  return `${existing}; ${next}`;
}

function formatApproveFailureGuidance(input: ApproveFailureGuidanceInput): string {
  const lines = [
    'fast-forward approve failed; issue remains REVIEW.',
    `working_dir: ${input.workingDir}`,
    `merge_into: ${input.mergeInto}`,
    `base_ref: ${input.baseRef}`,
    `kanban_branch: ${input.kanbanBranch}`,
    `worktree_path: ${input.worktreePath}`,
  ];

  if (input.localTargetDiverged) {
    lines.push(
      `local target branch diverged from ${input.baseRef}; engine did not resolve local target divergence.`,
      'Resolve the local target branch first, then retry approve.',
    );
  }
  if (input.restoreWarning) {
    lines.push(`restore_warning: ${input.restoreWarning}`);
  }

  lines.push(
    'manual diagnostics:',
    `git -C ${input.workingDir} fetch origin --prune`,
    `git -C ${input.workingDir} log --oneline --graph --decorate --max-count=20 ${input.mergeInto} ${input.baseRef} ${input.kanbanBranch}`,
    'manual rebase example for the kanban branch:',
    `${input.kanbanBranch} is checked out in worktree: ${input.worktreePath}`,
    `git -C ${input.worktreePath} rebase ${input.baseRef}`,
    `kanban approve ${input.issueId}`,
    'engine did not run rebase automatically.',
    `original_error: ${formatCause(input.cause)}`,
  );

  return lines.join('\n');
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
