import { describe, expect, it } from 'vitest';
import { CanonicalTaskModel } from '@kanban-task-engine/core';
import { canonicalToJiraPayload } from '../src/jira-mapper';

describe('canonicalToJiraPayload', () => {
  const issue: CanonicalTaskModel = {
    task_ref: { provider: 'local', external_key: 'AUTH', external_id: 'issue-auth-refresh-001' },
    summary: '토큰 갱신 플로우 개선',
    description_ref: '/vault/issues/auth/issue-auth-refresh-001.md',
    workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
    classification: { issue_type: 'Story', priority: 'High', labels: ['auth'], component: ['backend'] },
    ownership: { assignee: '', reporter: '' },
    planning: {},
    automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
    sync: { last_synced_at: '2026-04-20', last_source: 'local' },
  };

  it('maps canonical issue to Jira fields', () => {
    const payload = canonicalToJiraPayload(issue, { jiraProject: 'AUTH' });
    expect(payload.fields.project.key).toBe('AUTH');
    expect(payload.fields.summary).toBe('토큰 갱신 플로우 개선');
    expect(payload.fields.issuetype.name).toBe('Story');
    expect(payload.fields.priority.name).toBe('High');
    expect(payload.fields.labels).toEqual(['auth']);
  });
});