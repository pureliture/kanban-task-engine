import { describe, expect, it } from 'vitest';
import {
  computeBoardProjectionChecksum,
  renderObsidianBoardMarkdown,
  type ObsidianBoardIssue,
} from '../src/boards/obsidian-board-renderer';

const generatedAt = '2026-06-20T01:00:00.000Z';

const base: ObsidianBoardIssue = {
  id: 'VC-001',
  title: '예시 카드',
  type: 'task',
  status: 'READY',
  priority: 'P1',
  project: 'kanban-task-engine',
  updated: '2026-06-20T00:00:00.000Z',
  relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001.md',
};

describe('board enrichment 뱃지 (D3 read-only mirror)', () => {
  it('renders a 🧠 badge when enrichment is present', () => {
    const withEnrichment: ObsidianBoardIssue = {
      ...base,
      enrichment: { source: 'neurons-mirror', decisionCount: 2, driftCount: 1, incidentCount: 3 },
    };
    const md = renderObsidianBoardMarkdown({ space: 'vibe-coding', generatedAt, issues: [withEnrichment] });
    expect(md).toContain('🧠');
    expect(md).toContain('d2');
    expect(md).toContain('drift1');
    expect(md).toContain('inc3');
  });

  it('omits the badge when enrichment is absent', () => {
    const md = renderObsidianBoardMarkdown({ space: 'vibe-coding', generatedAt, issues: [base] });
    expect(md).not.toContain('🧠');
  });

  it('enrichment does NOT affect checksum (SoT 불침범)', () => {
    const withEnrichment: ObsidianBoardIssue = {
      ...base,
      enrichment: { source: 'neurons-mirror', decisionCount: 5, driftCount: 9 },
    };
    expect(computeBoardProjectionChecksum(withEnrichment)).toBe(computeBoardProjectionChecksum(base));
  });

  it('omits badge when all counts are zero/undefined', () => {
    const zero: ObsidianBoardIssue = { ...base, enrichment: { source: 'neurons-mirror' } };
    const md = renderObsidianBoardMarkdown({ space: 'vibe-coding', generatedAt, issues: [zero] });
    expect(md).not.toContain('🧠');
  });
});
