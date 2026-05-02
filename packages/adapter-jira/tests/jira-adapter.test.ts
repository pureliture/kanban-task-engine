import { describe, expect, it, vi } from 'vitest';
import { JiraAdapter } from '../src/jira-adapter';
import type { RuntimePolicy } from '@kanban-task-engine/core';

const allowJiraPolicy: RuntimePolicy = {
  mode: 'work',
  automationCanMoveIssues: false,
  automationCanStartExecution: false,
  externalSync: 'atlassian-only',
  allowedAdapters: ['jira'],
  deniedAdapters: [],
  allowedExecutionRoots: [],
  writeBack: { allowedFields: ['sync.jira.key'], bodyAllowed: false },
  allowedSideEffects: ['externalRequest'],
};

describe('JiraAdapter', () => {
  it('returns payload without network call in dry-run mode', async () => {
    const transport = vi.fn();
    const adapter = new JiraAdapter({ baseUrl: 'https://jira.example', token: 'token', dryRun: true }, transport, allowJiraPolicy);
    const result = await adapter.createIssue({
      fields: {
        project: { key: 'AUTH' },
        summary: 'Test',
        description: 'Desc',
        issuetype: { name: 'Task' },
        priority: { name: 'Medium' },
        labels: [],
      },
    });
    expect(result.dryRun).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });

  it('requires RuntimePolicy before creating issues', async () => {
    const adapter = new JiraAdapter({ baseUrl: 'https://jira.example', token: 'token', dryRun: true }, vi.fn());
    await expect(adapter.createIssue({
      fields: {
        project: { key: 'AUTH' },
        summary: 'Test',
        description: 'Desc',
        issuetype: { name: 'Task' },
        priority: { name: 'Medium' },
        labels: [],
      },
    })).rejects.toThrow('JiraAdapter requires RuntimePolicy');
  });
});
