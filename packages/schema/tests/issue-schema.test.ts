import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN, INVALID_ISSUE_MISSING_GOAL } from '../src/fixtures';
import { parseIssueMarkdown, validateIssueFrontmatter } from '../src/issue-schema';

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
});
