import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN } from '@kanban-task-engine/schema';
import { markdownIssueToCanonical } from '../src/store/mapper';

describe('markdownIssueToCanonical', () => {
  it('converts constrained Markdown issue to canonical JSON', () => {
    const task = markdownIssueToCanonical(
      VALID_ISSUE_MARKDOWN,
      '/vault/issues/openclaw/issue-auth-refresh-001.md'
    );
    expect(task.task_ref.provider).toBe('local');
    expect(task.task_ref.external_id).toBe('issue-auth-refresh-001');
    expect(task.summary).toBe('토큰 갱신 플로우 개선');
    expect(task.workflow.normalized_status).toBe('READY');
    expect(task.description_ref).toBe('/vault/issues/openclaw/issue-auth-refresh-001.md');
  });
});
