import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  findRegistryIssueById,
  listRegistryIssueRecords,
  type FindRegistryIssueByIdOptions,
  type ListRegistryIssueRecordsOptions,
} from '../src';

async function seedRegistry(root: string): Promise<void> {
  await mkdir(path.join(root, 'issues/space/project'), { recursive: true });
  await mkdir(path.join(root, 'issues/space/epics'), { recursive: true });
  await mkdir(path.join(root, 'boards'), { recursive: true });
  await writeFile(path.join(root, 'registry.yaml'), [
    'spaces:',
    '  space:',
    '    type: container',
    '    idPrefix: VC',
    '    issues: issues/space',
    '    epics: issues/space/epics',
    '    board: boards/space.md',
    '    epicBoard: boards/space-epics.md',
    '    projects:',
    '      project:',
    '        path: issues/space/project',
    '',
  ].join('\n'));

  await writeFile(path.join(root, 'issues/space/project/VC-001.md'), `---
id: VC-001
title: Simple task
type: task
status: TODO
executor: human
project: project
created: "2026-05-13T09:00:00.000Z"
updated: "2026-05-13T09:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Simple task

## 목적
Purpose.

## 컨텍스트
Context.

## Acceptance Criteria
- Verify.

## 실행 힌트
Hint.

## 로그
- Created.
`);
}

describe('Legacy root exports', () => {
  it('correctly compiles and runs legacy finder and lister functions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-legacy-exports-'));
    await seedRegistry(root);

    // Verify option types are compile-time checkable by using them
    const listOpts: ListRegistryIssueRecordsOptions = {
      vaultRoot: root,
      space: 'space',
    };
    const records = await listRegistryIssueRecords(listOpts);
    expect(records.length).toBe(1);
    expect(records[0].id).toBe('VC-001');

    const findOpts: FindRegistryIssueByIdOptions = {
      vaultRoot: root,
      issueId: 'VC-001',
      space: 'space',
    };
    const record = await findRegistryIssueById(findOpts);
    expect(record.id).toBe('VC-001');
    expect(record.status).toBe('TODO');
  });
});
