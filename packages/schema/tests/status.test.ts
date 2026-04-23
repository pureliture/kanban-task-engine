import { describe, expect, it } from 'vitest';
import { ISSUE_STATUSES, isIssueStatus, VALID_ISSUE_TRANSITIONS, toJiraStatusHint } from '../src/status';

describe('issue status schema', () => {
  it('defines the shared status order', () => {
    expect(ISSUE_STATUSES).toEqual(['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED']);
  });

  it('recognizes valid statuses', () => {
    expect(isIssueStatus('READY')).toBe(true);
    expect(isIssueStatus('ACTIVE')).toBe(false);
  });

  it('defines explicit execution transitions', () => {
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'READY', to: 'RUNNING' });
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'RUNNING', to: 'REVIEW' });
    expect(VALID_ISSUE_TRANSITIONS).toContainEqual({ from: 'RUNNING', to: 'FAILED' });
  });

  it('maps statuses to Jira hints', () => {
    expect(toJiraStatusHint('RUNNING')).toBe('In Progress');
    expect(toJiraStatusHint('FAILED')).toBe('Blocked');
  });
});
