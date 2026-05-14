import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IssueStatus, IssueType } from '@kanban-task-engine/schema';

export interface MakePhase3VaultOptions {
  status?: IssueStatus;
  type?: IssueType;
  projectPath?: string;
  secondIssue?: {
    id: string;
    status: IssueStatus;
  };
  duplicateIdInOtherSpace?: boolean;
}

export async function makePhase3Vault(options: MakePhase3VaultOptions = {}): Promise<string> {
  const status = options.status ?? 'TODO';
  const type = options.type ?? 'task';
  const projectPath = options.projectPath ?? 'issues/vibe-coding/kanban-task-engine';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-phase3-'));

  await fs.mkdir(path.join(root, projectPath), { recursive: true });
  await fs.mkdir(path.join(root, 'issues/vibe-coding/_epics'), { recursive: true });
  if (options.duplicateIdInOtherSpace) {
    await fs.mkdir(path.join(root, 'issues/home/general'), { recursive: true });
    await fs.mkdir(path.join(root, 'issues/home/_epics'), { recursive: true });
  }
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
        path: ${projectPath}
${options.duplicateIdInOtherSpace ? `  home:
    type: single
    idPrefix: VC
    issues: issues/home/general
    epics: issues/home/_epics
    board: boards/home.md
    epicBoard: boards/home-epics.md
` : ''}`);

  await writeIssue(root, {
    id: 'VC-001',
    status,
    type,
    title: type === 'epic' ? 'Phase 3 epic' : 'Ready item',
    projectPath,
  });

  if (options.secondIssue) {
    await writeIssue(root, {
      id: options.secondIssue.id,
      status: options.secondIssue.status,
      type: 'task',
      title: 'Second item',
      projectPath,
    });
  }

  if (options.duplicateIdInOtherSpace) {
    await writeIssue(root, {
      id: 'VC-001',
      status: 'TODO',
      type: 'task',
      title: 'Duplicate in other space',
      projectPath: 'issues/home/general',
    });
  }

  return root;
}

async function writeIssue(
  root: string,
  issue: { id: string; status: IssueStatus; type: IssueType; title: string; projectPath: string },
): Promise<void> {
  const frontmatter = [
    '---',
    `id: ${issue.id}`,
    `status: ${issue.status}`,
    'priority: P1',
    `type: ${issue.type}`,
    `title: ${issue.title}`,
    issue.type === 'epic' ? 'project: ""' : 'project: kanban-task-engine',
    'executor: codex',
    'created: 2026-05-13T09:00:00.000Z',
    'updated: 2026-05-13T09:00:00.000Z',
    '---',
    '',
  ].join('\n');

  const body = issue.type === 'epic'
    ? [
      `# ${issue.id} ${issue.title}`,
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
      `- ${issue.id}`,
      '',
      '## 로그',
      '- Created.',
      '',
    ].join('\n')
    : [
      `# ${issue.id} ${issue.title}`,
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

  const relativePath = issue.type === 'epic'
    ? `issues/vibe-coding/_epics/${issue.id}-ready.md`
    : `${issue.projectPath}/${issue.id}-ready.md`;
  await fs.writeFile(path.join(root, relativePath), `${frontmatter}${body}\n`);
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
