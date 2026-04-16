import { describe, it, expect } from 'vitest';
import { IdResolver } from '../src/id-resolver';
import { CanonicalTaskModel } from '../src/types';

describe('IdResolver', () => {
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

  it('resolves task ref to string', () => {
    const resolver = new IdResolver();
    const result = resolver.resolveRef({ provider: 'local', external_key: 'ws', external_id: 'T-1' });
    expect(result).toBe('local:ws:T-1');
  });

  it('parses ref string back to TaskRef', () => {
    const resolver = new IdResolver();
    const result = resolver.parseRef('github:my-repo:42');
    expect(result).toEqual({ provider: 'github', external_key: 'my-repo', external_id: '42' });
  });

  it('handles external_id with colons', () => {
    const resolver = new IdResolver();
    const result = resolver.parseRef('jira:project:OC-123:sub');
    expect(result).toEqual({ provider: 'jira', external_key: 'project', external_id: 'OC-123:sub' });
  });

  it('throws on invalid format', () => {
    const resolver = new IdResolver();
    expect(() => resolver.parseRef('invalid')).toThrow('Invalid task reference format');
  });

  it('throws on invalid provider', () => {
    const resolver = new IdResolver();
    expect(() => resolver.parseRef('slack:ws:T-1')).toThrow('Invalid provider');
  });

  it('registers and looks up tasks', () => {
    const resolver = new IdResolver();
    resolver.register(baseTask);
    expect(resolver.lookup('local', 'ws', 'T-1')).toEqual(baseTask.task_ref);
  });

  it('clears cache', () => {
    const resolver = new IdResolver();
    resolver.register(baseTask);
    resolver.clear();
    expect(resolver.lookup('local', 'ws', 'T-1')).toBeUndefined();
  });
});