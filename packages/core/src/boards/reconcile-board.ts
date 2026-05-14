import fs from 'fs/promises';
import path from 'path';
import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import { StateMachine } from '../state-machine';
import { getRegistrySpace, loadRegistry } from '../store/registry';
import { listRegistryIssueRecords, type RegistryIssueRecord } from '../store/registry-issue-source';
import { resolveRegistryPath } from '../store/registry-path';
import { resolveVaultPath } from '../store/vault-path';
import { moveIssueStatus } from '../movement/issue-mover';
import { computeBoardProjectionChecksum } from './obsidian-board-renderer';

export type ReconcileConflictKind =
  | 'missing-board'
  | 'invalid-lane'
  | 'missing-metadata'
  | 'unknown-issue'
  | 'duplicate-card'
  | 'duplicate-issue'
  | 'stale-status'
  | 'stale-checksum'
  | 'illegal-transition'
  | 'epic-transition';

export interface BoardStatusProposal {
  issueId: string;
  source: string;
  boardPath: string;
  boardLane: IssueStatus;
  recordedStatus: IssueStatus;
  currentStatus: IssueStatus;
  proposedStatus: IssueStatus;
  relativeIssuePath: string;
}

export interface BoardReconcileConflict {
  kind: ReconcileConflictKind;
  issueId?: string;
  message: string;
  boardLane?: string;
  source?: string;
}

export interface ReconcileBoardOptions {
  vaultRoot: string;
  space: string;
  apply?: boolean;
  now?: string;
}

export interface ReconcileBoardResult {
  space: string;
  boardRelativePath: string;
  proposals: BoardStatusProposal[];
  conflicts: BoardReconcileConflict[];
  applied: Array<{
    issueId: string;
    oldStatus: IssueStatus;
    newStatus: IssueStatus;
    relativePath: string;
  }>;
}

interface BoardCardMetadata {
  issueId: string;
  recordedStatus: IssueStatus;
  checksum: string;
  source: string;
  boardLane: IssueStatus;
}

export async function reconcileBoard(options: ReconcileBoardOptions): Promise<ReconcileBoardResult> {
  const vaultRoot = path.resolve(options.vaultRoot);
  const registry = await loadRegistry(await resolveVaultPath(vaultRoot, 'registry.yaml'));
  const space = getRegistrySpace(registry, options.space);
  const boardRelativePath = space.board;
  const boardPath = await resolveRegistryPath(vaultRoot, boardRelativePath, { field: `${options.space}.board` });
  const result: ReconcileBoardResult = {
    space: options.space,
    boardRelativePath,
    proposals: [],
    conflicts: [],
    applied: [],
  };

  let boardMarkdown: string;
  try {
    boardMarkdown = await fs.readFile(boardPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      result.conflicts.push({
        kind: 'missing-board',
        message: `Board file does not exist: ${boardRelativePath}`,
        source: boardRelativePath,
      });
      return result;
    }
    throw error;
  }

  const records = await listRegistryIssueRecords({ vaultRoot, space: options.space });
  result.conflicts.push(...duplicateIssueConflicts(records));
  if (result.conflicts.length > 0) return result;
  const recordsById = new Map(records.map(record => [record.id, record]));
  const cards = parseBoardCards(boardMarkdown, result.conflicts);
  const seen = new Set<string>();

  for (const card of cards) {
    if (seen.has(card.issueId)) {
      result.conflicts.push(conflict('duplicate-card', card, `Duplicate board card for issue ${card.issueId}`));
      continue;
    }
    seen.add(card.issueId);

    const record = recordsById.get(card.issueId);
    if (!record) {
      result.conflicts.push(conflict('unknown-issue', card, `Unknown issue id: ${card.issueId}`));
      continue;
    }

    validateCardAgainstIssue(card, record, boardRelativePath, result);
  }

  if (options.apply !== true || result.conflicts.length > 0) return result;

  for (const proposal of result.proposals) {
    const move = await moveIssueStatus({
      vaultRoot,
      issueId: proposal.issueId,
      targetStatus: proposal.proposedStatus,
      dryRun: false,
      now: options.now,
      reason: `reconcile-board:${options.space}`,
      space: options.space,
      record: recordsById.get(proposal.issueId),
    });
    if (move.changed) {
      result.applied.push({
        issueId: move.issueId,
        oldStatus: move.oldStatus,
        newStatus: move.newStatus,
        relativePath: move.relativePath,
      });
    }
  }

  return result;
}

