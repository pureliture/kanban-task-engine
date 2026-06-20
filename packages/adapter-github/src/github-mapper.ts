import {
  CanonicalTaskModel,
  NormalizedStatus,
  RawStatusCategory,
  TaskRef,
} from '@kanban-task-engine/core';
import { githubStatusToNormalized, normalizedToGithubStatus } from './status-mapping';

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
    : (issue.state === 'closed' ? 'DONE' : 'TODO');

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
      on_enter: ['RUNNING'],
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
    'TODO': 'TODO',
    'READY': 'READY',
    'RUNNING': 'IN_PROGRESS',
    'REVIEW': 'IN_REVIEW',
    'DONE': 'DONE',
    'FAILED': 'FAILED',
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

// =====================================================================
// 역방향(canonical → GitHub Projects draft). a: Jira 대체 발행.
// =====================================================================

export interface GitHubDraftPayload {
  title: string;
  body: string;
  /** GitHub Projects Status 옵션 이름 (optionId 는 resolveStatusOptionId 로 해석) */
  statusOption: string;
  /** 역방향 매칭용 kanban id (body 에 기록) */
  kanbanId: string;
}

/** CanonicalTaskModel → GitHub Projects v2 draft 카드 payload. */
export function canonicalToGithubDraft(task: CanonicalTaskModel): GitHubDraftPayload {
  const kanbanId = task.task_ref.external_id;
  const statusOption = normalizedToGithubStatus(task.workflow.normalized_status);
  const lines = [
    `kanban-id: ${kanbanId}`,
    `type: ${task.classification.issue_type}`,
    `priority: ${task.classification.priority}`,
  ];
  if (task.classification.labels.length) lines.push(`labels: ${task.classification.labels.join(', ')}`);
  if (task.description_ref) lines.push(`source: ${task.description_ref}`);
  return { title: task.summary, body: lines.join('\n'), statusOption, kanbanId };
}

/** draft 카드 body 에서 kanban-id 를 역추출 (fetchProjectDrafts 매칭용). */
export function parseKanbanIdFromBody(body: string | null | undefined): string | undefined {
  const m = (body ?? '').match(/kanban-id:\s*(\S+)/);
  return m?.[1];
}
