import { describe, it, expect } from 'vitest';
import { CanonicalTaskModel } from '@kanban-task-engine/core';
import { canonicalToGithubDraft, parseKanbanIdFromBody } from '../src/github-mapper';
import { resolveStatusOptionId } from '../src/status-mapping';

const task: CanonicalTaskModel = {
  task_ref: { provider: 'local', external_key: 'vibe-coding', external_id: 'VBC-board-sync-002' },
  summary: 'Obsidian 보드 카드 이동 시 이슈 상태 동기화',
  description_ref: '/vault/.../VBC-board-sync-002.md',
  workflow: { normalized_status: 'TODO', raw_status: 'TODO', raw_status_category: 'TODO' },
  classification: { issue_type: 'Task', priority: 'High', labels: ['obsidian', 'sync'], component: [] },
  ownership: { assignee: '', reporter: '' },
  planning: {},
  automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
  sync: { last_synced_at: '2026-06-20', last_source: 'local' },
};

describe('canonicalToGithubDraft (a: Jira 대체 발행)', () => {
  it('maps canonical task to a draft payload', () => {
    const d = canonicalToGithubDraft(task);
    expect(d.title).toBe('Obsidian 보드 카드 이동 시 이슈 상태 동기화');
    expect(d.statusOption).toBe('Backlog'); // TODO → Backlog
    expect(d.kanbanId).toBe('VBC-board-sync-002');
    expect(d.body).toContain('kanban-id: VBC-board-sync-002');
    expect(d.body).toContain('labels: obsidian, sync');
  });

  it('round-trips kanban id through the body', () => {
    const d = canonicalToGithubDraft(task);
    expect(parseKanbanIdFromBody(d.body)).toBe('VBC-board-sync-002');
    expect(parseKanbanIdFromBody('no marker')).toBeUndefined();
  });
});

describe('resolveStatusOptionId (FAILED→Blocked 옵션 부재 폴백)', () => {
  const options = { Backlog: 'a1', Ready: 'b2', 'In Progress': 'c3', 'In Review': 'd4', Done: 'e5' };

  it('resolves a present option directly', () => {
    expect(resolveStatusOptionId('Ready', options)).toBe('b2');
  });

  it('falls back to In Review when option is absent (e.g. Blocked)', () => {
    expect(resolveStatusOptionId('Blocked', options)).toBe('d4');
  });

  it('falls back to Backlog when neither present', () => {
    expect(resolveStatusOptionId('Nonexistent', { Backlog: 'a1' })).toBe('a1');
  });
});
