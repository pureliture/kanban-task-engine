import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NodeFsVaultPort,
  applyObsidianBoardMoves,
  createObsidianTask,
  previewObsidianBoardMoves,
  type VaultPort,
} from '../../src';
import { seedVibeCodingRegistry } from '../support/seed-vault';

describe('obsidian board reconcile use-cases', () => {
  it('does not apply any move when duplicate issue id exists in tasks and epics for a space', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-reconcile-duplicate-issue-'));
    await seedVibeCodingRegistry(root);
    const vault = new RecordingVaultPort(new NodeFsVaultPort(root));
    const task = await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Duplicate issue id source',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: true,
    });

    await writeFile(path.join(root, 'issues/vibe-coding/epics/VC-001-epic-duplicate.md'), epicMarkdown('VC-001', 'Duplicate epic'));
    vault.clearCalls();
    await vault.process(
      'boards/vibe-coding.md',
      content => content.replace('## TODO\n\n- [ ]', '## TODO\n\n## READY\n\n- [ ]'),
    );
    vault.clearCalls();

    const taskBefore = await vault.read(task.issuePath);
    const preview = await previewObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
    });

    expect(preview.changes).toHaveLength(0);
    expect(preview.conflicts).toContainEqual(expect.objectContaining({
      kind: 'duplicate-issue',
      issueId: 'VC-001',
    }));

    const applied = await applyObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      expectedChanges: preview.changes,
      now: '2026-05-15T00:01:00.000Z',
    });

    expect(applied.applied).toHaveLength(0);
    expect(applied.conflicts).toContainEqual(expect.objectContaining({
      kind: 'duplicate-issue',
      issueId: 'VC-001',
    }));
    expect(await vault.read(task.issuePath)).toBe(taskBefore);
    expect(vault.processCallsFor(task.issuePath)).toBe(0);
    expect(vault.processCallsFor('boards/vibe-coding.md')).toBe(0);
  });

  it('previews and applies a board lane move through structured results', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-reconcile-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);
    await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Preview move in Obsidian',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: true,
    });
    await vault.process('boards/vibe-coding.md', content => content.replace('## TODO', '## TODO').replace('## READY\n', '## READY\n'));
    await vault.process('boards/vibe-coding.md', content => content.replace('## TODO\n\n- [ ]', '## TODO\n\n## READY\n\n- [ ]'));

    const preview = await previewObsidianBoardMoves({ vaultRoot: root, space: 'vibe-coding' });

    expect(preview.conflicts).toEqual([]);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]).toMatchObject({ issueId: 'VC-001', currentStatus: 'TODO', proposedStatus: 'READY' });

    const applied = await applyObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      expectedChanges: preview.changes,
      now: '2026-05-15T00:01:00.000Z',
    });

    expect(applied.applied).toHaveLength(1);
    expect(applied.boardPath).toBe('boards/vibe-coding.md');
  });

  it('rejects apply when expected change details differ from the latest preview', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-reconcile-stale-preview-'));
    await seedVibeCodingRegistry(root);
    const vault = new NodeFsVaultPort(root);
    await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Reject stale preview',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: true,
    });
    await vault.process('boards/vibe-coding.md', content => content.replace('## TODO\n\n- [ ]', '## TODO\n\n## READY\n\n- [ ]'));

    const preview = await previewObsidianBoardMoves({ vaultRoot: root, space: 'vibe-coding' });
    const staleExpectedChanges = preview.changes.map(change => ({
      ...change,
      source: 'issues/vibe-coding/kanban-task-engine/VC-001-stale.md',
    }));

    await expect(applyObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      expectedChanges: staleExpectedChanges,
      now: '2026-05-15T00:01:00.000Z',
    })).rejects.toThrow('Board move preview changed before apply; preview again before applying');

    await expect(vault.read(preview.changes[0].relativeIssuePath)).resolves.toContain('status: TODO');
  });

  it('applies issue moves and regenerates board files through the vault port', async () => {
    const { root, vault, preview } = await prepareBoardMove('Use vault process for apply');

    const applied = await applyObsidianBoardMoves({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      expectedChanges: preview.changes,
      now: '2026-05-15T00:01:00.000Z',
    });

    expect(applied.applied).toHaveLength(1);
    expect(vault.processCallsFor(preview.changes[0].relativeIssuePath)).toBe(1);
    expect(vault.processCallsFor('boards/vibe-coding.md')).toBe(1);
    expect(vault.processCallsFor('boards/vibe-coding-epics.md')).toBe(1);
  });

  it('preserves applied move details when board sync fails after issue apply', async () => {
    const { root, vault, preview } = await prepareBoardMove('Preserve applied details on sync failure');
    vault.failWritesFor.add('boards/vibe-coding.md');

    let thrown: unknown;
    try {
      await applyObsidianBoardMoves({
        vault,
        vaultRoot: root,
        space: 'vibe-coding',
        expectedChanges: preview.changes,
        now: '2026-05-15T00:01:00.000Z',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'ObsidianBoardApplySyncError',
      applied: [
        expect.objectContaining({
          issueId: 'VC-001',
          oldStatus: 'TODO',
          newStatus: 'READY',
          relativePath: preview.changes[0].relativeIssuePath,
        }),
      ],
      conflicts: [],
      boardPath: 'boards/vibe-coding.md',
      cause: expect.any(Error),
    });
    expect(vault.processCallsFor(preview.changes[0].relativeIssuePath)).toBe(1);
  });
});

