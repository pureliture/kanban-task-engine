import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { renderDataviewIndexMarkdown } from '../src/boards/dataview-index-renderer';
import {
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
} from '../src/boards/board-projection';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-board-projection-'));
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/openclaw'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/openclaw/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
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
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
`);
  await writeIssue(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md', {
    id: 'VC-001',
    title: 'Ready item',
    type: 'task',
    status: 'READY',
    priority: 'P1',
    executor: 'human',
    project: 'kanban-task-engine',
    created: '2026-05-13T00:00:00.000Z',
    updated: '2026-05-13T00:00:00.000Z',
    labels: [],
    depends_on: [],
    run_count: 0,
  });
  await writeIssue(vault, 'issues/vibe-coding/_epics/VC-900-epic.md', {
    id: 'VC-900',
    title: 'Epic',
    type: 'epic',
    status: 'TODO',
    priority: 'P1',
    executor: 'human',
    project: '',
    created: '2026-05-13T00:00:00.000Z',
    updated: '2026-05-13T00:00:00.000Z',
    labels: [],
    depends_on: [],
    run_count: 0,
  });
  await writeIssue(vault, 'issues/openclaw/OC-001-todo.md', {
    id: 'OC-001',
    title: 'OpenClaw todo',
    type: 'task',
    status: 'TODO',
    priority: 'P2',
    executor: 'human',
    project: '',
    created: '2026-05-13T00:00:00.000Z',
    updated: '2026-05-13T00:00:00.000Z',
    labels: [],
    depends_on: [],
    run_count: 0,
  });
  return vault;
}

async function writeIssue(vault: string, relativePath: string, fields: Record<string, unknown>): Promise<void> {
  const body = fields.type === 'epic'
    ? ['## 목표', 'x', '', '## 범위', 'x', '', '## 성공 지표', 'x', '', '## 하위 티켓', 'x', '', '## 로그', 'x'].join('\n')
    : ['## 목적', 'x', '', '## 컨텍스트', 'x', '', '## Acceptance Criteria', 'x', '', '## 실행 힌트', 'x', '', '## 로그', 'x'].join('\n');
  await fs.writeFile(path.join(vault, relativePath), `---
${Object.entries(fields).map(([key, value]) => `${key}: ${formatYamlValue(value)}`).join('\n')}
---

# ${fields.title}

${body}
`);
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => JSON.stringify(item)).join(', ')}]`;
  return JSON.stringify(value);
}

describe('Dataview index renderer', () => {
  it('renders plain Dataview markdown without Kanban frontmatter or footer', () => {
    const markdown = renderDataviewIndexMarkdown({
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
      issueRoot: 'issues/vibe-coding',
      epicRoot: 'issues/vibe-coding/_epics',
    });

    expect(markdown.startsWith('<!-- GENERATED PROJECTION by kanban-task-engine')).toBe(true);
    expect(markdown.startsWith('---')).toBe(false);
    expect(markdown).toContain('GENERATED PROJECTION by kanban-task-engine');
    expect(markdown).toContain('TABLE status, priority, project, epic, updated');
    expect(markdown).toContain('FROM "issues/vibe-coding"');
    expect(markdown).toContain('WHERE type != "epic"');
    expect(markdown).toContain('FROM "issues/vibe-coding/_epics"');
    expect(markdown).not.toContain('kanban-plugin: board');
    expect(markdown).not.toContain('%% kanban:settings');
  });
});

