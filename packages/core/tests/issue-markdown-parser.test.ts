import { describe, expect, it } from 'vitest';
import { VALID_ISSUE_MARKDOWN } from '@kanban-task-engine/schema';
import { markdownIssueToCanonical } from '../src/store/mapper';

describe('markdownIssueToCanonical', () => {
  it('converts constrained Markdown issue to canonical JSON', () => {
    const task = markdownIssueToCanonical(
      VALID_ISSUE_MARKDOWN,
      '/vault/issues/vibe-coding/VC-006.md'
    );
    expect(task.task_ref.provider).toBe('local');
    expect(task.task_ref.external_id).toBe('VC-006');
    expect(task.summary).toBe('로그인 페이지 UI 스켈레톤');
    expect(task.workflow.normalized_status).toBe('READY');
    expect(task.description_ref).toBe('/vault/issues/vibe-coding/VC-006.md');
    expect(task.classification.issue_type).toBe('Task');
    expect(task.classification.priority).toBe('Medium');
  });
});
