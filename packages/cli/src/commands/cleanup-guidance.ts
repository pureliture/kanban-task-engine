import { getKanbanBranchName, getKanbanWorktreePath } from '@kanban-task-engine/core/executor';
import type { CliIssue } from '../vault.js';

export interface CleanupGuidanceInput {
  issue: Pick<CliIssue, 'id' | 'workingDir'>;
  artifactPath: string;
  worktreePath?: string;
}

export function formatCleanupGuidanceLines(input: CleanupGuidanceInput): string[] {
  const worktreePath = input.worktreePath
    ?? (input.issue.workingDir ? getKanbanWorktreePath(input.issue.workingDir, input.issue.id) : '<unknown>');
  const branchName = getKanbanBranchName(input.issue.id);

  return [
    `worktreePath: ${worktreePath}`,
    `branchName: ${branchName}`,
    `artifactPath: ${input.artifactPath}`,
    'cleanupOwner: retry|abort',
    `cleanupGuidance: inspect artifactPath, then choose kanban retry ${input.issue.id} or kanban abort ${input.issue.id} --discard`,
    `retryCommand: kanban retry ${input.issue.id}`,
    `abortCommand: kanban abort ${input.issue.id} --discard`,
  ];
}
