import { NormalizedStatus } from '@kanban-task-engine/core';

// GitHub Projects status option names → Canonical status
const GITHUB_TO_CANONICAL: Record<string, NormalizedStatus> = {
  'Backlog': 'BACKLOG',
  'Todo': 'SELECTED',
  'In Progress': 'ACTIVE',
  'Blocked': 'BLOCKED',
  'In Review': 'REVIEW',
  'Done': 'DONE',
  'Cancelled': 'CANCELLED',
};

// Canonical status → GitHub Projects status option name
const CANONICAL_TO_GITHUB: Record<NormalizedStatus, string> = {
  'BACKLOG': 'Backlog',
  'SELECTED': 'Todo',
  'ACTIVE': 'In Progress',
  'BLOCKED': 'Blocked',
  'REVIEW': 'In Review',
  'DONE': 'Done',
  'CANCELLED': 'Cancelled',
};

export function githubStatusToNormalized(githubStatus: string): NormalizedStatus {
  return GITHUB_TO_CANONICAL[githubStatus] ?? 'BACKLOG';
}

export function normalizedToGithubStatus(normalized: NormalizedStatus): string {
  return CANONICAL_TO_GITHUB[normalized] ?? 'Backlog';
}