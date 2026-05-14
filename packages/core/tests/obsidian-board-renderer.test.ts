import { describe, expect, it } from 'vitest';
import {
  computeBoardProjectionChecksum,
  renderObsidianBoardMarkdown,
  type ObsidianBoardIssue,
} from '../src/boards/obsidian-board-renderer';

const generatedAt = '2026-05-13T01:00:00.000Z';

const issues: ObsidianBoardIssue[] = [
  {
    id: 'VC-001',
    title: 'Top priority ready',
    type: 'task',
    status: 'READY',
    priority: 'P0',
    project: 'kanban-task-engine',
    epic: 'VC-100',
    updated: '2026-05-13T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-top-priority-ready.md',
  },
  {
    id: 'VC-002',
    title: 'Done item',
    type: 'task',
    status: 'DONE',
    priority: 'P2',
    project: 'kanban-task-engine',
    updated: '2026-05-12T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-002-done-item.md',
  },
  {
    id: 'VC-003',
    title: 'A ]] tricky | title\nnext',
    type: 'task',
    status: 'TODO',
    project: 'kanban-task-engine',
    updated: '2026-05-12T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/kanban-task-engine/VC-003-tricky.md',
  },
  {
    id: 'VC-900',
    title: 'Epic should be indexed elsewhere',
    type: 'epic',
    status: 'TODO',
    priority: 'P1',
    project: '',
    updated: '2026-05-11T00:00:00.000Z',
    relativePath: 'issues/vibe-coding/_epics/VC-900-epic.md',
  },
];

function renderBoard(): string {
  return renderObsidianBoardMarkdown({
    space: 'vibe-coding',
    generatedAt,
    issues,
  });
}

describe('Obsidian board renderer', () => {
  it('renders board frontmatter before warning body content', () => {
    const markdown = renderBoard();

    expect(markdown.startsWith('---\nkanban-plugin: board\n')).toBe(true);
    const frontmatterEnd = markdown.indexOf('\n---\n', 4);
    const warningIndex = markdown.indexOf('GENERATED PROJECTION by kanban-task-engine');

    expect(frontmatterEnd).toBeGreaterThan(0);
    expect(warningIndex).toBeGreaterThan(frontmatterEnd);
    expect(markdown.slice(0, frontmatterEnd)).toContain('kanban-task-engine:');
    expect(markdown.slice(0, frontmatterEnd)).toContain(`  generatedAt: "${generatedAt}"`);
    expect(markdown.slice(0, frontmatterEnd)).toContain('  space: vibe-coding');
  });

  it('renders all status lanes without dummy cards or epic issues', () => {
    const markdown = renderBoard();

    expect(markdown.match(/^## .+$/gm)).toEqual([
      '## TODO',
      '## READY',
      '## RUNNING',
      '## REVIEW',
      '## DONE',
      '## FAILED',
    ]);
    expect(markdown).not.toContain('- No issues');
    expect(markdown).not.toContain('Epic should be indexed elsewhere');
  });

  it('renders issue cards as wikilinks with terminal reconciliation metadata', () => {
    const markdown = renderBoard();
    const checksum = computeBoardProjectionChecksum(issues[0]);
    const card = markdown
      .split('\n')
      .find(line => line.includes('kanban-task-engine:id=VC-001'));

    expect(card).toBe(
      `- [ ] [[issues/vibe-coding/kanban-task-engine/VC-001-top-priority-ready|VC-001 Top priority ready]] \`P0\` <!-- kanban-task-engine:id=VC-001 status=READY checksum=${checksum} source=${encodeURIComponent(issues[0].relativePath)} generatedAt=${generatedAt} -->`,
    );
    expect(card).toMatch(/-->$/);
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('encodes source metadata independently from the visible wikilink target', () => {
    const issue: ObsidianBoardIssue = {
      ...issues[0],
      relativePath: 'issues/vibe-coding/kanban task=engine/VC-004-ready.md',
    };

    const markdown = renderObsidianBoardMarkdown({
      space: 'vibe-coding',
      generatedAt,
      issues: [issue],
    });

    expect(markdown).toContain('[[issues/vibe-coding/kanban task=engine/VC-004-ready|VC-001 Top priority ready]]');
    expect(markdown).toContain('source=issues%2Fvibe-coding%2Fkanban%20task%3Dengine%2FVC-004-ready.md');
  });

  it('computes projection checksums from the stable board projection fields', () => {
    const checksum = computeBoardProjectionChecksum(issues[0]);
    const withExtraBody = computeBoardProjectionChecksum({
      ...issues[0],
      body: 'body text is not part of the board projection',
    } as ObsidianBoardIssue & { body: string });

    expect(withExtraBody).toBe(checksum);
    expect(computeBoardProjectionChecksum({ ...issues[0], title: 'Changed title' })).not.toBe(checksum);
    expect(computeBoardProjectionChecksum({ ...issues[0], status: 'RUNNING' })).not.toBe(checksum);
    expect(computeBoardProjectionChecksum({ ...issues[0], relativePath: 'issues/other.md' })).not.toBe(checksum);
  });

  it('formats hostile titles as one safe wikilink alias and defaults missing priority', () => {
    const markdown = renderBoard();

    expect(markdown).toContain(
      '[[issues/vibe-coding/kanban-task-engine/VC-003-tricky|VC-003 A ] ] tricky / title next]] `P2`',
    );
    expect(markdown).not.toContain('| title\nnext');
  });

  it('renders a plain Kanban settings JSON footer in the upstream parser shape', () => {
    const markdown = renderBoard();
    const footerMatch = markdown.match(/%% kanban:settings\n```\n(?<json>[\s\S]+?)\n```\n%%\n?$/);

    expect(markdown).not.toContain('```json');
    expect(footerMatch).not.toBeNull();

    const settings = JSON.parse(footerMatch?.groups?.json ?? '{}') as {
      'kanban-plugin': string;
      'metadata-keys': Array<{
        metadataKey: string;
        label: string;
        shouldHideLabel: boolean;
        containsMarkdown: boolean;
      }>;
    };

    expect(settings['kanban-plugin']).toBe('board');
    expect(settings['metadata-keys']).toEqual([
      { metadataKey: 'status', label: '', shouldHideLabel: false, containsMarkdown: false },
      { metadataKey: 'priority', label: '', shouldHideLabel: false, containsMarkdown: false },
      { metadataKey: 'project', label: '', shouldHideLabel: false, containsMarkdown: false },
      { metadataKey: 'epic', label: '', shouldHideLabel: false, containsMarkdown: false },
      { metadataKey: 'updated', label: '', shouldHideLabel: false, containsMarkdown: false },
    ]);
  });
});
