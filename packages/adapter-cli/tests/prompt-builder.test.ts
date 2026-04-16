import { describe, it, expect } from 'vitest';
import { buildExecutionPrompt } from '../src/prompt-builder';
import { CanonicalTaskModel, NormalizedStatus } from '@kanban-task-engine/core';

describe('prompt-builder', () => {
  const baseTask: CanonicalTaskModel = {
    task_ref: { provider: 'local', external_key: 'ws', external_id: 'OC-001' },
    summary: 'Implement login page',
    workflow: { normalized_status: 'BACKLOG', raw_status: 'Backlog', raw_status_category: 'BACKLOG' },
    classification: { issue_type: 'Story', priority: 'High', labels: ['frontend', 'auth'], component: ['web'] },
    ownership: { assignee: 'claude', reporter: 'pm' },
    planning: { sprint: 'Sprint-1', estimate: { story_points: 3 } },
    automation: { policy_id: 'default', on_enter: ['ACTIVE'], on_exit: [], execution_profile: 'standard', workspace: 'ws' },
    sync: { last_synced_at: '2026-04-16T10:00:00Z', last_source: 'local' },
  };

  it('includes task summary in prompt', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'BACKLOG', to: 'ACTIVE' });
    expect(prompt).toContain('Implement login page');
  });

  it('includes status transition', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'BACKLOG', to: 'ACTIVE' });
    expect(prompt).toContain('BACKLOG');
    expect(prompt).toContain('ACTIVE');
  });

  it('includes context when enabled', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'BACKLOG', to: 'ACTIVE' }, { includeContext: true });
    expect(prompt).toContain('OC-001');
    expect(prompt).toContain('Story');
    expect(prompt).toContain('High');
    expect(prompt).toContain('frontend');
  });

  it('excludes context when disabled', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'BACKLOG', to: 'ACTIVE' }, { includeContext: false });
    expect(prompt).not.toContain('OC-001');
  });

  it('includes automation policy for on_enter transitions', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'BACKLOG', to: 'ACTIVE' });
    expect(prompt).toContain('Automation Policy');
    expect(prompt).toContain('default');
  });

  it('provides transition-specific instructions', () => {
    const prompt = buildExecutionPrompt(baseTask, { from: 'ACTIVE', to: 'REVIEW' });
    expect(prompt).toContain('review');
  });

  it('falls back to generic instruction for unknown transitions', () => {
    const task = { ...baseTask };
    const prompt = buildExecutionPrompt(task, { from: 'DONE' as NormalizedStatus, to: 'ACTIVE' as NormalizedStatus });
    expect(prompt).toContain('Proceed with this task');
  });
});