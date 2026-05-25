import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NodeFsVaultPort } from '../../src/ports/node-fs-vault-port';
import { WorkflowEngine } from '../../src/runtime/workflow-engine';
import { parseVaultIssueRecord } from '../../src/store/vault-record-loader';
import { EventBus } from '../../src/event-bus';
import { PolicyEngine } from '../../src/policy-engine';
import { StateMachine } from '../../src/state-machine';

async function createTempVault() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-workflow-test-'));
  await fs.mkdir(path.join(root, 'issues/space/project'), { recursive: true });
  return root;
}

const SPACE_MOCK = {
  type: 'container' as const,
  idPrefix: 'VC',
  issues: 'issues/space',
  epics: 'issues/space/_epics',
  board: 'boards/space.md',
  epicBoard: 'boards/space-epics.md',
  projects: {
    project: {
      path: 'issues/space/project',
    },
  },
};

const VALID_TASK_MARKDOWN = `---
id: VC-001
status: TODO
type: task
title: Simple task
project: project
executor: codex
created: 2026-05-13T09:00:00.000Z
updated: 2026-05-13T09:00:00.000Z
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
`;

const VALID_EPIC_MARKDOWN = `---
id: VC-epic
status: TODO
type: epic
title: Big Epic
project: project
executor: human
created: 2026-05-13T09:00:00.000Z
updated: 2026-05-13T09:00:00.000Z
---

# Big Epic

## 목표
Goal.

## 범위
Scope.

## 성공 지표
Metrics.

## 하위 티켓
Sub-tickets.

## 로그
- Created.
`;

describe('WorkflowEngine', () => {
  it('performs valid transitions and updates frontmatter and logs', async () => {
    const root = await createTempVault();
    const vault = new NodeFsVaultPort(root);
    
    const relativePath = 'issues/space/project/VC-001.md';
    
    await vault.create(relativePath, VALID_TASK_MARKDOWN);
    const record = parseVaultIssueRecord({
      markdown: VALID_TASK_MARKDOWN,
      relativePath,
      space: SPACE_MOCK,
      spaceName: 'space',
      vaultRoot: root,
    });

    const engine = new WorkflowEngine();
    const result = await engine.transition({
      vault,
      record,
      targetStatus: 'READY',
      reason: 'manual-ready',
      now: '2026-05-25T12:00:00.000Z',
    });

    expect(result).toEqual({
      issueId: 'VC-001',
      oldStatus: 'TODO',
      newStatus: 'READY',
      changed: true,
      relativePath,
    });

    const updatedContent = await vault.read(relativePath);
    expect(updatedContent).toContain('status: READY');
    expect(updatedContent).toContain('updated: 2026-05-25T12:00:00.000Z');
    expect(updatedContent).toContain('## 로그');
    expect(updatedContent).toContain('- 2026-05-25T12:00:00.000Z move: TODO -> READY (manual-ready)');
  });

  it('rejects invalid transitions', async () => {
    const root = await createTempVault();
    const vault = new NodeFsVaultPort(root);
    
    const relativePath = 'issues/space/project/VC-001.md';
    await vault.create(relativePath, VALID_TASK_MARKDOWN);
    const record = parseVaultIssueRecord({
      markdown: VALID_TASK_MARKDOWN,
      relativePath,
      space: SPACE_MOCK,
      spaceName: 'space',
      vaultRoot: root,
    });

    const engine = new WorkflowEngine();
    await expect(engine.transition({
      vault,
      record,
      targetStatus: 'REVIEW', // Invalid from TODO
    })).rejects.toThrow('Invalid transition: TODO -> REVIEW for issue VC-001');
  });

  it('enforces epic transition constraints', async () => {
    const root = await createTempVault();
    const vault = new NodeFsVaultPort(root);
    
    const relativePath = 'issues/space/project/VC-epic.md';
    await vault.create(relativePath, VALID_EPIC_MARKDOWN);
    const record = parseVaultIssueRecord({
      markdown: VALID_EPIC_MARKDOWN,
      relativePath,
      space: SPACE_MOCK,
      spaceName: 'space',
      vaultRoot: root,
    });

    const engine = new WorkflowEngine();
    
    // Epic TODO -> DONE is allowed
    const validResult = await engine.transition({
      vault,
      record,
      targetStatus: 'DONE',
    });
    expect(validResult.changed).toBe(true);

    // Epic TODO -> READY is blocked
    await expect(engine.transition({
      vault,
      record,
      targetStatus: 'READY',
    })).rejects.toThrow('Invalid epic transition: TODO -> READY for issue VC-epic');
  });

  it('emits events to EventBus on transition', async () => {
    const root = await createTempVault();
    const vault = new NodeFsVaultPort(root);
    
    const relativePath = 'issues/space/project/VC-001.md';
    await vault.create(relativePath, VALID_TASK_MARKDOWN);
    const record = parseVaultIssueRecord({
      markdown: VALID_TASK_MARKDOWN,
      relativePath,
      space: SPACE_MOCK,
      spaceName: 'space',
      vaultRoot: root,
    });

    const bus = new EventBus();
    const eventHandler = vi.fn();
    bus.on('policy:transition', eventHandler);

    const engine = new WorkflowEngine({ eventBus: bus });
    await engine.transition({
      vault,
      record,
      targetStatus: 'READY',
    });

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenLastCalledWith('policy:transition', {
      taskRef: { provider: 'local', external_key: 'space', external_id: 'VC-001' },
      transition: { from: 'TODO', to: 'READY' },
    });
  });

  it('evaluates enter/exit rules using PolicyEngine', async () => {
    const root = await createTempVault();
    const vault = new NodeFsVaultPort(root);
    
    const relativePath = 'issues/space/project/VC-001.md';
    await vault.create(relativePath, VALID_TASK_MARKDOWN);
    const record = parseVaultIssueRecord({
      markdown: VALID_TASK_MARKDOWN,
      relativePath,
      space: SPACE_MOCK,
      spaceName: 'space',
      vaultRoot: root,
    });

    const sm = new StateMachine();
    const bus = new EventBus();
    const policy = new PolicyEngine(sm, bus);
    const enterHandler = vi.fn();
    const exitHandler = vi.fn();

    policy.addRule({ id: 'rule-enter', toStatus: 'READY', action: 'enter', handler: enterHandler });
    policy.addRule({ id: 'rule-exit', fromStatus: 'TODO', action: 'exit', handler: exitHandler });

    const engine = new WorkflowEngine({ policyEngine: policy, stateMachine: sm, eventBus: bus });
    await engine.transition({
      vault,
      record,
      targetStatus: 'READY',
    });

    expect(exitHandler).toHaveBeenCalledTimes(1);
    expect(enterHandler).toHaveBeenCalledTimes(1);
  });
});
