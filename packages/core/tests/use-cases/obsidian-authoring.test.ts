import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFsVaultPort, createObsidianTask, previewNextObsidianIssueId, type VaultPort } from '../../src';

async function seedRegistry(root: string): Promise<void> {
  await mkdir(path.join(root, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(root, 'issues/vibe-coding/epics'), { recursive: true });
  await mkdir(path.join(root, 'boards'), { recursive: true });
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

describe('createObsidianTask', () => {
  it('creates a canonical issue and keeps board sync as a separate structured result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-'));
    await seedRegistry(root);
    const vault = new NodeFsVaultPort(root);

    const result = await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    });

    expect(result.issueId).toBe('VC-001');
    expect(result.issuePath).toBe('issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md');
    expect(result.boardPath).toBeUndefined();
    expect(await readFile(path.join(root, result.issuePath), 'utf8')).toContain('status: TODO');
  });

  it('creates the issue through VaultPort.create for plugin-safe authoring', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-port-'));
    const vault = new RecordingVaultPort(root, [
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

    const result = await createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian Vault API',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    });

    expect(result.issueId).toBe('VC-001');
    expect(vault.created).toEqual([{
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-vault-api.md',
      content: expect.stringContaining('title: Use Obsidian Vault API'),
    }]);
    await expect(readFile(path.join(root, result.issuePath), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid runtime authoring options before creating an issue through VaultPort', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-invalid-option-'));
    const vault = new RecordingVaultPort(root, registryYaml());

    await expect(createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Invalid executor',
      executor: 'bot' as never,
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    })).rejects.toThrow('Invalid executor: bot');
    expect(vault.created).toEqual([]);
  });

  it('fails closed when existing VaultPort records contain duplicate ids', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-duplicate-'));
    const vault = new RecordingVaultPort(root, registryYaml());
    await vault.create('issues/vibe-coding/kanban-task-engine/VC-001-one.md', duplicateTaskMarkdown('VC-001', 'One'));
    await vault.create('issues/vibe-coding/kanban-task-engine/VC-001-two.md', duplicateTaskMarkdown('VC-001', 'Two'));
    vault.created.length = 0;

    await expect(createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Should not create',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    })).rejects.toThrow('Duplicate issue ids: VC-001');
    expect(vault.created).toEqual([]);
  });

  it('fails closed when an existing task and epic share an id', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-duplicate-epic-'));
    const vault = new RecordingVaultPort(root, registryYaml());
    await vault.create('issues/vibe-coding/kanban-task-engine/VC-001-task.md', duplicateTaskMarkdown('VC-001', 'Task'));
    await vault.create('issues/vibe-coding/epics/VC-001-epic.md', duplicateEpicMarkdown('VC-001', 'Epic'));
    vault.created.length = 0;

    await expect(createObsidianTask({
      vault,
      vaultRoot: root,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Should not create',
      now: new Date('2026-05-15T00:00:00.000Z'),
      syncBoard: false,
    })).rejects.toThrow('Duplicate issue ids: VC-001');
    expect(vault.created).toEqual([]);
  });

  it('previews the next issue id and duplicate-title warnings through VaultPort records', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-preview-id-'));
    const vault = new RecordingVaultPort(root, registryYaml());
    await vault.create('issues/vibe-coding/kanban-task-engine/VC-001-existing.md', duplicateTaskMarkdown('VC-001', 'Existing Task'));

    await expect(previewNextObsidianIssueId({
      vault,
      space: 'vibe-coding',
      title: ' existing   task ',
    })).resolves.toEqual({
      issueId: 'VC-002',
      duplicateTitleWarnings: [
        'Similar canonical issue title: VC-001 issues/vibe-coding/kanban-task-engine/VC-001-existing.md',
      ],
    });
  });

  it('preserves created issue details when board sync fails after authoring succeeds', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-sync-error-'));
    await seedRegistry(root);

    let thrown: unknown;
    try {
      await createObsidianTask({
        vault: new FailingBoardSyncVaultPort(root),
        vaultRoot: root,
        space: 'vibe-coding',
        project: 'kanban-task-engine',
        title: 'Use Obsidian as primary task UX',
        priority: 'P2',
        executor: 'human',
        now: new Date('2026-05-15T00:00:00.000Z'),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'ObsidianTaskBoardSyncError',
      issueId: 'VC-001',
      issuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md',
      warnings: [],
      cause: expect.any(Error),
    });
    await expect(readFile(
      path.join(root, 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md'),
      'utf8',
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects mismatched custom VaultPort roots before creating an issue', async () => {
    const rootA = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-root-a-'));
    const rootB = await mkdtemp(path.join(os.tmpdir(), 'kte-authoring-root-b-'));
    await seedRegistry(rootA);

    await expect(createObsidianTask({
      vault: new RecordingVaultPort(rootB),
      vaultRoot: rootA,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Use Obsidian as primary task UX',
      priority: 'P2',
      executor: 'human',
      now: new Date('2026-05-15T00:00:00.000Z'),
    })).rejects.toThrow(/vaultRoot.*VaultPort root/i);
    await expect(readFile(
      path.join(rootA, 'issues/vibe-coding/kanban-task-engine/VC-001-use-obsidian-as-primary-task-ux.md'),
      'utf8',
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

class RecordingVaultPort implements VaultPort {
  readonly created: { relativePath: string; content: string }[] = [];
  private readonly files = new Map<string, string>();

  constructor(
    readonly root: string,
    private readonly registryYaml = '',
  ) {}

  async read(relativePath: string): Promise<string> {
    if (relativePath === 'registry.yaml') return this.registryYaml;
    const content = this.files.get(relativePath);
    if (content !== undefined) return content;
    throw new Error(`Unexpected read: ${relativePath}`);
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath);
  }

  async create(relativePath: string, content: string): Promise<void> {
    if (await this.exists(relativePath)) throw new Error(`Issue file already exists: ${relativePath}`);
    this.files.set(relativePath, content);
    this.created.push({ relativePath, content });
  }

  async process(): Promise<string> {
    return '';
  }

  async listMarkdownFiles(root = ''): Promise<string[]> {
    return [...this.files.keys()]
      .filter(relativePath => root === '' || relativePath === root || relativePath.startsWith(`${root}/`))
      .sort();
  }
}

class FailingBoardSyncVaultPort extends RecordingVaultPort {
  constructor(root: string) {
    super(root, registryYaml());
  }

  override async create(relativePath: string, content: string): Promise<void> {
    if (relativePath.startsWith('boards/')) throw new Error('board backend failed');
    await super.create(relativePath, content);
  }
}

function registryYaml(): string {
  return [
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
  ].join('\n');
}

function duplicateTaskMarkdown(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
type: task
status: TODO
priority: P2
executor: human
project: kanban-task-engine
created: "2026-05-15T00:00:00.000Z"
updated: "2026-05-15T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# ${title}

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x

## 로그
x
`;
}

function duplicateEpicMarkdown(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
type: epic
status: TODO
priority: P2
executor: human
project: ""
created: "2026-05-15T00:00:00.000Z"
updated: "2026-05-15T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# ${title}

## 목표
x

## 범위
x

## 성공 지표
x

## 하위 티켓
x

## 로그
x
`;
}
