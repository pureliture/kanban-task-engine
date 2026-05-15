import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, promoteRawBoardCard } from '../../src';
import { seedVibeCodingRegistry } from '../support/seed-vault';

describe('promoteRawBoardCard', () => {
  it('requires explicit confirmation before creating a canonical issue', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-raw-card-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);
    await vault.create('boards/vibe-coding.md', [
      '---',
      'kanban-plugin: board',
      '---',
      '',
      '## TODO',
      '',
      '- [ ] Draft card from board',
      '',
      '%% kanban:settings',
      '{}',
      '%%',
      '',
    ].join('\n'));

    await expect(promoteRawBoardCard({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Draft card from board',
      lane: 'TODO',
      confirmed: false,
    })).rejects.toThrow('Raw card promotion requires explicit confirmation');

    await expect(readdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'))).resolves.toEqual([]);
  });

  it('rejects non-TODO lanes for Phase 3 MVP promotion', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-raw-card-lane-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);

    await expect(promoteRawBoardCard({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Ready lane draft',
      lane: 'READY',
      confirmed: true,
    })).rejects.toThrow('Raw card promotion only supports TODO lane in Phase 3 MVP');
    await expect(readdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'))).resolves.toEqual([]);
  });
});
