import { describe, it, expect } from 'vitest';
import {
  parseIssueMarkdown,
  validateIssueFrontmatter,
  validateCanonicalIssue,
  VALID_ISSUE_MARKDOWN,
  VALID_EPIC_MARKDOWN,
  INVALID_ISSUE_MISSING_목적,
  INVALID_ISSUE_UNKNOWN_TYPE,
} from '../src';

describe('parseIssueMarkdown', () => {
  it('accepts a valid task issue', () => {
    const result = parseIssueMarkdown(VALID_ISSUE_MARKDOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.id).toBe('VC-006');
    expect(result.value.frontmatter.type).toBe('task');
    expect(result.value.frontmatter.epic).toBe('VC-005');
    expect(result.value.frontmatter.priority).toBe('P2');
    expect(result.value.sections['목적']).toContain('로그인');
    expect(result.value.sections['Acceptance Criteria']).toContain('이메일');
  });

  it('accepts a valid epic issue', () => {
    const result = parseIssueMarkdown(VALID_EPIC_MARKDOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.type).toBe('epic');
    expect(result.value.frontmatter.executor).toBe('human');
    expect(result.value.sections['목표']).toContain('신규 사용자');
    expect(result.value.sections['성공 지표']).toContain('첫 액션');
  });

  it('rejects a task issue with missing 목적 section', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_MISSING_목적);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Missing required section: 목적'))).toBe(true);
  });

  it('rejects a task issue with unknown type (story removed)', () => {
    const result = parseIssueMarkdown(INVALID_ISSUE_UNKNOWN_TYPE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Invalid type'))).toBe(true);
  });

  it('rejects missing YAML frontmatter', () => {
    const result = parseIssueMarkdown('no frontmatter here');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('Missing YAML frontmatter');
  });

  it('parses valid issue markdown with CRLF line endings', () => {
    const CRLF_MARKDOWN = VALID_ISSUE_MARKDOWN.replace(/\n/g, '\r\n');
    const result = parseIssueMarkdown(CRLF_MARKDOWN);
    expect(result.ok).toBe(true);
  });

  it('returns validation errors for malformed YAML', () => {
    const result = parseIssueMarkdown(`---
id: [
---

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Invalid YAML frontmatter');
    }
  });
});

describe('validateIssueFrontmatter', () => {
  const base = {
    id: 'VC-100',
    title: 't',
    type: 'task',
    status: 'TODO',
    executor: 'human',
    project: 'flow-weaver',
    created: '2026-04-23',
    updated: '2026-04-23',
  };

  it('passes with minimum required fields', () => {
    const result = validateIssueFrontmatter(base);
    expect(result.ok).toBe(true);
  });

  it('allows epic to have empty project', () => {
    const result = validateIssueFrontmatter({ ...base, type: 'epic', project: '' });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown priority', () => {
    const result = validateIssueFrontmatter({ ...base, priority: 'HighUrgent' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Invalid priority'))).toBe(true);
  });

  it('rejects non-number run_count', () => {
    const result = validateIssueFrontmatter({ ...base, run_count: 'three' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-array depends_on', () => {
    const result = validateIssueFrontmatter({ ...base, depends_on: 'VC-001' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown status', () => {
    const result = validateIssueFrontmatter({ ...base, status: 'ACTIVE' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-string id', () => {
    const result = validateIssueFrontmatter({ ...base, id: 123 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.includes('Invalid field type: id'))).toBe(true);
  });
});

describe('validateCanonicalIssue', () => {
  it('rejects non-object input', () => {
    const result = validateCanonicalIssue('not an object');
    expect(result.ok).toBe(false);
  });

  it('validates canonical issue shape', () => {
    const result = validateCanonicalIssue({
      task_ref: { provider: 'local', external_key: 'demo', external_id: 'VC-006' },
      summary: 'Demo',
      workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
      classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
      ownership: { assignee: '', reporter: '' },
      planning: {},
      automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-23', last_source: 'local' },
    });
    expect(result.ok).toBe(true);
  });
});
