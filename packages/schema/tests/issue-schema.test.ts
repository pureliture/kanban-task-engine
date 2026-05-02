import { describe, it, expect } from 'vitest';
import {
  parseIssueMarkdown,
  validateIssueFrontmatter,
  validateIssueFrontmatterForRegistry,
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

  it('rejects task issues missing 로그 section', () => {
    const markdown = VALID_ISSUE_MARKDOWN.replace(/\n## 로그\n[\s\S]*$/m, '\n');
    const result = parseIssueMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Missing required section: 로그');
  });

  it.each(['READY', 'RUNNING', 'REVIEW', 'FAILED'])('rejects epic status %s', status => {
    const markdown = VALID_EPIC_MARKDOWN.replace('status: TODO', `status: ${status}`);
    const result = parseIssueMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid epic status');
  });

  it('rejects epic executor other than human', () => {
    const markdown = VALID_EPIC_MARKDOWN.replace('executor: human', 'executor: codex');
    const result = parseIssueMarkdown(markdown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('Epic executor must be human');
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

  it('rejects deprecated Work/Jira frontmatter fields', () => {
    const result = validateIssueFrontmatter({ ...base, syncTarget: 'jira', jiraProject: 'AUTH', jiraKey: 'AUTH-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Deprecated field is not supported: syncTarget');
    expect(result.errors).toContain('Deprecated field is not supported: jiraProject');
    expect(result.errors).toContain('Deprecated field is not supported: jiraKey');
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

  it('rejects unsafe issue ids before path usage', () => {
    const unsafeIds = ['../VC-001', 'VC/001', 'VC\\001', '.', '..', '', '   ', '-VC-001', 'VC-\u0000-001'];
    for (const unsafeId of unsafeIds) {
      const result = validateIssueFrontmatter({
        id: unsafeId,
        title: 'x',
        type: 'task',
        status: 'TODO',
        executor: 'human',
        project: 'kanban-task-engine',
        created: '2026-05-02',
        updated: '2026-05-02',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid issue id');
    }
  });

  it('rejects registry idPrefix mismatch in registry-aware validation', () => {
    const result = validateIssueFrontmatterForRegistry({
      id: 'OC-001',
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      project: 'kanban-task-engine',
      created: '2026-05-02',
      updated: '2026-05-02',
    }, { idPrefix: 'VC', spaceType: 'container' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('Invalid issue id');
  });

  it('requires project to be present while allowing empty project for single-space registry validation', () => {
    const missingProject = validateIssueFrontmatterForRegistry({
      id: 'OC-001',
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      created: '2026-05-02',
      updated: '2026-05-02',
    }, { idPrefix: 'OC', spaceType: 'single' });
    expect(missingProject.ok).toBe(false);
    if (!missingProject.ok) expect(missingProject.errors).toContain('Missing required field: project');

    const emptyProject = validateIssueFrontmatterForRegistry({
      id: 'OC-001',
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      project: '',
      created: '2026-05-02',
      updated: '2026-05-02',
    }, { idPrefix: 'OC', spaceType: 'single' });
    expect(emptyProject.ok).toBe(true);
  });

  it('accepts namespaced Jira sync metadata but rejects flat Jira fields', () => {
    expect(validateIssueFrontmatter({
      id: 'VC-100',
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      project: 'kanban-task-engine',
      created: '2026-05-02',
      updated: '2026-05-02',
      sync: { jira: { key: 'AUTH-1', status: 'To Do', exportedAt: '2026-05-02T00:00:00.000Z' } },
    }).ok).toBe(true);
    expect(validateIssueFrontmatter({
      id: 'VC-100',
      title: 'x',
      type: 'task',
      status: 'TODO',
      executor: 'human',
      project: 'kanban-task-engine',
      created: '2026-05-02',
      updated: '2026-05-02',
      jiraKey: 'AUTH-1',
    }).ok).toBe(false);
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
