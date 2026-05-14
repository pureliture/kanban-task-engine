import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  findRegistryIssueById,
  listRegistryIssueRecords,
} from '../src/store/registry-issue-source';

async function makeVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-phase3-source-'));
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

describe('registry issue source', () => {
  it('lists valid issue records with vault-relative paths', async () => {
    const vaultRoot = await makeVault();

    const records = await listRegistryIssueRecords({ vaultRoot, space: 'vibe-coding' });

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

    const record = await findRegistryIssueById({ vaultRoot, issueId: 'VC-001' });

    expect(record.space).toBe('vibe-coding');
    expect(record.frontmatter.title).toBe('Ready item');
  });

  it('rejects duplicate frontmatter ids before mutation', async () => {
    const vaultRoot = await makeVault();
    await fs.copyFile(
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'),
      path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001-duplicate.md'),
    );

    await expect(findRegistryIssueById({ vaultRoot, issueId: 'VC-001' }))
      .rejects.toThrow('Duplicate issue id: VC-001');
  });
});
