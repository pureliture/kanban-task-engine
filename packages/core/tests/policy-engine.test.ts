import { describe, it, expect, vi } from 'vitest';
import { PolicyEngine } from '../src/policy-engine';
import { StateMachine } from '../src/state-machine';
import { EventBus } from '../src/event-bus';
import { CanonicalTaskModel } from '../src/types';

describe('PolicyEngine', () => {
  const baseTask: CanonicalTaskModel = {
    task_ref: { provider: 'local', external_key: 'ws', external_id: 'T-1' },
    summary: 'Test',
    workflow: { normalized_status: 'BACKLOG', raw_status: 'Backlog', raw_status_category: 'BACKLOG' },
    classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
    ownership: { assignee: '', reporter: '' },
    planning: {},
    automation: { policy_id: 'default', on_enter: ['ACTIVE'], on_exit: [], execution_profile: 'standard' },
    sync: { last_synced_at: '2026-01-01T00:00:00Z', last_source: 'local' },
  };

  it('evaluates enter rules on transition', async () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);
    const handler = vi.fn();

    engine.addRule({
      id: 'rule-1',
      toStatus: 'ACTIVE',
      action: 'enter',
      handler,
    });

    await engine.onTransition(baseTask, 'ACTIVE');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('evaluates exit rules on transition', async () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);
    const handler = vi.fn();

    engine.addRule({
      id: 'exit-rule',
      fromStatus: 'BACKLOG',
      action: 'exit',
      handler,
    });

    await engine.onTransition(baseTask, 'SELECTED');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('performs state transition during onTransition', async () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);

    const result = await engine.onTransition(baseTask, 'ACTIVE');
    expect(result.workflow.normalized_status).toBe('ACTIVE');
  });

  it('removes rules by id', () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);

    engine.addRule({ id: 'r1', action: 'enter', handler: vi.fn() });
    engine.addRule({ id: 'r2', action: 'enter', handler: vi.fn() });
    engine.removeRule('r1');
    expect(engine.getRules()).toHaveLength(1);
    expect(engine.getRules()[0].id).toBe('r2');
  });

  it('wildcard rules match when fromStatus/toStatus is undefined', async () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);
    const handler = vi.fn();

    engine.addRule({
      id: 'wildcard',
      action: 'enter',
      handler, // no toStatus = matches all enter transitions
    });

    await engine.onTransition(baseTask, 'ACTIVE');
    expect(handler).toHaveBeenCalled();
  });

  it('emits policy:error when handler throws', async () => {
    const sm = new StateMachine();
    const bus = new EventBus();
    const engine = new PolicyEngine(sm, bus);
    const errorHandler = vi.fn();

    bus.on('policy:error', errorHandler);
    engine.addRule({
      id: 'bad-rule',
      action: 'enter',
      handler: () => { throw new Error('fail'); },
    });

    await engine.onTransition(baseTask, 'ACTIVE');
    expect(errorHandler).toHaveBeenCalled();
  });
});