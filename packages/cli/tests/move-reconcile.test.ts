import fs from 'fs/promises';
import path from 'path';
import { collectBoardProjection } from '@kanban-task-engine/core';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src';
import { makePhase3Vault, moveCardToLane } from '../../core/tests/helpers/phase3-vault';

describe('move and reconcile-board CLI', () => {
  it('moves an issue through CLI', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });

    const result = await runCli(['move', 'VC-001', 'READY'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('moved VC-001 TODO -> READY');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: READY');
  });

  it('moves an issue within the selected space when another space has the same id', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO', duplicateIdInOtherSpace: true });

    const result = await runCli(['move', 'VC-001', 'READY', '--space', 'vibe-coding'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('moved VC-001 TODO -> READY');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: READY');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/home/general/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: TODO');
  });

  it('dry-runs board reconciliation by default', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await runCli(['reconcile-board', '--space', 'vibe-coding'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('board changes for vibe-coding');
    expect(result.stdout).toContain('VC-001 TODO -> READY');
  });

  it('applies board reconciliation only with --apply', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await runCli(['reconcile-board', '--space', 'vibe-coding', '--apply'], {
      vaultRoot,
      vaultRootExplicit: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('applied board changes for vibe-coding');
    await expect(fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), 'utf8'))
      .resolves.toContain('status: READY');
  });
});
