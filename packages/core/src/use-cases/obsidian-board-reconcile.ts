import { isIssueStatus } from '@kanban-task-engine/schema';
import type { BoardReconcileConflict, BoardStatusProposal } from '../boards/reconcile-board';
import { reconcileBoardFromRecords } from '../boards/reconcile-board';
import { NodeFsVaultPort } from '../ports/node-fs-vault-port';
import type { VaultPort } from '../ports/vault-port';
import { assertMatchingVaultRoot, writeObsidianBoardForSpace } from './obsidian-board-sync';
import {
  listVaultRegistryIssueRecords,
  loadVaultRegistry,
  parseVaultIssueRecord,
} from '../store/vault-record-loader';
import { getRegistrySpace, type RegistrySpace } from '../store/registry';
import { WorkflowEngine } from '../runtime/workflow-engine';

export interface PreviewObsidianBoardMovesInput {
  vault?: VaultPort;
  vaultRoot: string;
  space: string;
}

export interface ApplyObsidianBoardMovesInput extends PreviewObsidianBoardMovesInput {
  vault: VaultPort;
  expectedChanges: BoardStatusProposal[];
  now?: string;
}

export interface ObsidianBoardAppliedMove {
  issueId: string;
  oldStatus: BoardStatusProposal['currentStatus'];
  newStatus: BoardStatusProposal['proposedStatus'];
  relativePath: string;
}

export interface ObsidianBoardApplySyncErrorInput {
  applied: ObsidianBoardAppliedMove[];
  conflicts: BoardReconcileConflict[];
  boardPath: string;
  cause: unknown;
}

export class ObsidianBoardApplySyncError extends Error {
  override name = 'ObsidianBoardApplySyncError';
  override cause: unknown;
  readonly applied: ObsidianBoardAppliedMove[];
  readonly conflicts: BoardReconcileConflict[];
  readonly boardPath: string;

  constructor(input: ObsidianBoardApplySyncErrorInput) {
    super(`Board sync failed after applying ${input.applied.length} board move(s): ${formatCause(input.cause)}`);
    this.applied = input.applied;
    this.conflicts = input.conflicts;
    this.boardPath = input.boardPath;
    this.cause = input.cause;
  }
}

export async function previewObsidianBoardMoves(input: PreviewObsidianBoardMovesInput) {
  const vault = input.vault ?? new NodeFsVaultPort(input.vaultRoot);
  const registry = await loadVaultRegistry(vault);
  const space = getRegistrySpace(registry, input.space);
  const boardMarkdown = await readBoardMarkdown(vault, space.board);
  if (boardMarkdown === undefined) {
    return {
      changes: [],
      conflicts: [{
        kind: 'missing-board' as const,
        message: `Board file does not exist: ${space.board}`,
        source: space.board,
      }],
      boardPath: space.board,
    };
  }
  const records = await listVaultRegistryIssueRecords({
    vault,
    space: input.space,
  });
  const result = reconcileBoardFromRecords({
    space: input.space,
    boardRelativePath: space.board,
    boardMarkdown,
    records,
  });
  return { changes: result.proposals, conflicts: result.conflicts, boardPath: result.boardRelativePath };
}

export async function applyObsidianBoardMoves(input: ApplyObsidianBoardMovesInput) {
  await assertMatchingVaultRoot({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
  });

  const preview = await previewObsidianBoardMoves(input);
  assertExpectedChanges(preview.changes, input.expectedChanges);
  if (preview.conflicts.length > 0) {
    return { applied: [], conflicts: preview.conflicts, boardPath: preview.boardPath };
  }
  const applied: ObsidianBoardAppliedMove[] = [];
  const registry = await loadVaultRegistry(input.vault);
  const space = getRegistrySpace(registry, input.space);
  for (const change of preview.changes) {
    const move = await applyProposalThroughVault({
      vault: input.vault,
      spaceName: input.space,
      space,
      change,
      now: input.now,
    });
    if (move) applied.push(move);
  }

  try {
    const board = await writeObsidianBoardForSpace({
      vault: input.vault,
      vaultRoot: input.vaultRoot,
      space: input.space,
      generatedAt: input.now,
    });
    return { applied, conflicts: preview.conflicts, boardPath: board.boardPath };
  } catch (error) {
    throw new ObsidianBoardApplySyncError({
      applied,
      conflicts: preview.conflicts,
      boardPath: preview.boardPath,
      cause: error,
    });
  }
}

function assertExpectedChanges(actual: BoardStatusProposal[], expected: BoardStatusProposal[]): void {
  const key = (change: BoardStatusProposal) => [
    change.issueId,
    change.source,
    change.boardPath,
    change.boardLane,
    change.recordedStatus,
    change.currentStatus,
    change.proposedStatus,
    change.relativeIssuePath,
  ].join('\u001f');
  const actualKeys = actual.map(key).sort();
  const expectedKeys = expected.map(key).sort();
  if (actualKeys.join('|') !== expectedKeys.join('|')) {
    throw new Error('Board move preview changed before apply; preview again before applying');
  }
}

async function readBoardMarkdown(vault: VaultPort, boardPath: string): Promise<string | undefined> {
  try {
    return await vault.read(boardPath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function applyProposalThroughVault(input: {
  vault: VaultPort;
  spaceName: string;
  space: RegistrySpace;
  change: BoardStatusProposal;
  now?: string;
}): Promise<ObsidianBoardAppliedMove | undefined> {
  const content = await input.vault.read(input.change.relativeIssuePath);
  const record = parseVaultIssueRecord({
    markdown: content,
    relativePath: input.change.relativeIssuePath,
    space: input.space,
    spaceName: input.spaceName,
    vaultRoot: input.vault.root,
  });

  if (record.id !== input.change.issueId) {
    throw new Error(`Record id mismatch: expected ${input.change.issueId}, got ${record.id}`);
  }
  if (record.status !== input.change.currentStatus) {
    throw new Error('Board move preview changed before apply; preview again before applying');
  }
  if (record.frontmatter.type === 'epic') {
    throw new Error(`Epic movement is not supported for issue ${input.change.issueId}`);
  }

  const engine = new WorkflowEngine();
  const transitionResult = await engine.transition({
    vault: input.vault,
    record,
    targetStatus: input.change.proposedStatus as any,
    reason: `reconcile-board:${input.spaceName}`,
    now: input.now,
  });

  if (!transitionResult.changed) return undefined;

  return {
    issueId: input.change.issueId,
    oldStatus: record.status,
    newStatus: input.change.proposedStatus,
    relativePath: input.change.relativeIssuePath,
  };
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
