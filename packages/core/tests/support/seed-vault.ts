import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function seedVibeCodingRegistry(root: string): Promise<void> {
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
