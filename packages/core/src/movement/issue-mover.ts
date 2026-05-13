import YAML from 'yaml';
import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import { StateMachine } from '../state-machine';
import { atomicWriteFile } from '../store/fs-utils';
import { findRegistryIssueById } from '../store/registry-issue-source';

export interface MoveIssueStatusOptions {
  vaultRoot: string;
  issueId: string;
  targetStatus: IssueStatus;
  dryRun?: boolean;
  now?: string;
  reason?: string;
}

export interface MoveIssueStatusResult {
  issueId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  changed: boolean;
  dryRun: boolean;
  absolutePath: string;
  relativePath: string;
}

const EPIC_BLOCKED_STATUSES = new Set<IssueStatus>(['READY', 'RUNNING', 'REVIEW', 'FAILED']);

export async function moveIssueStatus(options: MoveIssueStatusOptions): Promise<MoveIssueStatusResult> {
  if (!isIssueStatus(options.targetStatus)) {
    throw new Error(`Invalid target status: ${String(options.targetStatus)}`);
  }

  const record = await findRegistryIssueById({
    vaultRoot: options.vaultRoot,
    issueId: options.issueId,
  });
  const oldStatus = record.frontmatter.status;
  const newStatus = options.targetStatus;
  const dryRun = options.dryRun ?? true;

  if (record.frontmatter.type === 'epic') {
    validateEpicTransition(options.issueId, oldStatus, newStatus);
  } else if (oldStatus !== newStatus && !new StateMachine().canTransition(oldStatus, newStatus)) {
    throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus} for issue ${options.issueId}`);
  }

  const result: MoveIssueStatusResult = {
    issueId: options.issueId,
    oldStatus,
    newStatus,
    changed: oldStatus !== newStatus,
    dryRun,
    absolutePath: record.absolutePath,
    relativePath: record.relativePath,
  };

  if (!result.changed || dryRun) return result;

  const now = options.now ?? new Date().toISOString();
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

  const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${appendLog(record.body, formatMoveLog({
    now,
    oldStatus,
    newStatus,
    reason: options.reason,
  })).trimStart()}`;
  await atomicWriteFile(record.absolutePath, content.endsWith('\n') ? content : `${content}\n`);
  return result;
}

function validateEpicTransition(issueId: string, oldStatus: IssueStatus, newStatus: IssueStatus): void {
  if (EPIC_BLOCKED_STATUSES.has(newStatus)) {
    throw new Error(`Invalid epic transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
  }
  if (oldStatus === newStatus) return;
  if (oldStatus === 'TODO' && newStatus === 'DONE') return;
  throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
}

function formatMoveLog(input: {
  now: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  reason?: string;
}): string {
  const suffix = input.reason ? ` (${input.reason})` : '';
  return `- ${input.now} move: ${input.oldStatus} -> ${input.newStatus}${suffix}`;
}

function appendLog(body: string, entry: string): string {
  const normalized = body.trimEnd();
  if (/^## 로그\s*$/m.test(normalized)) {
    return `${normalized}\n\n${entry}\n`;
  }
  return `${normalized}\n\n## 로그\n\n${entry}\n`;
}