async function prepareBoardMove(title: string): Promise<{
  root: string;
  vault: RecordingVaultPort;
  preview: Awaited<ReturnType<typeof previewObsidianBoardMoves>>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kte-reconcile-vault-port-'));
  await seedVibeCodingRegistry(root);
  const vault = new RecordingVaultPort(new NodeFsVaultPort(root));
  await createObsidianTask({
    vault,
    vaultRoot: root,
    space: 'vibe-coding',
    project: 'kanban-task-engine',
    title,
    now: new Date('2026-05-15T00:00:00.000Z'),
    syncBoard: true,
  });
  await vault.process('boards/vibe-coding.md', content => content.replace('## TODO\n\n- [ ]', '## TODO\n\n## READY\n\n- [ ]'));
  vault.clearCalls();

  return {
    root,
    vault,
    preview: await previewObsidianBoardMoves({ vault, vaultRoot: root, space: 'vibe-coding' }),
  };
}

function epicMarkdown(id: string, title: string): string {
  return [
    '---',
    `id: ${id}`,
    'status: TODO',
    'priority: P1',
    'type: epic',
    `title: ${title}`,
    'project: ""',
    'executor: human',
    'created: 2026-05-13T09:00:00.000Z',
    'updated: 2026-05-13T09:00:00.000Z',
    '---',
    '',
    `# ${id} ${title}`,
    '',
    '## 목표',
    'Keep this test focused.',
    '',
    '## 범위',
    'Duplicate-id regression coverage.',
    '',
    '## 성공 지표',
    '- Duplicate id is detected.',
    '',
    '## 하위 티켓',
    '- placeholder',
    '',
    '## 로그',
    '- Created.',
    '',
  ].join('\n');
}

class RecordingVaultPort implements VaultPort {
  readonly root: string;
  readonly failWritesFor = new Set<string>();
  private readonly processCalls = new Map<string, number>();

  constructor(private readonly inner: NodeFsVaultPort) {
    this.root = inner.root;
  }

  async read(relativePath: string): Promise<string> {
    return this.inner.read(relativePath);
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.inner.exists(relativePath);
  }

  async create(relativePath: string, content: string): Promise<void> {
    if (this.failWritesFor.has(relativePath)) throw new Error(`blocked write: ${relativePath}`);
    await this.inner.create(relativePath, content);
  }

  async process(relativePath: string, updater: (content: string) => string): Promise<string> {
    this.processCalls.set(relativePath, this.processCallsFor(relativePath) + 1);
    if (this.failWritesFor.has(relativePath)) throw new Error(`blocked write: ${relativePath}`);
    return this.inner.process(relativePath, updater);
  }

  async listMarkdownFiles(root?: string): Promise<string[]> {
    return this.inner.listMarkdownFiles(root);
  }

  processCallsFor(relativePath: string): number {
    return this.processCalls.get(relativePath) ?? 0;
  }

  clearCalls(): void {
    this.processCalls.clear();
  }
}
