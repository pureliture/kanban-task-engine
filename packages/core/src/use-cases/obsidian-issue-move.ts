import YAML from 'yaml';
import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import type { VaultPort } from '../ports/vault-port';
import { StateMachine } from '../state-machine';
import { assertMatchingVaultRoot, writeObsidianBoardForSpace } from './obsidian-board-sync';
import { getRegistrySpace } from '../store/registry';
import { loadVaultRegistry, parseVaultIssueRecord } from './obsidian-vault-records';

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

  let result: MoveObsidianIssueStatusResult | undefined;
  const registry = await loadVaultRegistry(input.vault);
  const space = getRegistrySpace(registry, input.space);
  await input.vault.process(input.relativeIssuePath, content => {
    const record = parseVaultIssueRecord({
      markdown: content,
      relativePath: input.relativeIssuePath,
      space,
      spaceName: input.space,
      vaultRoot: input.vault.root,
    });
    const oldStatus = record.status;
    const newStatus = input.targetStatus;
    validateTransition(record.frontmatter.type, record.id, oldStatus, newStatus);
    result = {
      issueId: record.id,
      oldStatus,
      newStatus,
      changed: oldStatus !== newStatus,
      relativePath: input.relativeIssuePath,
    };
    if (oldStatus === newStatus) return content;

    const now = input.now ?? new Date().toISOString();
    const frontmatter: Record<string, unknown> = {
      ...record.frontmatter,
      status: newStatus,
      updated: now,
    };
    if (newStatus === 'DONE') {
      frontmatter.completed = now;
    } else {
      delete frontmatter.completed;
    }
    const next = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${appendLog(record.body, formatMoveLog({
      now,
      oldStatus,
      newStatus,
      reason: `obsidian-move:${input.space}`,
    })).trimStart()}`;
    return next.endsWith('\n') ? next : `${next}\n`;
  });

  if (!result) throw new Error(`Issue move did not produce a result: ${input.relativeIssuePath}`);
  const board = await writeObsidianBoardForSpace({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
    space: input.space,
    generatedAt: input.now,
  });
  return { ...result, boardPath: board.boardPath };
}

function validateTransition(
  issueType: string,
  issueId: string,
  oldStatus: IssueStatus,
  newStatus: IssueStatus,
): void {
  if (issueType === 'epic') {
    if (oldStatus === newStatus) return;
    if (oldStatus === 'TODO' && newStatus === 'DONE') return;
    throw new Error(`Invalid epic transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
  }
  if (oldStatus !== newStatus && !new StateMachine().canTransition(oldStatus, newStatus)) {
    throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
  }
}

function formatMoveLog(input: {
  now: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  reason: string;
}): string {
  return `- ${input.now} move: ${input.oldStatus} -> ${input.newStatus} (${input.reason})`;
}

function appendLog(body: string, entry: string): string {
  const normalized = body.trimEnd();
  const logHeading = normalized.match(/^## 로그\s*$/m);
  if (logHeading?.index !== undefined) {
    const logBodyStart = logHeading.index + logHeading[0].length;
    const rest = normalized.slice(logBodyStart);
    const nextHeadingOffset = rest.search(/\n##\s+/);
    if (nextHeadingOffset < 0) return `${normalized}\n\n${entry}\n`;

    const insertAt = logBodyStart + nextHeadingOffset;
    const before = normalized.slice(0, insertAt).trimEnd();
    const after = normalized.slice(insertAt).trimStart();
    return `${before}\n\n${entry}\n\n${after}\n`;
  }
  return `${normalized}\n\n## 로그\n\n${entry}\n`;
}
