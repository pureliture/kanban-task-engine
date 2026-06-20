import { CanonicalTaskModel } from '@kanban-task-engine/core';
import { toJiraStatusHint } from '@kanban-task-engine/schema';

export interface JiraPayloadOptions {
  jiraProject: string;
}

export interface JiraIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    description: string;
    issuetype: { name: string };
    priority: { name: string };
    labels: string[];
  };
  /**
   * create 후 적용할 Jira status transition 후보 (ADR-0003). Jira create 는 초기
   * 상태가 고정이라 status 를 직접 넣지 못하므로, 실제 transition 은 M4 에서
   * resolveJiraTransition(status, availableTransitions) 으로 테넌트에 맞춰 확정한다.
   */
  statusHint: string;
}

export function canonicalToJiraPayload(issue: CanonicalTaskModel, options: JiraPayloadOptions): JiraIssuePayload {
  return {
    fields: {
      project: { key: options.jiraProject },
      summary: issue.summary,
      description: issue.description_ref ?? '',
      issuetype: { name: issue.classification.issue_type },
      priority: { name: issue.classification.priority },
      labels: issue.classification.labels,
    },
    statusHint: toJiraStatusHint(issue.workflow.normalized_status),
  };
}