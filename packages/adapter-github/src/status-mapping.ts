import { NormalizedStatus } from '@kanban-task-engine/core';

// GitHub Projects status option names → Canonical status
const GITHUB_TO_CANONICAL: Record<string, NormalizedStatus> = {
  'Backlog': 'TODO',
  'To Do': 'TODO',
  'Todo': 'TODO',
  'Ready': 'READY',
  'Selected': 'READY',
  'Selected for Development': 'READY',
  'In Progress': 'RUNNING',
  'Blocked': 'FAILED',
  'In Review': 'REVIEW',
  'Done': 'DONE',
  'Cancelled': 'FAILED',
  'Failed': 'FAILED',
};

// Canonical status → GitHub Projects status option name
const CANONICAL_TO_GITHUB: Record<NormalizedStatus, string> = {
  'TODO': 'Backlog',
  'READY': 'Ready',
  'RUNNING': 'In Progress',
  'REVIEW': 'In Review',
  'DONE': 'Done',
  'FAILED': 'Blocked',
};

export function githubStatusToNormalized(githubStatus: string): NormalizedStatus {
  return GITHUB_TO_CANONICAL[githubStatus] ?? 'TODO';
}

export function normalizedToGithubStatus(normalized: NormalizedStatus): string {
  return CANONICAL_TO_GITHUB[normalized] ?? 'Backlog';
}
