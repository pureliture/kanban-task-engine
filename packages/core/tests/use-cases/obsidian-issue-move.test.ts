import { describe, expect, it, vi } from 'vitest';
import { moveObsidianIssueStatus } from '../../src/use-cases/obsidian-issue-move';
import { makePhase3Vault } from '../helpers/phase3-vault';
import { NodeFsVaultPort } from '../../src/ports/node-fs-vault-port';

describe('moveObsidianIssueStatus', () => {
  it('moves the active issue through VaultPort.process and syncs the generated board', async () => {
    const root = await makePhase3Vault({ status: 'TODO' });
    const vault = new NodeFsVaultPort(root);
    const processSpy = vi.spyOn(vault, 'process');

    const result = await moveObsidianIssueStatus({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      relativeIssuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
      targetStatus: 'READY',
      now: '2026-05-15T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      issueId: 'VC-001',
      oldStatus: 'TODO',
      newStatus: 'READY',
      changed: true,
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
      boardPath: 'boards/vibe-coding.md',
    });
    expect(processSpy).toHaveBeenCalledWith(
      'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
      expect.any(Function),
    );
    await expect(vault.read(result.relativePath)).resolves.toContain('status: READY');
    await expect(vault.read('boards/vibe-coding.md')).resolves.toContain('VC-001');
  });

  it('rejects invalid transitions before writing', async () => {
    const root = await makePhase3Vault({ status: 'READY' });
    const vault = new NodeFsVaultPort(root);
    const before = await vault.read('issues/vibe-coding/kanban-task-engine/VC-001-ready.md');

    await expect(moveObsidianIssueStatus({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      relativeIssuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
      targetStatus: 'DONE',
      now: '2026-05-15T00:00:00.000Z',
    })).rejects.toThrow('Invalid transition: READY -> DONE for issue VC-001');
    await expect(vault.read('issues/vibe-coding/kanban-task-engine/VC-001-ready.md')).resolves.toBe(before);
  });
});
