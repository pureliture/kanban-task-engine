import YAML from 'yaml';
import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import { StateMachine } from '../state-machine';
import { type VaultPort } from '../ports/vault-port';
import { NodeFsVaultPort } from '../ports/node-fs-vault-port';
import {
  findVaultRegistryIssueById,
  type RegistryIssueRecord,
} from '../store/vault-record-loader';
import { WorkflowEngine } from '../runtime/workflow-engine';

export interface MoveIssueStatusOptions {
  vault?: VaultPort;
  vaultRoot: string;
  issueId: string;
  targetStatus: IssueStatus;
  dryRun?: boolean;
  now?: string;
  reason?: string;
  space?: string;
  record?: RegistryIssueRecord;
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

  const vault = options.vault ?? new NodeFsVaultPort(options.vaultRoot);

  const record = options.record ?? await findVaultRegistryIssueById({
    vault,
    issueId: options.issueId,
    space: options.space,
  });
  validateProvidedRecord(options, record);
  const oldStatus = record.frontmatter.status;
  const newStatus = options.targetStatus;
  const dryRun = options.dryRun ?? false;

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

  const engine = new WorkflowEngine();
  await engine.transition({
    vault,
    record,
    targetStatus: newStatus,
    reason: options.reason,
    now: options.now,
  });

  return result;
}

function validateProvidedRecord(options: MoveIssueStatusOptions, record: RegistryIssueRecord): void {
  if (record.id !== options.issueId) {
    throw new Error(`Record id mismatch: expected ${options.issueId}, got ${record.id}`);
  }
  if (options.space && record.space !== options.space) {
    throw new Error(`Record space mismatch for ${options.issueId}: expected ${options.space}, got ${record.space}`);
  }
}

function validateEpicTransition(issueId: string, oldStatus: IssueStatus, newStatus: IssueStatus): void {
  if (EPIC_BLOCKED_STATUSES.has(newStatus)) {
    throw new Error(`Invalid epic transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
  }
  if (oldStatus === newStatus) return;
  if (oldStatus === 'TODO' && newStatus === 'DONE') return;
  throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
}
