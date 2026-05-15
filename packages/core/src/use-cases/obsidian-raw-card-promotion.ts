import type { IssueStatus } from '@kanban-task-engine/schema';
import type { VaultPort } from '../ports/vault-port';
import { createObsidianTask } from './obsidian-authoring';

export interface PromoteRawBoardCardInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  lane: IssueStatus;
  confirmed: boolean;
}

export async function promoteRawBoardCard(input: PromoteRawBoardCardInput) {
  if (!input.confirmed) throw new Error('Raw card promotion requires explicit confirmation');
  if (input.lane !== 'TODO') throw new Error('Raw card promotion only supports TODO lane in Phase 3 MVP');
  return createObsidianTask({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
    space: input.space,
    project: input.project,
    title: input.title,
    syncBoard: true,
  });
}
