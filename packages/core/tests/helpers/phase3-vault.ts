import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IssueStatus, IssueType } from '@kanban-task-engine/schema';

export interface MakePhase3VaultOptions {
  status?: IssueStatus;
  type?: IssueType;
}

export async function makePhase3Vault(options: MakePhase3VaultOptions = {}): Promise<string> {
  const status = options.status ?? 'TODO';
  const type = options.type ?? 'task';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-phase3-'));

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

  const frontmatter = [
    '---',
    'id: VC-001',
    `status: ${status}`,
    'priority: P1',
    `type: ${type}`,
    type === 'epic' ? 'title: Phase 3 epic' : 'title: Ready item',
    type === 'epic' ? 'project: ""' : 'project: kanban-task-engine',
    'executor: codex',
    'created: 2026-05-13T09:00:00.000Z',
    'updated: 2026-05-13T09:00:00.000Z',
    '---',
    '',
  ].join('\n');

  const body = type === 'epic'
    ? [
      '# VC-001 Phase 3 epic',
      '',
      '## 목표',
      'Move source test.',
      '',
      '## 범위',
      'Context.',
      '',
      '## 성공 지표',
      '- Pass.',
      '',
      '## 하위 티켓',
      '- VC-001',
      '',
      '## 로그',
      '- Created.',
      '',
    ].join('\n')
    : [
      '# VC-001 Ready item',
      '',
      '## 목적',
      'Move source test.',
      '',
      '## 컨텍스트',
      'Context.',
      '',
      '## Acceptance Criteria',
      '- Pass.',
      '',
      '## 실행 힌트',
      'Use tests.',
      '',
      '## 로그',
      '- Created.',
      '',
    ].join('\n');

  const relativePath = type === 'epic'
    ? 'issues/vibe-coding/_epics/VC-001-ready.md'
    : 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md';
  await fs.writeFile(path.join(root, relativePath), `${frontmatter}${body}\n`);
  return root;
}

export function moveCardToLane(markdown: string, issueId: string, targetLane: IssueStatus): string {
  const lines = markdown.split('\n');
  const cardIndex = lines.findIndex(line => line.includes(`kanban-task-engine:id=${issueId} `));
  if (cardIndex < 0) throw new Error(`Card not found: ${issueId}`);

  const [card] = lines.splice(cardIndex, 1);
  const laneIndex = lines.findIndex(line => line === `## ${targetLane}`);
  if (laneIndex < 0) throw new Error(`Lane not found: ${targetLane}`);

  let insertIndex = laneIndex + 1;
  while (insertIndex < lines.length && lines[insertIndex] === '') insertIndex += 1;
  lines.splice(insertIndex, 0, card);
  return lines.join('\n');
}
