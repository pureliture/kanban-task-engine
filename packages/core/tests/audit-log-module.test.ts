import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createAuditLogModule } from '../src/modules/audit-log-module';

describe('audit log module', () => {
  it('writes one JSONL event', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-events-'));
    const module = createAuditLogModule(path.join(dir, 'events.jsonl'));
    await module.run({
      values: { event: { type: 'issue.transitioned', issueId: 'issue-1' } },
      policy: { allowedSideEffects: ['writeEvent'] },
    });
    const content = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf-8');
    expect(content).toContain('"type":"issue.transitioned"');
  });
});
