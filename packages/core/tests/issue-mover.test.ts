import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { moveIssueStatus } from '../src/movement/issue-mover';
import { makePhase3Vault } from './helpers/phase3-vault';

describe('issue mover', () => {
  it('dry-runs a legal transition without writing the file', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md');
    const before = await fs.readFile(issuePath, 'utf8');

    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'READY',
      dryRun: true,
      now: '2026-05-13T10:00:00.000Z',
      reason: 'operator selected item',
    });

    expect(result).toMatchObject({
      issueId: 'VC-001',
      oldStatus: 'TODO',
      newStatus: 'READY',
      changed: true,
      dryRun: true,
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
    });
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toBe(before);
  });

  it('applies a legal transition and appends a log entry', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });

    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'READY',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
      reason: 'operator selected item',
    });

    expect(result.changed).toBe(true);
    const content = await fs.readFile(path.join(vaultRoot, result.relativePath), 'utf8');
    expect(content).toContain('status: READY');
    expect(content).toContain('updated: 2026-05-13T10:00:00.000Z');
    expect(content).toContain('- 2026-05-13T10:00:00.000Z move: TODO -> READY (operator selected item)');
  });

  it('rejects illegal transitions before writing', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'READY' });
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md');
    const before = await fs.readFile(issuePath, 'utf8');

    await expect(moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'DONE',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
    })).rejects.toThrow('Invalid transition: READY -> DONE for issue VC-001');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toBe(before);
  });

  it('sets completed only when moving to DONE', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'REVIEW' });

    const result = await moveIssueStatus({
      vaultRoot,
      issueId: 'VC-001',
      targetStatus: 'DONE',
      dryRun: false,
      now: '2026-05-13T10:00:00.000Z',
    });

    const content = await fs.readFile(path.join(vaultRoot, result.relativePath), 'utf8');
    expect(content).toContain('completed: 2026-05-13T10:00:00.000Z');
  });
});
