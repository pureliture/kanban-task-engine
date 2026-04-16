import { describe, it, expect } from 'vitest';
import { computeChecksum, hasChanged } from '../src/checksum';
import { CanonicalTaskModel } from '../src/types';

describe('checksum', () => {
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

  it('computes a deterministic checksum', () => {
    const cs1 = computeChecksum(baseTask);
    const cs2 = computeChecksum(baseTask);
    expect(cs1).toBe(cs2);
  });

  it('detects changes via hasChanged', () => {
    expect(hasChanged(baseTask)).toBe(true); // no checksum set
  });

  it('returns false for unchanged task with checksum', () => {
    const cs = computeChecksum(baseTask);
    const taskWithChecksum = { ...baseTask, sync: { ...baseTask.sync, checksum: cs } };
    expect(hasChanged(taskWithChecksum)).toBe(false);
  });

  it('detects modified task', () => {
    const cs = computeChecksum(baseTask);
    const taskWithChecksum = { ...baseTask, sync: { ...baseTask.sync, checksum: cs } };
    const modified = { ...taskWithChecksum, summary: 'Modified' };
    expect(hasChanged(modified)).toBe(true);
  });

  it('checksum changes when workflow status changes', () => {
    const cs1 = computeChecksum(baseTask);
    const active = { ...baseTask, workflow: { ...baseTask.workflow, normalized_status: 'ACTIVE' as const, raw_status: 'In Progress', raw_status_category: 'IN_PROGRESS' as const } };
    const cs2 = computeChecksum(active);
    expect(cs1).not.toBe(cs2);
  });
});