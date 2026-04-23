import { describe, expect, it } from 'vitest';
import { createManualCommandTrigger } from '../src/modules/manual-command-trigger';
import { createStateTransitionModule } from '../src/modules/state-transition-module';
import { ModuleRunner } from '../src/runtime/module-runner';

describe('home execution flow modules', () => {
  it('turns explicit run command into RUNNING transition request', async () => {
    const runner = new ModuleRunner([
      createManualCommandTrigger(),
      createStateTransitionModule(),
    ]);

    const result = await runner.run({
      values: {
        command: 'run issue-auth-refresh-001',
        issue: {
          task_ref: { provider: 'local', external_key: 'auth-platform', external_id: 'issue-auth-refresh-001' },
          workflow: { normalized_status: 'READY', raw_status: 'READY', raw_status_category: 'READY' },
          summary: '토큰 갱신 플로우 개선',
          classification: { issue_type: 'Story', priority: 'High', labels: [], component: [] },
          ownership: { assignee: '', reporter: '' },
          planning: {},
          automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
          sync: { last_synced_at: '2026-04-20', last_source: 'local' },
        },
      },
      policy: { allowedSideEffects: ['writeIssue'] },
    });

    expect((result.values.issue as any).workflow.normalized_status).toBe('RUNNING');
  });
});
