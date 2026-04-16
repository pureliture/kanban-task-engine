import { describe, it, expect } from 'vitest';
import { StateMachine } from '../src/state-machine';
import { CanonicalTaskModel, NormalizedStatus } from '../src/types';

describe('StateMachine', () => {
  const sm = new StateMachine();

  describe('valid transitions', () => {
    it('allows BACKLOG → SELECTED', () => {
      expect(sm.canTransition('BACKLOG', 'SELECTED')).toBe(true);
    });

    it('allows ACTIVE → REVIEW', () => {
      expect(sm.canTransition('ACTIVE', 'REVIEW')).toBe(true);
    });

    it('allows ACTIVE → DONE', () => {
      expect(sm.canTransition('ACTIVE', 'DONE')).toBe(true);
    });

    it('allows BLOCKED → ACTIVE', () => {
      expect(sm.canTransition('BLOCKED', 'ACTIVE')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects BACKLOG → DONE', () => {
      expect(sm.canTransition('BACKLOG', 'DONE')).toBe(false);
    });

    it('rejects DONE → ACTIVE', () => {
      expect(sm.canTransition('DONE', 'ACTIVE')).toBe(false);
    });

    it('rejects CANCELLED → ACTIVE', () => {
      expect(sm.canTransition('CANCELLED', 'ACTIVE')).toBe(false);
    });
  });

  describe('task transition', () => {
    const baseTask: CanonicalTaskModel = {
      task_ref: { provider: 'local', external_key: 'workspace-claude', external_id: 'OC-001' },
      summary: 'Test task',
      workflow: { normalized_status: 'BACKLOG', raw_status: 'Backlog', raw_status_category: 'BACKLOG' },
      classification: { issue_type: 'Task', priority: 'High', labels: [], component: [] },
      ownership: { assignee: 'claude', reporter: 'user' },
      planning: {},
      automation: { policy_id: 'default', on_enter: ['ACTIVE'], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-16T10:00:00Z', last_source: 'local' },
    };

    it('transitions task from BACKLOG to ACTIVE', () => {
      const result = sm.transition(baseTask, 'ACTIVE');
      expect(result.workflow.normalized_status).toBe('ACTIVE');
      expect(result.updated).toBeDefined();
    });

    it('throws on invalid transition', () => {
      expect(() => sm.transition(baseTask, 'DONE')).toThrow('Invalid transition');
    });

    it('sets completed date on DONE', () => {
      const activeTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'ACTIVE' as NormalizedStatus } };
      const result = sm.transition(activeTask, 'DONE');
      expect(result.completed).toBeDefined();
    });

    it('sets completed date on CANCELLED', () => {
      const activeTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'ACTIVE' as NormalizedStatus } };
      const result = sm.transition(activeTask, 'CANCELLED');
      expect(result.completed).toBeDefined();
    });

    it('does not mutate the original task object', () => {
      sm.transition(baseTask, 'ACTIVE');
      expect(baseTask.workflow.normalized_status).toBe('BACKLOG');
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for ACTIVE', () => {
      const transitions = sm.getValidTransitions('ACTIVE');
      expect(transitions).toContain('BLOCKED');
      expect(transitions).toContain('REVIEW');
      expect(transitions).toContain('DONE');
      expect(transitions).toContain('CANCELLED');
    });
  });

  describe('terminal status', () => {
    it('identifies DONE as terminal', () => {
      expect(sm.isTerminalStatus('DONE')).toBe(true);
    });

    it('identifies CANCELLED as terminal', () => {
      expect(sm.isTerminalStatus('CANCELLED')).toBe(true);
    });

    it('identifies ACTIVE as non-terminal', () => {
      expect(sm.isTerminalStatus('ACTIVE')).toBe(false);
    });
  });
});