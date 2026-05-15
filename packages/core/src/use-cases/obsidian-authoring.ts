import type { CreateIssueInput } from '../authoring';
import { createIssue } from '../authoring';
import type { VaultPort } from '../ports/vault-port';
import { assertMatchingVaultRoot, writeObsidianBoardForSpace } from './obsidian-board-sync';

export interface CreateObsidianTaskInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  priority?: CreateIssueInput['priority'];
  executor?: CreateIssueInput['executor'];
  now?: Date;
  syncBoard?: boolean;
}

export interface CreateObsidianTaskResult {
  issueId: string;
  issuePath: string;
  boardPath?: string;
  warnings: string[];
}

export interface ObsidianTaskBoardSyncErrorInput {
  issueId: string;
  issuePath: string;
  warnings: string[];
  cause: unknown;
}

export class ObsidianTaskBoardSyncError extends Error {
  override name = 'ObsidianTaskBoardSyncError';
  override cause: unknown;
  readonly issueId: string;
  readonly issuePath: string;
  readonly warnings: string[];

  constructor(input: ObsidianTaskBoardSyncErrorInput) {
    super(`Board sync failed after creating issue ${input.issueId}: ${formatCause(input.cause)}`);
    this.issueId = input.issueId;
    this.issuePath = input.issuePath;
    this.warnings = input.warnings;
    this.cause = input.cause;
  }
}

export async function createObsidianTask(input: CreateObsidianTaskInput): Promise<CreateObsidianTaskResult> {
  await assertMatchingVaultRoot({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
  });

  const created = await createIssue({
    vaultRoot: input.vaultRoot,
    space: input.space,
    project: input.project,
    title: input.title,
    priority: input.priority,
    executor: input.executor,
    now: input.now,
  });

  let boardPath: string | undefined;
  if (input.syncBoard ?? true) {
    try {
      const synced = await writeObsidianBoardForSpace({
        vault: input.vault,
        vaultRoot: input.vaultRoot,
        space: input.space,
        generatedAt: input.now?.toISOString(),
      });
      boardPath = synced.boardPath;
    } catch (error) {
      throw new ObsidianTaskBoardSyncError({
        issueId: created.id,
        issuePath: created.relativePath,
        warnings: created.warnings,
        cause: error,
      });
    }
  }

  return {
    issueId: created.id,
    issuePath: created.relativePath,
    boardPath,
    warnings: created.warnings,
  };
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
