import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeFsVaultPort } from '../../src/ports/node-fs-vault-port';
import {
  findVaultRegistryIssueById,
  listVaultRegistryIssueRecords,
  collectVaultBoardProjection,
} from '../../src/store/vault-record-loader';

async function makeVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-loader-test-'));
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
  await fs.writeFile(path.join(root, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), `---
id: VC-001
status: READY
priority: P1
type: task
title: Ready item
project: kanban-task-engine
executor: codex
created: 2026-05-13T09:00:00.000Z
updated: 2026-05-13T09:00:00.000Z
---

# VC-001 Ready item

## 목적
Move source test.

## 컨텍스트
Context.

## Acceptance Criteria
- Pass.

## 실행 힌트
Use tests.

## 로그
- Created.
`);
  return root;
}

describe('VaultRecordLoader', () => {
  it('lists valid issue records with vault-relative paths', async () => {
    const vaultRoot = await makeVault();
    const vault = new NodeFsVaultPort(vaultRoot);

    const records = await listVaultRegistryIssueRecords({ vault, space: 'vibe-coding' });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'VC-001',
      status: 'READY',
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
    });
    expect(records[0].projection).toMatchObject({
      id: 'VC-001',
      status: 'READY',
      relativePath: 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md',
    });
  });

  it('finds exactly one issue by frontmatter id', async () => {
    const vaultRoot = await makeVault();
    const vault = new NodeFsVaultPort(vaultRoot);

    const record = await findVaultRegistryIssueById({ vault, issueId: 'VC-001' });

    expect(record.space).toBe('vibe-coding');
    expect(record.frontmatter.title).toBe('Ready item');
  });

  it('rejects duplicate frontmatter ids before mutation', async () => {
    const vaultRoot = await makeVault();
    await fs.copyFile(
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'),
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-duplicate.md'),
    );
    const vault = new NodeFsVaultPort(vaultRoot);

    await expect(findVaultRegistryIssueById({ vault, issueId: 'VC-001' }))
      .rejects.toThrow('Duplicate issue id: VC-001');
  });

  it('collects vault board projection successfully', async () => {
    const vaultRoot = await makeVault();
    const vault = new NodeFsVaultPort(vaultRoot);

    const projection = await collectVaultBoardProjection({ vault, space: 'vibe-coding' });

    expect(projection.space).toBe('vibe-coding');
    expect(projection.boardRelativePath).toBe('boards/vibe-coding.md');
    expect(projection.indexRelativePath).toBe('boards/vibe-coding-epics.md');
    expect(projection.issueCount).toBe(1);
    expect(projection.boardMarkdown).toContain('kanban-plugin: board');
  });
});
