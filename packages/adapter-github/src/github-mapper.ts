import {
  CanonicalTaskModel,
  NormalizedStatus,
  RawStatusCategory,
  TaskRef,
} from '@kanban-task-engine/core';
import { githubStatusToNormalized } from './status-mapping';

export interface GitHubIssueData {
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  labels: { name: string }[];
  assignee?: { login: string } | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  repository?: { name: string; owner: { login: string } };
  project_items?: GitHubProjectItemData[];
}

export interface GitHubProjectItemData {
  status?: string;
  priority?: string;
  sprint?: string;
}

export function githubIssueToCanonical(
  issue: GitHubIssueData,
  repoFullName: string
): CanonicalTaskModel {
  const [owner, repo] = repoFullName.split('/');
  const projectStatus = issue.project_items?.[0]?.status;
  const normalizedStatus = projectStatus
    ? githubStatusToNormalized(projectStatus)
    : (issue.state === 'closed' ? 'DONE' : 'BACKLOG');

  const priority = issue.project_items?.[0]?.priority;
  const sprint = issue.project_items?.[0]?.sprint;

  return {
    task_ref: {
      provider: 'github',
      external_key: repoFullName,
      external_id: `#${issue.number}`,
    },
    summary: issue.title,
    description_ref: `https://github.com/${repoFullName}/issues/${issue.number}`,
    workflow: {
      normalized_status: normalizedStatus,
      raw_status: projectStatus ?? issue.state,
      raw_status_category: mapToCategory(normalizedStatus),
    },
    classification: {
      issue_type: mapLabelsToType(issue.labels.map(l => l.name)),
      priority: mapPriority(priority ?? mapLabelsToPriority(issue.labels.map(l => l.name))),
      labels: issue.labels.map(l => l.name),
      component: [],
    },
    ownership: {
      assignee: issue.assignee?.login ?? '',
      reporter: '',
    },
    planning: {
      sprint: sprint,
    },
    automation: {
      policy_id: 'default',
      on_enter: ['ACTIVE'],
      on_exit: [],
      execution_profile: 'standard',
    },
    sync: {
      last_synced_at: issue.updated_at,
      last_source: 'github',
    },
    created: issue.created_at,
    updated: issue.updated_at,
    completed: issue.closed_at ?? undefined,
  };
}

function mapToCategory(status: NormalizedStatus): RawStatusCategory {
  const map: Record<NormalizedStatus, RawStatusCategory> = {
    'BACKLOG': 'BACKLOG',
    'SELECTED': 'BACKLOG',
    'ACTIVE': 'IN_PROGRESS',
    'BLOCKED': 'BLOCKED',
    'REVIEW': 'IN_REVIEW',
    'DONE': 'DONE',
    'CANCELLED': 'CANCELLED',
  };
  return map[status];
}

function mapLabelsToType(labels: string[]): CanonicalTaskModel['classification']['issue_type'] {
  if (labels.includes('bug') || labels.includes('Bug')) return 'Bug';
  if (labels.includes('epic') || labels.includes('Epic')) return 'Epic';
  if (labels.includes('story') || labels.includes('Story')) return 'Story';
  return 'Task';
}

function mapLabelsToPriority(labels: string[]): string {
  if (labels.some(l => l.toLowerCase() === 'blocker')) return 'Blocker';
  if (labels.some(l => l.toLowerCase() === 'critical')) return 'Critical';
  if (labels.some(l => l.toLowerCase() === 'high')) return 'High';
  if (labels.some(l => l.toLowerCase() === 'low')) return 'Low';
  if (labels.some(l => l.toLowerCase() === 'trivial')) return 'Trivial';
  return 'Medium';
}

function mapPriority(raw: string): CanonicalTaskModel['classification']['priority'] {
  const map: Record<string, CanonicalTaskModel['classification']['priority']> = {
    'Blocker': 'Blocker',
    'Critical': 'Critical',
    'High': 'High',
    'Medium': 'Medium',
    'Low': 'Low',
    'Trivial': 'Trivial',
  };
  return map[raw] ?? 'Medium';
}