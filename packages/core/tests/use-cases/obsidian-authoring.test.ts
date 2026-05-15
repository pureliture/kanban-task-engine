import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, createObsidianTask, type VaultPort } from '../../src';

async function seedRegistry(root: string): Promise<void> {
  await mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(root, 'issues/vibe-coding/epics'), { recursive: true });
  await mkdir(path.join(root, 'boards'), { recursive: true });
  await writeFile(path.join(root, 'registry.yaml'), [
    'spaces:',
    '  vibe-coding:',
    '    type: container',
    '    idPrefix: VC',
    '    issues: issues/vibe-coding',
    '    epics: issues/vibe-coding/epics',
    '    board: boards/vibe-coding.md',
    '    epicBoard: boards/vibe-coding-epics.md',
    '    projects:',
    '      kanban-task-engine:',
    '        path: issues/vibe-coding/kanban-task-engine',
    '',
  ].join('\n'));
}

describe('createObsidianTask', () => {
  it('creates a canonical issue and keeps board sync as a separate structured result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-'));
    await seedRegistry(root);
    const vault = new NodeFsVaultPort(root);

    const result = await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    });

    expect(result.issueId).toBe('VC-001');
    expect(result.issuePath).toBe('issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md');
    expect(result.boardPath).toBeUndefined();
    expect(await readFile(path.join(root, result.issuePath), 'utf8')).toContain('status: TODO');
  });

  it('preserves created issue details when board sync fails after authoring succeeds', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-sync-error-'));
    await seedRegistry(root);

    let thrown: unknown;
    try {
      await createObsidianTask({
        vault: new FailingBoardSyncVaultPort(root),
        vaultRoot: root,
        space: 'vibe-coding',
        project: 'kanban-task-engine',
        title: 'Use Obsidian as primary task UX',
        priority: 'P2',
        executor: 'human',
        now: new Date('2026-05-15T00:00:00.000Z'),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'ObsidianTaskBoardSyncError',
      issueId: 'VC-001',
      issuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md',
      warnings: [],
      cause: expect.any(Error),
    });
    await expect(readFile(
      path.join(root, 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md'),
      'utf8',
    )).resolves.toContain('status: TODO');
  });

  it('rejects mismatched custom VaultPort roots before creating an issue', async () => {
    const rootA = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-root-a-'));
    const rootB = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-root-b-'));
    await seedRegistry(rootA);

    await expect(createObsidianTask({
      vault: new RecordingVaultPort(rootB),
      vaultRoot: rootA,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    })).rejects.toThrow(/vaultRoot.*VaultPort root/i);
    await expect(readFile(
      path.join(rootA, 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md'),
      'utf8',
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

class FailingBoardSyncVaultPort implements VaultPort {
  constructor(readonly root: string) {}

  async read(): Promise<string> {
    return '';
  }

  async exists(): Promise<boolean> {
    return true;
  }

  async create(): Promise<void> {
    throw new Error('board backend failed');
  }

  async process(): Promise<string> {
    throw new Error('board backend failed');
  }

  async listMarkdownFiles(): Promise<string[]> {
    return [];
  }
}

class RecordingVaultPort implements VaultPort {
  constructor(readonly root: string) {}

  async read(): Promise<string> {
    return '';
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async create(): Promise<void> {}

  async process(): Promise<string> {
    return '';
  }

  async listMarkdownFiles(): Promise<string[]> {
    return [];
  }
}
