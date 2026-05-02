import { describe, it, expect } from 'vitest';
import { StateMachine } from '../src/state-machine';
import { CanonicalTaskModel, NormalizedStatus } from '../src/types';

describe('StateMachine', () => {
  const sm = new StateMachine();

  describe('valid transitions', () => {
    it('allows TODO -> READY', () => {
      expect(sm.canTransition('TODO', 'READY')).toBe(true);
    });

    it('allows READY -> RUNNING', () => {
      expect(sm.canTransition('READY', 'RUNNING')).toBe(true);
    });

    it('allows RUNNING -> REVIEW', () => {
      expect(sm.canTransition('RUNNING', 'REVIEW')).toBe(true);
    });

    it('allows RUNNING -> FAILED', () => {
      expect(sm.canTransition('RUNNING', 'FAILED')).toBe(true);
    });

    it('allows REVIEW -> DONE', () => {
      expect(sm.canTransition('REVIEW', 'DONE')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects TODO -> DONE', () => {
      expect(sm.canTransition('TODO', 'DONE')).toBe(false);
    });

    it('rejects DONE -> READY', () => {
      expect(sm.canTransition('DONE', 'READY')).toBe(false);
    });

    it('rejects FAILED -> DONE', () => {
      expect(sm.canTransition('FAILED', 'DONE')).toBe(false);
    });

    it('rejects TODO -> FAILED as a default transition', () => {
      expect(sm.canTransition('TODO', 'FAILED')).toBe(false);
    });

    it('rejects REVIEW -> FAILED as a default transition', () => {
      expect(sm.canTransition('REVIEW', 'FAILED')).toBe(false);
    });
  });

  describe('task transition', () => {
    const baseTask: CanonicalTaskModel = {
      task_ref: { provider: 'local', external_key: 'workspace-claude', external_id: 'OC-001' },
      summary: 'Test task',
      workflow: { normalized_status: 'TODO', raw_status: 'TODO', raw_status_category: 'TODO' },
      classification: { issue_type: 'Task', priority: 'High', labels: [], component: [] },
      ownership: { assignee: 'claude', reporter: 'user' },
      planning: {},
      automation: { policy_id: 'default', on_enter: ['READY'], on_exit: [], execution_profile: 'standard' },
      sync: { last_synced_at: '2026-04-16T10:00:00Z', last_source: 'local' },
    };

    it('transitions task from TODO to READY', () => {
      const result = sm.transition(baseTask, 'READY');
      expect(result.workflow.normalized_status).toBe('READY');
      expect(result.updated).toBeDefined();
    });

    it('throws on invalid transition', () => {
      expect(() => sm.transition(baseTask, 'DONE')).toThrow('Invalid transition');
    });

    it('sets completed date on DONE', () => {
      const reviewTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'REVIEW' as NormalizedStatus } };
      const result = sm.transition(reviewTask, 'DONE');
      expect(result.completed).toBeDefined();
    });

    it('does not set completed date on FAILED', () => {
      const runningTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'RUNNING' as NormalizedStatus } };
      const result = sm.transition(runningTask, 'FAILED');
      expect(result.completed).toBeUndefined();
    });

    it('does not mutate the original task object', () => {
      sm.transition(baseTask, 'READY');
      expect(baseTask.workflow.normalized_status).toBe('TODO');
    });

    it('updates raw_status and raw_status_category on transition', () => {
      const result = sm.transition(baseTask, 'READY');
      expect(result.workflow.raw_status).toBe('READY');
      expect(result.workflow.raw_status_category).toBe('READY');
    });

    it('updates raw_status and raw_status_category for RUNNING', () => {
      const readyTask = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'READY' as NormalizedStatus } };
      const result = sm.transition(readyTask, 'RUNNING');
      expect(result.workflow.raw_status).toBe('RUNNING');
      expect(result.workflow.raw_status_category).toBe('IN_PROGRESS');
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for RUNNING', () => {
      const transitions = sm.getValidTransitions('RUNNING');
      expect(transitions).toContain('REVIEW');
      expect(transitions).toContain('FAILED');
    });
  });

  describe('terminal status', () => {
    it('identifies DONE as terminal', () => {
      expect(sm.isTerminalStatus('DONE')).toBe(true);
    });

    it('identifies FAILED as terminal', () => {
      expect(sm.isTerminalStatus('FAILED')).toBe(true);
    });

    it('identifies RUNNING as non-terminal', () => {
      expect(sm.isTerminalStatus('RUNNING')).toBe(false);
    });
  });
});
