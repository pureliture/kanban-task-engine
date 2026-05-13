import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { collectBoardProjection, reconcileBoard } from '../src';
import { makePhase3Vault, moveCardToLane } from './helpers/phase3-vault';

describe('board reconciliation', () => {
  it('reports a board lane movement as a dry-run proposal', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({
      vaultRoot,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T10:00:00.000Z',
    });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));

    const result = await reconcileBoard({
      vaultRoot,
      space: 'vibe-coding',
      apply: false,
      now: '2026-05-13T10:05:00.000Z',
    });

    expect(result.conflicts).toEqual([]);
    expect(result.proposals).toEqual([
      expect.objectContaining({
        issueId: 'VC-001',
        currentStatus: 'TODO',
        proposedStatus: 'READY',
        recordedStatus: 'TODO',
        boardLane: 'READY',
      }),
    ]);
  });

  it('fails duplicate metadata ids', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({ vaultRoot, space: 'vibe-coding' });
    const duplicate = projection.boardMarkdown.replace(
      '## READY\n\n',
      `## READY\n\n${projection.boardMarkdown.match(/- \[ \].*VC-001.*\n/)?.[0] ?? ''}`,
    );
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, duplicate);

    const result = await reconcileBoard({ vaultRoot, space: 'vibe-coding', apply: false });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ issueId: 'VC-001', kind: 'duplicate-card' }),
    ]);
  });

  it('fails stale checksum conflicts', async () => {
    const vaultRoot = await makePhase3Vault({ status: 'TODO' });
    const projection = await collectBoardProjection({
      vaultRoot,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T10:00:00.000Z',
    });
    await fs.mkdir(path.dirname(projection.boardPath), { recursive: true });
    await fs.writeFile(projection.boardPath, moveCardToLane(projection.boardMarkdown, 'VC-001', 'READY'));
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md');
    await fs.writeFile(issuePath, (await fs.readFile(issuePath, 'utf8')).replace('title: Ready item', 'title: Changed elsewhere'));

    const result = await reconcileBoard({ vaultRoot, space: 'vibe-coding', apply: false });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ issueId: 'VC-001', kind: 'stale-checksum' }),
    ]);
  });
});