describe('board projection writer', () => {
  it('collects a space projection and excludes epics from the main board', async () => {
    const vault = await createVault();
    const projection = await collectBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(projection.boardMarkdown).toContain('kanban-plugin: board');
    expect(projection.boardMarkdown).toContain('VC-001 Ready item');
    expect(projection.boardMarkdown).not.toContain('VC-900 Epic');
    expect(projection.indexMarkdown).toContain('FROM "issues/vibe-coding"');
    expect(projection.boardPath).toBe(path.join(vault, 'boards/vibe-coding.md'));
    expect(projection.indexPath).toBe(path.join(vault, 'boards/vibe-coding-epics.md'));
  });

  it('writes board and index files for one space', async () => {
    const vault = await createVault();
    const result = await writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(result.space).toBe('vibe-coding');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-plugin: board');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('```dataview');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.not.toContain('%% kanban:settings');
  });

  it('reports partial target writes when the index target fails after the board write', async () => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace('epicBoard: boards/vibe-coding-epics.md', 'epicBoard: boards'));

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toMatchObject({
      name: 'BoardProjectionWriteError',
      succeeded: [
        expect.objectContaining({
          kind: 'board',
          relativePath: 'boards/vibe-coding.md',
          space: 'vibe-coding',
        }),
      ],
      failed: [
        expect.objectContaining({
          kind: 'index',
          relativePath: 'boards',
          space: 'vibe-coding',
        }),
      ],
    });
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-plugin: board');
  });

  it('writes every registry space for all mode', async () => {
    const vault = await createVault();
    const results = await writeBoardProjections({
      vaultRoot: vault,
      all: true,
      generatedAt: '2026-05-13T01:00:00.000Z',
    });

    expect(results.map(result => result.space)).toEqual(['vibe-coding', 'openclaw']);
    await expect(fs.readFile(path.join(vault, 'boards/openclaw.md'), 'utf8')).resolves.toContain('OC-001 OpenClaw todo');
  });

  it.each([
    ['absolute board path', 'board: boards/vibe-coding.md', 'board: /tmp/evil.md'],
    ['traversal board path', 'board: boards/vibe-coding.md', 'board: ../evil.md'],
    ['empty board path', 'board: boards/vibe-coding.md', 'board: ""'],
    ['backslash board path', 'board: boards/vibe-coding.md', 'board: boards\\\\evil.md'],
    ['duplicate separator board path', 'board: boards/vibe-coding.md', 'board: boards//evil.md'],
    ['nul board path', 'board: boards/vibe-coding.md', 'board: "boards/evil\\u0000.md"'],
    ['unsafe epicBoard path', 'epicBoard: boards/vibe-coding-epics.md', 'epicBoard: ../evil.md'],
    ['unsafe issues root', 'issues: issues/vibe-coding', 'issues: ../issues/vibe-coding'],
    ['unsafe epics root', 'epics: issues/vibe-coding/_epics', 'epics: issues//vibe-coding/_epics'],
    ['unsafe project root', 'path: issues/vibe-coding/kanban-task-engine', 'path: /tmp/project'],
  ])('rejects unsafe registry %s before writing', async (_name, search, replacement) => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace(search, replacement));
    await fs.mkdir(path.join(vault, 'boards'), { recursive: true });
    await fs.writeFile(path.join(vault, 'boards/vibe-coding.md'), 'existing board\n');

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/unsafe|relative safe path|Vault path escapes root|missing required string field/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toBe('existing board\n');
  });

  it('rejects board and issue symlink escapes before writing', async () => {
    const vault = await createVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-board-outside-'));
    await fs.symlink(outside, path.join(vault, 'escape'));
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(
      registryPath,
      original
        .replace('board: boards/vibe-coding.md', 'board: escape/vibe-coding.md')
        .replace('path: issues/vibe-coding/kanban-task-engine', 'path: escape/project'),
    );
    await fs.mkdir(path.join(vault, 'boards'), { recursive: true });
    await fs.writeFile(path.join(vault, 'boards/vibe-coding.md'), 'existing board\n');

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/Vault path escapes root/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toBe('existing board\n');
  });

  it('validates issue frontmatter against registry prefix and allows empty project in a single space', async () => {
    const vault = await createVault();
    await writeIssue(vault, 'issues/openclaw/OC-002-empty-project.md', {
      id: 'OC-002',
      title: 'Single space empty project is valid',
      type: 'task',
      status: 'READY',
      priority: 'P2',
      executor: 'human',
      project: '',
      created: '2026-05-13T00:00:00.000Z',
      updated: '2026-05-13T00:00:00.000Z',
      labels: [],
      depends_on: [],
      run_count: 0,
    });
    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'openclaw',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).resolves.toMatchObject({ space: 'openclaw' });

    await writeIssue(vault, 'issues/openclaw/WRONG-001-bad-prefix.md', {
      id: 'WRONG-001',
      title: 'Bad prefix',
      type: 'task',
      status: 'TODO',
      priority: 'P2',
      executor: 'human',
      project: '',
      created: '2026-05-13T00:00:00.000Z',
      updated: '2026-05-13T00:00:00.000Z',
      labels: [],
      depends_on: [],
      run_count: 0,
    });
    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'openclaw',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/expected prefix OC/i);
  });

  it('preflights every all-mode projection before writing any selected file', async () => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace('board: boards/openclaw.md', 'board: ../openclaw.md'));

    await expect(writeBoardProjections({
      vaultRoot: vault,
      all: true,
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/unsafe|relative safe path|Vault path escapes root/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails before writing when a selected issue is schema-invalid or missing required sections', async () => {
    const vault = await createVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-999-bad.md'), `---
id: VC-999
title: Bad
type: task
status: READY
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Bad

## 목적
x
`);

    await expect(writeBoardProjection({
      vaultRoot: vault,
      space: 'vibe-coding',
      generatedAt: '2026-05-13T01:00:00.000Z',
    })).rejects.toThrow(/issues\/vibe-coding\/kanban-task-engine\/VC-999-bad.md: .*Missing required section/i);
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
