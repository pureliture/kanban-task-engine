import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import type { VaultPort } from '../ports/vault-port';
import { assertMatchingVaultRoot, writeObsidianBoardForSpace } from './obsidian-board-sync';
import { getRegistrySpace } from '../store/registry';
import { loadVaultRegistry, parseVaultIssueRecord } from '../store/vault-record-loader';
import { WorkflowEngine } from '../runtime/workflow-engine';

export interface MoveObsidianIssueStatusInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  relativeIssuePath: string;
  targetStatus: IssueStatus;
  now?: string;
}

export interface MoveObsidianIssueStatusResult {
  issueId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  changed: boolean;
  relativePath: string;
  boardPath?: string;
}

export async function moveObsidianIssueStatus(
  input: MoveObsidianIssueStatusInput,
): Promise<MoveObsidianIssueStatusResult> {
  await assertMatchingVaultRoot({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
  });
  if (!isIssueStatus(input.targetStatus)) throw new Error(`Invalid target status: ${String(input.targetStatus)}`);

  const registry = await loadVaultRegistry(input.vault);
  const space = getRegistrySpace(registry, input.space);

  const content = await input.vault.read(input.relativeIssuePath);
  const record = parseVaultIssueRecord({
    markdown: content,
    relativePath: input.relativeIssuePath,
    space,
    spaceName: input.space,
    vaultRoot: input.vault.root,
  });

  const engine = new WorkflowEngine();
  const transitionResult = await engine.transition({
    vault: input.vault,
    record,
    targetStatus: input.targetStatus,
    reason: `obsidian-move:${input.space}`,
    now: input.now,
  });

  const board = await writeObsidianBoardForSpace({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
    space: input.space,
    generatedAt: input.now,
  });

  return {
    issueId: record.id,
    oldStatus: record.status,
    newStatus: input.targetStatus,
    changed: transitionResult.changed,
    relativePath: input.relativeIssuePath,
    boardPath: board.boardPath,
  };
}
