import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { moveCardToLane, makePhase3Vault } from '../../core/tests/helpers/phase3-vault';
import { collectBoardProjection } from '@kanban-task-engine/core';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

async function seedRegistryOnlyVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-compat-'));
  await fs.mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(root, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.writeFile(path.join(root, 'registry.yaml'), `spaces:
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
`);
  return root;
}

describe('CLI compatibility after Obsidian use-case extraction', () => {
  it('keeps new CLI behavior stable for seed tasks', async () => {
    const vaultRoot = await seedRegistryOnlyVault();
    const context = createCliContext({ KANBAN_HOME: vaultRoot, HOME: '/home/user' });
    const created = await runCli([
      'new',
      '--space',
      'vibe-coding',
      '--project',
      'kanban-task-engine',
      'CLI compatibility task',
    ], context);

    expect(created.exitCode).toBe(0);
    expect(created.stdout).toContain('created VC-001');
    const createdPathMatch = /^created VC-001 (issues\/vibe-coding\/kanban-task-engine\/VC-001-[^\s]+\.md)$/m.exec(created.stdout.trim());
    expect(createdPathMatch).not.toBeNull();
    const createdIssuePath = createdPathMatch?.[1];
    await expect(fs.readFile(path.join(vaultRoot, createdIssuePath as string), 'utf8'))
      .resolves.toContain('id: VC-001');
  });

  it('keeps board --write behavior stable for space output and files', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const context = createCliContext({ KANBAN_HOME: vaultRoot, HOME: '/home/user' });

    const board = await runCli(['board', '--write', '--space', 'vibe-coding'], context);
    expect(board.exitCode).toBe(0);
    expect(board.stdout).toContain('wrote vibe-coding board');
    expect(board.stdout).toContain('wrote vibe-coding index');
    await expect(fs.readFile(path.join(vaultRoot, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-plugin: board');
    await expect(fs.readFile(path.join(vaultRoot, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('```dataview');
  });

  it('keeps reconcile-board default dry-run behavior stable', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(
      projection.boardPath,
      moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'),
    );
    const context = createCliContext({ KANBAN_HOME: vaultRoot, HOME: '/home/user' });
    const reconciled = await runCli(['reconcile-board', '--space', 'vibe-coding'], context);

    expect(reconciled.exitCode).toBe(0);
    expect(reconciled.stdout).toContain('board changes for vibe-coding');
    expect(reconciled.stdout).toContain('VC-001 TODO -> READY');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: TODO');
  });

  it('keeps move output contract for moved status', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const context = createCliContext({ KANBAN_HOME: vaultRoot, HOME: '/home/user' });
    const moved = await runCli(['move', 'VC-001', 'READY', '--space', 'vibe-coding'], context);

    expect(moved.exitCode).toBe(0);
    expect(moved.stdout).toContain('moved VC-001 TODO -> READY');
  });
});
