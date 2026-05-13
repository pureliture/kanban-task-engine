import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createIssue } from '../src/authoring';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-create-'));
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
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
`);
  return vault;
}

describe('createIssue', () => {
  it('creates the next id under a container project and rejects duplicate overwrite', async () => {
    const vault = await makeVault();
    const first = await createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Authoring Smoke',
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(first.id).toBe('VC-001');
    expect(first.relativePath).toBe('issues/vibe-coding/kanban-task-engine/VC-001-authoring-smoke.md');
    expect(first.created).toBe(true);
    await expect(fs.readFile(first.absolutePath, 'utf8')).resolves.toContain('id: VC-001');
  });

  it('dry-runs without writing', async () => {
    const vault = await makeVault();
    const result = await createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Dry Run',
      dryRun: true,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.created).toBe(false);
    expect(result.markdown).toContain('Dry Run');
    await expect(fs.stat(result.absolutePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects project for epics and writes epics under the epic root', async () => {
    const vault = await makeVault();
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Bad Epic',
      type: 'epic',
    })).rejects.toThrow('Project is not allowed for epic issues');
    const result = await createIssue({ vaultRoot: vault, space: 'vibe-coding', title: 'Good Epic', type: 'epic' });
    expect(result.relativePath).toContain('issues/vibe-coding/_epics/VC-001-good-epic.md');
  });

  it('fails closed when scan reports duplicate ids', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-a.md'), `---
id: VC-001
title: A
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-001-b.md'), `---
id: VC-001
title: B
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
`);
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Should fail',
    })).rejects.toThrow('Duplicate issue ids');
  });

  it('validates unsafe authoring options before writing', async () => {
    const vault = await makeVault();
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Unsafe',
      epic: '../VC-001',
    })).rejects.toThrow('Invalid epic');
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Unsafe',
      workingDir: 'bad\npath',
    })).rejects.toThrow('Invalid workingDir');
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Unsafe',
      mergeInto: '-bad',
    })).rejects.toThrow('Invalid mergeInto');
    await expect(createIssue({
      vaultRoot: vault,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Unsafe',
      mergeInto: 'origin/-bad',
    })).rejects.toThrow('Invalid mergeInto');
  });

  it('allocates unique ids for concurrent creates with different title slugs', async () => {
    const vault = await makeVault();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => createIssue({
        vaultRoot: vault,
        space: 'vibe-coding',
        project: 'kanban-task-engine',
        title: `Concurrent ${index}`,
      })),
    );
    const ids = results.map(result => result.id);
    expect(new Set(ids).size).toBe(results.length);
    expect(ids.sort()).toEqual(['VC-001', 'VC-002', 'VC-003', 'VC-004', 'VC-005', 'VC-006', 'VC-007', 'VC-008']);
  });
});
