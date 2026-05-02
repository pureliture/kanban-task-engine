export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;

export type IssueStatus = typeof ISSUE_STATUSES[number];

export interface IssueTransition {
  from: IssueStatus;
  to: IssueStatus;
}

export const VALID_ISSUE_TRANSITIONS: IssueTransition[] = [
  { from: 'TODO', to: 'READY' },
  { from: 'READY', to: 'RUNNING' },
  { from: 'READY', to: 'TODO' },
  { from: 'RUNNING', to: 'REVIEW' },
  { from: 'RUNNING', to: 'FAILED' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'FAILED', to: 'READY' },
];

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === 'string' && (ISSUE_STATUSES as readonly string[]).includes(value);
}

const JIRA_STATUS_HINTS: Record<IssueStatus, string> = {
  TODO: 'To Do',
  READY: 'Ready',
  RUNNING: 'In Progress',
  REVIEW: 'In Review',
  DONE: 'Done',
  FAILED: 'Blocked',
};

export function toJiraStatusHint(status: IssueStatus): string {
  return JIRA_STATUS_HINTS[status];
}
