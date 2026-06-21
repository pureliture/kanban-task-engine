import YAML from 'yaml';
import { isIssueStatus, type IssueStatus } from '@kanban-task-engine/schema';
import { StateMachine } from '../state-machine';
import type { PolicyEngine } from '../policy-engine';
import type { EventBus } from '../event-bus';
import type { VaultPort } from '../ports/vault-port';
import type { RegistryIssueRecord } from '../store/vault-record-loader';
import { POLICY_EVENTS } from '../events';
import { markdownIssueToCanonical } from '../store/mapper';
import { parseFrontmatter, extractBody } from '../store/frontmatter-utils';

export interface WorkflowTransitionInput {
  vault: VaultPort;
  record: RegistryIssueRecord;
  targetStatus: IssueStatus;
  reason?: string;
  now?: string;
  frontmatterPatch?: Record<string, unknown>;
  customLogEntry?: string;
}

export interface WorkflowTransitionResult {
  issueId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  changed: boolean;
  relativePath: string;
}

const EPIC_BLOCKED_STATUSES = new Set<IssueStatus>(['READY', 'RUNNING', 'REVIEW', 'FAILED']);

export class WorkflowEngine {
  private stateMachine: StateMachine;
  private policyEngine?: PolicyEngine;
  private eventBus?: EventBus;

  constructor(options?: {
    stateMachine?: StateMachine;
    policyEngine?: PolicyEngine;
    eventBus?: EventBus;
  }) {
    this.stateMachine = options?.stateMachine ?? new StateMachine();
    this.policyEngine = options?.policyEngine;
    this.eventBus = options?.eventBus;
  }

  async transition(input: WorkflowTransitionInput): Promise<WorkflowTransitionResult> {
    const { vault, record, targetStatus } = input;
    const oldStatus = record.status;
    const newStatus = targetStatus;

    if (!isIssueStatus(newStatus)) {
      throw new Error(`Invalid target status: ${String(newStatus)}`);
    }

    // 1. Transition validation
    if (record.frontmatter.type === 'epic') {
      this.validateEpicTransition(record.id, oldStatus, newStatus);
    } else {
      if (oldStatus !== newStatus && !this.stateMachine.canTransition(oldStatus, newStatus)) {
        throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus} for issue ${record.id}`);
      }
    }

    const result: WorkflowTransitionResult = {
      issueId: record.id,
      oldStatus,
      newStatus,
      changed: oldStatus !== newStatus,
      relativePath: record.relativePath,
    };

    if (!result.changed) {
      return result;
    }

    const now = input.now ?? new Date().toISOString();

    const moveLogEntry = input.customLogEntry ?? this.formatMoveLog({
      now,
      oldStatus,
      newStatus,
      reason: input.reason,
    });

    const writtenContent = await vault.process(record.relativePath, (currentContent) => {
      const currentFrontmatter = parseFrontmatter(currentContent);
      const currentBody = extractBody(currentContent);

      if (!currentFrontmatter) {
        throw new Error(`Invalid frontmatter in current note at ${record.relativePath}`);
      }

      // Guard ID freshness
      if (currentFrontmatter.id !== record.id) {
        throw new Error(`Stale ID mismatch: expected ${record.id}, found ${currentFrontmatter.id}`);
      }

      // Guard status freshness
      if (currentFrontmatter.status !== record.status) {
        throw new Error(`Stale status mismatch: expected ${record.status}, found ${currentFrontmatter.status}`);
      }

      // Guard type freshness
      if (currentFrontmatter.type !== record.frontmatter.type) {
        throw new Error(`Stale type mismatch: expected ${record.frontmatter.type}, found ${currentFrontmatter.type}`);
      }

      // Preserve current body edits and append log into current ## 로그
      const bodyWithLog = this.appendLog(currentBody, moveLogEntry);

      const newFrontmatter: Record<string, unknown> = {
        ...currentFrontmatter,
        status: newStatus,
        updated: now,
        ...(input.frontmatterPatch ?? {}),
      };
      if (newStatus === 'DONE') {
        newFrontmatter.completed = now;
      } else {
        delete newFrontmatter.completed;
      }

      const content = `---\n${YAML.stringify(newFrontmatter).trimEnd()}\n---\n\n${bodyWithLog.trimStart()}`;
      return content.endsWith('\n') ? content : `${content}\n`;
    });

    // 2. Policy Engine / Event Bus evaluation only after successful write
    if (this.policyEngine) {
      const task = markdownIssueToCanonical(writtenContent, record.relativePath);
      task.workflow.normalized_status = oldStatus;
      task.workflow.raw_status = oldStatus;
      await this.policyEngine.onTransition(task, newStatus);
    } else if (this.eventBus) {
      // 3. Direct Event Bus publishing if PolicyEngine is not used but EventBus is present
      this.eventBus.emit(POLICY_EVENTS.TRANSITION, {
        taskRef: { provider: 'local', external_key: record.space, external_id: record.id },
        transition: { from: oldStatus, to: newStatus },
      });
    }

    return result;
  }

  private validateEpicTransition(issueId: string, oldStatus: IssueStatus, newStatus: IssueStatus): void {
    if (EPIC_BLOCKED_STATUSES.has(newStatus)) {
      throw new Error(`Invalid epic transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
    }
    if (oldStatus === newStatus) return;
    if (oldStatus === 'TODO' && newStatus === 'DONE') return;
    throw new Error(`Invalid epic transition: ${oldStatus} -> ${newStatus} for issue ${issueId}`);
  }

  private formatMoveLog(input: {
    now: string;
    oldStatus: IssueStatus;
    newStatus: IssueStatus;
    reason?: string;
  }): string {
    const suffix = input.reason ? ` (${input.reason})` : '';
    return `- ${input.now} move: ${input.oldStatus} -> ${input.newStatus}${suffix}`;
  }

  private appendLog(body: string, entry: string): string {
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
}
