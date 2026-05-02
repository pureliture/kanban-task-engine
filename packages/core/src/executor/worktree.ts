import fs from 'fs/promises';
import path from 'path';
import { createWorktreeBranch, deleteBranch, fetchOrigin, GitRunner, removeWorktree } from './git.js';

export interface KanbanWorktree {
  branchName: string;
  worktreePath: string;
}

export interface CreateKanbanWorktreeInput {
  runner: GitRunner;
  workingDir: string;
  issueId: string;
  baseRef: string;
  fetch?: boolean;
}

export function getKanbanBranchName(issueId: string): string {
  return `kanban/${issueId}`;
}

export function getKanbanWorktreePath(workingDir: string, issueId: string): string {
  return path.join(workingDir, '.worktrees', 'kanban', issueId);
}

export async function createKanbanWorktree(input: CreateKanbanWorktreeInput): Promise<KanbanWorktree> {
  const branchName = getKanbanBranchName(input.issueId);
  const worktreePath = getKanbanWorktreePath(input.workingDir, input.issueId);

  if (input.fetch ?? true) {
    await fetchOrigin(input.runner, input.workingDir);
  }

  await createWorktreeBranch(input.runner, input.workingDir, branchName, worktreePath, input.baseRef);
  return { branchName, worktreePath };
}

export async function cleanupKanbanWorktree(
  runner: GitRunner,
  workingDir: string,
  issueId: string,
): Promise<KanbanWorktree> {
  const branchName = getKanbanBranchName(issueId);
  const worktreePath = getKanbanWorktreePath(workingDir, issueId);

  if (await exists(worktreePath)) {
    await removeWorktree(runner, workingDir, worktreePath, true);
  }
  const branchList = await runner.run(['branch', '--list', branchName], { cwd: workingDir });
  if (branchList.stdout.trim() !== '') {
    await deleteBranch(runner, workingDir, branchName, true);
  }

  return { branchName, worktreePath };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
