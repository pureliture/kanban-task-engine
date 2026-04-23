import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN, INVALID_ISSUE_MISSING_GOAL } from '../src/fixtures';
import { parseIssueMarkdown, validateCanonicalIssue, validateIssueFrontmatter } from '../src/issue-schema';

describe('issue schema', () => {
  it('parses valid issue markdown', () => {
    const result = parseIssueMarkdown(VALID_ISSUE_MARKDOWN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.status).toBe('READY');
      expect(result.value.sections.Goal).toContain('만료 직전');
    }
  });

  it('rejects missing required sections', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_MISSING_GOAL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Missing required section: Goal');
    }
  });

  it('rejects unknown statuses', () => {
    const result = validateIssueFrontmatter({
      id: 'issue-x',
      title: 'Bad status',
      issueType: 'task',
      project: 'demo',
      status: 'ACTIVE',
      priority: 'high',
      createdAt: '2026-04-20',
      updatedAt: '2026-04-20',
    });
    expect(result.ok).toBe(false);
  });

  it('parses valid issue markdown with CRLF line endings', () => {
    const CRLF_MARKDOWN = VALID_ISSUE_MARKDOWN.replace(/\n/g, '\r\n');
    const result = parseIssueMarkdown(CRLF_MARKDOWN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sections.Goal).toContain('만료 직전');
    }
  });

  it('returns validation errors for malformed YAML', () => {
    const result = parseIssueMarkdown(`---
id: [
---

## Goal
x

## Acceptance Criteria
x

## Implementation Tasks
x

## Notes
x
`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Invalid YAML frontmatter');
    }
  });

  it('rejects invalid frontmatter field types and enums', () => {
    const result = validateIssueFrontmatter({
      id: 123,
      title: {},
      issueType: 'not-jira',
      project: [],
      status: 'READY',
      priority: 'urgent',
      createdAt: true,
      updatedAt: '2026-04-20',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Invalid field type: id must be a string');
      expect(result.errors).toContain('Invalid issueType: not-jira');
      expect(result.errors).toContain('Invalid priority: urgent');
    }
  });

  it('validates canonical issue shape', () => {
    const result = validateCanonicalIssue({
      task_ref: { provider: 'local', external_key: 'demo', external_id: 'issue-1' },
      summary: 'Demo',
      workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
      classification: { issue_type: 'Story', priority: 'High', labels: [], component: [] },
      ownership: { assignee: '', reporter: '' },
      planning: {},
      automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-20', last_source: 'local' },
    });

    expect(result.ok).toBe(true);
  });
});
