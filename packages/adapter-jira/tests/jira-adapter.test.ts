import { describe, expect, it, vi } from 'vitest';
import { JiraAdapter } from '../src/jira-adapter';

describe('JiraAdapter', () => {
  it('returns payload without network call in dry-run mode', async () => {
    const transport = vi.fn();
    const adapter = new JiraAdapter({ baseUrl: 'https://jira.example', token: 'token', dryRun: true }, transport);
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
});