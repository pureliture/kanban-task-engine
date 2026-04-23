import { CanonicalTaskModel } from '@kanban-task-engine/core';

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
  };
}