import { describe, expect, it } from 'vitest';
import { parseIssueMarkdown } from '@kanban-task-engine/schema';
import {
  createIssueDraft,
  hasKanbanPlaceholders,
  normalizeExecutionReadiness,
} from '../src/authoring';

describe('issue factory', () => {
  it('creates schema-valid task markdown with deterministic defaults', () => {
    const draft = createIssueDraft({
      id: 'VC-001',
      title: 'Authoring smoke',
      type: 'task',
      project: 'kanban-task-engine',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });

    expect(draft.frontmatter).toMatchObject({
      id: 'VC-001',
      title: 'Authoring smoke',
      type: 'task',
      status: 'TODO',
      priority: 'P2',
      executor: 'human',
      project: 'kanban-task-engine',
      created: '2026-05-12T00:00:00.000Z',
      updated: '2026-05-12T00:00:00.000Z',
    });
    expect(draft.markdown).toContain('## Acceptance Criteria');
    expect(hasKanbanPlaceholders(draft.markdown)).toBe(false);
    expect(parseIssueMarkdown(draft.markdown).ok).toBe(true);
  });

  it('forces epic executor and empty project', () => {
    const draft = createIssueDraft({
      id: 'VC-002',
      title: 'Epic smoke',
      type: 'epic',
      project: 'kanban-task-engine',
      executor: 'codex',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });

    expect(draft.frontmatter.executor).toBe('human');
    expect(draft.frontmatter.project).toBe('');
    expect(draft.markdown).toContain('## 하위 티켓');
    expect(parseIssueMarkdown(draft.markdown).ok).toBe(true);
  });

  it('detects kanban placeholder markers', () => {
    const markdown = `## 목적
<!-- kanban:placeholder reason="missing-section-content" -->
- 작성 필요
`;

    expect(hasKanbanPlaceholders(markdown)).toBe(true);
    expect(hasKanbanPlaceholders('## 목적\n- 작성 필요\n')).toBe(false);
  });

  it.each(['READY', 'RUNNING', 'REVIEW', 'DONE'] as const)(
    'downgrades placeholder-bearing %s issues to TODO with a dynamic warning',
    status => {
      expect(normalizeExecutionReadiness({
        status,
        type: 'task',
        executor: 'codex',
        hasPlaceholders: true,
      })).toEqual({
        status: 'TODO',
        executionReady: false,
        warnings: [`Placeholder content prevents ${status} status; normalized status to TODO`],
      });
    },
  );

  it('marks only non-epic READY tasks assigned to machine executors as execution-ready', () => {
    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'task',
      executor: 'human',
      hasPlaceholders: false,
    }).executionReady).toBe(false);

    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'task',
      executor: 'codex',
      hasPlaceholders: false,
    }).executionReady).toBe(true);

    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'task',
      executor: 'claude-code',
      hasPlaceholders: false,
    }).executionReady).toBe(true);

    expect(normalizeExecutionReadiness({
      status: 'READY',
      type: 'epic',
      executor: 'codex',
      hasPlaceholders: false,
    }).executionReady).toBe(false);

    expect(normalizeExecutionReadiness({
      status: 'RUNNING',
      type: 'task',
      executor: 'codex',
      hasPlaceholders: false,
    }).executionReady).toBe(false);
  });
});
