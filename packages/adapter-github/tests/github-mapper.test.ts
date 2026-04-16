import { describe, it, expect } from 'vitest';
import { githubIssueToCanonical } from '../src/github-mapper';

describe('GitHub mapper', () => {
  it('maps open issue with no project status to BACKLOG', () => {
    const issue = {
      number: 42,
      title: 'Test issue',
      state: 'open' as const,
      labels: [{ name: 'bug' }],
      assignee: { login: 'dev' },
      created_at: '2026-04-16T10:00:00Z',
      updated_at: '2026-04-16T10:00:00Z',
    };
    const result = githubIssueToCanonical(issue, 'owner/repo');
    expect(result.task_ref.provider).toBe('github');
    expect(result.task_ref.external_id).toBe('#42');
    expect(result.workflow.normalized_status).toBe('BACKLOG');
    expect(result.classification.issue_type).toBe('Bug');
  });

  it('maps closed issue to DONE', () => {
    const issue = {
      number: 1,
      title: 'Done issue',
      state: 'closed' as const,
      labels: [],
      created_at: '2026-04-16T10:00:00Z',
      updated_at: '2026-04-16T12:00:00Z',
      closed_at: '2026-04-16T12:00:00Z',
    };
    const result = githubIssueToCanonical(issue, 'owner/repo');
    expect(result.workflow.normalized_status).toBe('DONE');
    expect(result.completed).toBe('2026-04-16T12:00:00Z');
  });

  it('maps project item status over issue state', () => {
    const issue = {
      number: 5,
      title: 'In progress issue',
      state: 'open' as const,
      labels: [],
      created_at: '2026-04-16T10:00:00Z',
      updated_at: '2026-04-16T10:00:00Z',
      project_items: [{ status: 'In Progress' }],
    };
    const result = githubIssueToCanonical(issue, 'owner/repo');
    expect(result.workflow.normalized_status).toBe('ACTIVE');
  });

  it('extracts assignee login', () => {
    const issue = {
      number: 3,
      title: 'Assigned',
      state: 'open' as const,
      labels: [],
      assignee: { login: 'claude' },
      created_at: '2026-04-16T10:00:00Z',
      updated_at: '2026-04-16T10:00:00Z',
    };
    const result = githubIssueToCanonical(issue, 'owner/repo');
    expect(result.ownership.assignee).toBe('claude');
  });
});