function validateCardAgainstIssue(
  card: BoardCardMetadata,
  record: RegistryIssueRecord,
  boardRelativePath: string,
  result: ReconcileBoardResult,
): void {
  if (card.recordedStatus !== record.status) {
    result.conflicts.push(conflict('stale-status', card, `Stale status for issue ${card.issueId}: board recorded ${card.recordedStatus}, issue is ${record.status}`));
    return;
  }

  if (card.source !== record.relativePath) {
    result.conflicts.push(conflict('stale-checksum', card, `Stale source for issue ${card.issueId}: board recorded ${card.source}, issue is ${record.relativePath}`));
    return;
  }

  const currentChecksum = computeBoardProjectionChecksum(record.projection);
  if (card.checksum !== currentChecksum) {
    result.conflicts.push(conflict('stale-checksum', card, `Stale checksum for issue ${card.issueId}`));
    return;
  }

  if (card.boardLane === record.status) return;

  if (record.frontmatter.type === 'epic') {
    result.conflicts.push(conflict('epic-transition', card, `Epic movement is not supported for issue ${card.issueId}`));
    return;
  }

  if (!new StateMachine().canTransition(record.status, card.boardLane)) {
    result.conflicts.push(conflict('illegal-transition', card, `Invalid transition: ${record.status} -> ${card.boardLane} for issue ${card.issueId}`));
    return;
  }

  result.proposals.push({
    issueId: card.issueId,
    source: card.source,
    boardPath: boardRelativePath,
    boardLane: card.boardLane,
    recordedStatus: card.recordedStatus,
    currentStatus: record.status,
    proposedStatus: card.boardLane,
    relativeIssuePath: record.relativePath,
  });
}

function parseBoardCards(markdown: string, conflicts: BoardReconcileConflict[]): BoardCardMetadata[] {
  const cards: BoardCardMetadata[] = [];
  let currentLane: IssueStatus | undefined;

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentLane = isIssueStatus(heading[1]) ? heading[1] : undefined;
      continue;
    }

    if (!/^\s*-\s+\[[ xX]\]\s+/.test(line)) continue;
    if (!currentLane) {
      conflicts.push({ kind: 'invalid-lane', message: 'Board card is not under a valid status lane' });
      continue;
    }

    const metadata = parseMetadata(line);
    if (!metadata) {
      conflicts.push({
        kind: 'missing-metadata',
        message: 'Board card is missing kanban-task-engine metadata',
        boardLane: currentLane,
      });
      continue;
    }
    if (!isIssueStatus(metadata.status)) {
      conflicts.push({
        kind: 'missing-metadata',
        issueId: metadata.id,
        message: `Board card has invalid recorded status: ${metadata.status}`,
        boardLane: currentLane,
        source: metadata.source,
      });
      continue;
    }

    cards.push({
      issueId: metadata.id,
      recordedStatus: metadata.status,
      checksum: metadata.checksum,
      source: metadata.source,
      boardLane: currentLane,
    });
  }

  return cards;
}

function parseMetadata(line: string): { id: string; status: string; checksum: string; source: string } | undefined {
  const match = line.match(/<!--\s*kanban-task-engine:(.+?)\s*-->/);
  if (!match) return undefined;
  const metadata = parseMetadataPairs(match[1]);
  if (!metadata.id || !metadata.status || !metadata.checksum || !metadata.source) return undefined;
  return {
    id: metadata.id,
    status: metadata.status,
    checksum: metadata.checksum,
    source: metadata.source,
  };
}

function parseMetadataPairs(input: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const match of input.matchAll(/(\w+)=(.+?)(?=\s+\w+=|$)/g)) {
    metadata[match[1]] = match[2].trim();
  }
  return metadata;
}

function duplicateIssueConflicts(records: RegistryIssueRecord[]): BoardReconcileConflict[] {
  const recordsById = new Map<string, RegistryIssueRecord[]>();
  for (const record of records) {
    recordsById.set(record.id, [...recordsById.get(record.id) ?? [], record]);
  }
  return [...recordsById.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([issueId, matches]) => ({
      kind: 'duplicate-issue' as const,
      issueId,
      message: `Duplicate issue id in selected space: ${issueId}`,
      source: matches.map(record => record.relativePath).join(', '),
    }));
}

function conflict(kind: ReconcileConflictKind, card: BoardCardMetadata, message: string): BoardReconcileConflict {
  return {
    kind,
    issueId: card.issueId,
    message,
    boardLane: card.boardLane,
    source: card.source,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
