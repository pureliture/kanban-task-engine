import { describe, expect, it } from 'vitest';
import {
  ISSUE_STATUSES,
  isIssueStatus,
  VALID_ISSUE_TRANSITIONS,
  toJiraStatusHint,
  STATUS_BRIDGE,
  toNeuronsStatus,
  toStatusCategory,
  fromNeuronsStatus,
  fromJiraCategory,
  resolveJiraTransition,
} from '../src/status';

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

  it('does not expose FAILED as a default transition from TODO or REVIEW', () => {
    expect(VALID_ISSUE_TRANSITIONS).not.toContainEqual({ from: 'TODO', to: 'FAILED' });
    expect(VALID_ISSUE_TRANSITIONS).not.toContainEqual({ from: 'REVIEW', to: 'FAILED' });
  });

  it('maps statuses to Jira hints', () => {
    expect(toJiraStatusHint('RUNNING')).toBe('In Progress');
    expect(toJiraStatusHint('FAILED')).toBe('Blocked');
  });
});

describe('3-way status bridge (ADR-0003)', () => {
  it('exposes a single SoT entry for every status', () => {
    for (const s of ISSUE_STATUSES) {
      const e = STATUS_BRIDGE[s];
      expect(e.category).toBeTruthy();
      expect(e.neurons).toBe(e.neurons.toLowerCase());
      expect(e.jiraHint).toBeTruthy();
      expect(['To Do', 'In Progress', 'Done']).toContain(e.jiraCategory);
    }
  });

  it('keeps FAILED out of the Done jira category', () => {
    expect(STATUS_BRIDGE.FAILED.jiraCategory).not.toBe('Done');
  });

  it('normalizes neurons forward and terminal statuses', () => {
    expect(toNeuronsStatus('REVIEW')).toBe('in_review');
    expect(fromNeuronsStatus('running')).toBe('RUNNING');
    expect(fromNeuronsStatus('resolved')).toBe('DONE'); // terminal → DONE
    expect(fromNeuronsStatus('closed')).toBe('DONE');
    expect(fromNeuronsStatus('weird-unknown')).toBeNull(); // fail-closed
  });

  it('maps status categories both directions', () => {
    expect(toStatusCategory('RUNNING')).toBe('IN_PROGRESS');
    expect(fromJiraCategory('Done')).toBe('DONE');
    expect(fromJiraCategory('Unknown')).toBeNull();
  });

  it('resolves jira transitions with category fallback', () => {
    expect(resolveJiraTransition('RUNNING', ['To Do', 'In Progress', 'Done'])).toBe('In Progress');
    expect(resolveJiraTransition('REVIEW', ['To Do', 'In Progress', 'Done'])).toBe('In Progress'); // In Review 부재 → 카테고리 폴백
    expect(resolveJiraTransition('READY', ['To Do', 'In Progress', 'Done'])).toBe('To Do'); // Ready 부재 → To Do 폴백
    expect(resolveJiraTransition('DONE', ['To Do', 'In Progress'])).toBeNull(); // 없음 → fail-closed
  });
});
