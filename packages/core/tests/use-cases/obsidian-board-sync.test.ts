import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, createIssue, writeObsidianBoardForSpace, type VaultPort } from '../../src';

async function seedRegistry(root: string): Promise<void> {
  await mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(root, 'issues/vibe-coding/epics'), { recursive: true });
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

describe('writeObsidianBoardForSpace', () => {
  it('writes Obsidian Kanban board and index projections through the vault port', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-'));
    await seedRegistry(root);
    await createIssue({
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    });
    const vault = new NodeFsVaultPort(root);

    const result = await writeObsidianBoardForSpace({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      generatedAt: '2026-05-15T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      boardPath: 'boards/vibe-coding.md',
      indexPath: 'boards/vibe-coding-epics.md',
      issueCount: 1,
    });
    const board = await readFile(path.join(root, result.boardPath), 'utf8');
    expect(board).toContain('kanban-plugin: board');
    expect(board).toContain('## TODO');
    expect(board).toContain('kanban-task-engine:id=VC-001');
    await expect(readFile(path.join(root, result.indexPath), 'utf8')).resolves.toContain('```dataview');
  });

  it('rejects mismatched NodeFsVaultPort roots before writing projection files', async () => {
    const rootA = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-a-'));
    const rootB = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-b-'));
    await seedRegistry(rootA);
    await createIssue({
      vaultRoot: rootA,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    });

    await expect(writeObsidianBoardForSpace({
      vault: new NodeFsVaultPort(rootB),
      vaultRoot: rootA,
      space: 'vibe-coding',
      generatedAt: '2026-05-15T00:00:00.000Z',
    })).rejects.toThrow(/vaultRoot.*VaultPort root/i);
    await expect(readFile(path.join(rootB, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects mismatched custom VaultPort roots before processing or creating projection files', async () => {
    const rootA = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-custom-a-'));
    const rootB = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-custom-b-'));
    await seedRegistry(rootA);
    await createIssue({
      vaultRoot: rootA,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    });
    const vault = new RecordingVaultPort(rootB);

    let thrown: unknown;
    try {
      await writeObsidianBoardForSpace({
        vault,
        vaultRoot: rootA,
        space: 'vibe-coding',
        generatedAt: '2026-05-15T00:00:00.000Z',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/vaultRoot.*VaultPort root/i);
    expect(vault.processCalls).toBe(0);
    expect(vault.createCalls).toBe(0);
  });

  it('does not create over non-missing process errors', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-board-sync-error-'));
    await seedRegistry(root);
    await createIssue({
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    });
    const vault = new ErroringVaultPort(root);

    await expect(writeObsidianBoardForSpace({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      generatedAt: '2026-05-15T00:00:00.000Z',
    })).rejects.toThrow('transient not found in remote cache');
    expect(vault.createCalls).toBe(0);
  });
});

class ErroringVaultPort implements VaultPort {
  readonly root: string;
  createCalls = 0;

  constructor(root: string) {
    this.root = root;
  }

  async read(relativePath: string): Promise<string> {
    return readFile(path.join(this.root, relativePath), 'utf8');
  }

  async exists(): Promise<boolean> {
    return true;
  }

  async create(): Promise<void> {
    this.createCalls += 1;
  }

  async process(): Promise<string> {
    throw new Error('transient not found in remote cache');
  }

  async listMarkdownFiles(): Promise<string[]> {
    return [];
  }
}

class RecordingVaultPort implements VaultPort {
  processCalls = 0;
  createCalls = 0;

  constructor(readonly root: string) {}

  async read(): Promise<string> {
    return '';
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async create(): Promise<void> {
    this.createCalls += 1;
  }

  async process(): Promise<string> {
    this.processCalls += 1;
    return '';
  }

  async listMarkdownFiles(): Promise<string[]> {
    return [];
  }
}
