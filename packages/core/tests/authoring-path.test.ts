import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  scanIssueIds,
  splitSafeRelativePath,
  resolveRegistryPath,
  writeNewIssueFile,
  writeNewIssueFileInVault,
} from '../src/authoring';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-'));
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

async function makeSingleSpaceVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-single-'));
  await fs.mkdir(path.join(vault, 'issues/openclaw/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
`);
  return vault;
}

describe('authoring path safety', () => {
  it('splits safe registry relative paths and rejects traversal', () => {
    expect(splitSafeRelativePath('issues/vibe-coding')).toEqual(['issues', 'vibe-coding']);
    expect(() => splitSafeRelativePath('../issues')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('/issues')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('issues//bad')).toThrow('Unsafe registry path');
    expect(() => splitSafeRelativePath('issues\\bad')).toThrow('Unsafe registry path');
  });

  it('resolves registry paths inside the vault only', async () => {
    const vault = await makeVault();
    await expect(resolveRegistryPath(vault, 'issues/vibe-coding')).resolves.toBe(path.join(vault, 'issues/vibe-coding'));
    await expect(resolveRegistryPath(vault, '../outside')).rejects.toThrow('Unsafe registry path');
  });

  it('rejects registry paths whose existing parent escapes through a symlink', async () => {
    const vault = await makeVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-outside-'));
    await fs.rm(path.join(vault, 'issues/vibe-coding'), { recursive: true, force: true });
    await fs.symlink(outside, path.join(vault, 'issues/vibe-coding'));
    await expect(resolveRegistryPath(vault, 'issues/vibe-coding')).rejects.toThrow('Vault path escapes root');
  });

  it('writes a new issue with exclusive create semantics', async () => {
    const vault = await makeVault();
    const target = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-test.md');
    await writeNewIssueFile(target, 'first');
    await expect(writeNewIssueFile(target, 'second')).rejects.toThrow('Issue file already exists');
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('first');
  });

  it('revalidates the vault parent at write time', async () => {
    const vault = await makeVault();
    const relativePath = 'issues/vibe-coding/kanban-task-engine/VC-001-test.md';
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-outside-'));
    await fs.rm(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true, force: true });
    await fs.symlink(outside, path.join(vault, 'issues/vibe-coding/kanban-task-engine'));
    await expect(writeNewIssueFileInVault(vault, relativePath, 'content')).rejects.toThrow('Vault path escapes root');
  });
});

describe('authoring id scan', () => {
  it('reserves ids from frontmatter, filename fallback, epics, and project roots', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-one.md'), `---
id: VC-001
title: One
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---

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
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/_epics/VC-010-epic.md'), 'not: [valid');
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.ids).toContain('VC-001');
    expect(result.ids).toContain('VC-010');
    expect(result.warnings.some(w => w.includes('VC-010-epic.md'))).toBe(true);
  });

  it('fails writes when malformed files have no reliable id', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/broken.md'), 'not: [valid');
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.length).toBeGreaterThan(0);
  });

  it('fails writes when duplicate ids have multiple owners', async () => {
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
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.duplicateErrors).toHaveLength(1);
    expect(result.owners.get('VC-001')?.length).toBe(2);
  });

  it('treats valid YAML without id and no filename id as fatal', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/no-id.md'), `---
title: Missing id
---
`);
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.some(error => error.includes('no-id.md'))).toBe(true);
  });

  it('does not silently skip symlink entries in issue scan scope', async () => {
    const vault = await makeVault();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outsideFile = path.join(outside, 'VC-020-outside.md');
    await fs.writeFile(outsideFile, '# Outside\n');
    await fs.symlink(outsideFile, path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-020-link.md'));
    await fs.symlink(outside, path.join(vault, 'issues/vibe-coding/kanban-task-engine/symlink-dir'));
    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.some(error => error.includes('VC-020-link.md'))).toBe(true);
    expect(result.fatalErrors.some(error => error.includes('symlink-dir'))).toBe(true);
  });

  it('does not double-count nested single-space epic roots', async () => {
    const vault = await makeSingleSpaceVault();
    await fs.writeFile(path.join(vault, 'issues/openclaw/_epics/OC-001-epic.md'), `---
id: OC-001
title: Epic
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# Epic
`);
    const result = await scanIssueIds(vault, 'openclaw');
    expect(result.ids).toEqual(['OC-001']);
    expect(result.duplicateErrors).toEqual([]);
    expect(result.owners.get('OC-001')).toHaveLength(1);
  });

  it('treats unsafe or wrong-prefix frontmatter ids as fatal scan errors', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/wrong-prefix.md'), `---
id: OC-001
title: Wrong prefix
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
`);
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/unsafe-id.md'), `---
id: ../VC-001
title: Unsafe id
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
`);

    const result = await scanIssueIds(vault, 'vibe-coding');
    expect(result.fatalErrors.some(error => error.includes('expected prefix VC'))).toBe(true);
    expect(result.fatalErrors.some(error => error.includes('Invalid issue id'))).toBe(true);
  });
});
