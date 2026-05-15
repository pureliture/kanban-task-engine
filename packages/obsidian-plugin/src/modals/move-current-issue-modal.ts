import { Modal, Notice, Setting } from 'obsidian';
import { moveObsidianIssueStatus } from '@kanban-task-engine/core/use-cases/obsidian-issue-move';
import type { VaultPort } from '@kanban-task-engine/core/ports/vault-port';
import type KanbanTaskEnginePlugin from '../main';
import { ObsidianVaultPort } from '../vault-adapter';

const ISSUE_STATUSES: IssueStatus[] = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'];
type IssueStatus = 'TODO' | 'READY' | 'RUNNING' | 'REVIEW' | 'DONE' | 'FAILED';

export interface MoveCurrentIssueModalOptions {
  vaultPort?: VaultPort;
  relativeIssuePath: string;
  now?: string;
}

export class MoveCurrentIssueModal extends Modal {
  private readonly vaultPort?: VaultPort;
  private readonly now?: string;
  private targetStatus: IssueStatus = 'READY';

  constructor(
    private readonly plugin: KanbanTaskEnginePlugin,
    private readonly options: MoveCurrentIssueModalOptions,
  ) {
    super(plugin.app);
    this.vaultPort = options.vaultPort;
    this.now = options.now;
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('Move Current Issue');
    this.contentEl.createEl('p', { text: `Issue note: ${this.options.relativeIssuePath}` });
    new Setting(this.contentEl)
      .setName('Target status')
      .addDropdown(dropdown => {
        for (const status of ISSUE_STATUSES) dropdown.addOption(status, status);
        dropdown.setValue(this.targetStatus).onChange(value => {
          this.targetStatus = coerceIssueStatus(value);
        });
      });
    new Setting(this.contentEl)
      .setName('Move')
      .addButton(button => button.setButtonText('Move').setCta().onClick(() => {
        void this.submit();
      }));
  }

  setTargetStatus(status: IssueStatus): void {
    this.targetStatus = status;
  }

  async submit(): Promise<void> {
    try {
      const vault = this.vaultPort ?? new ObsidianVaultPort(this.plugin.app.vault);
      const result = await moveObsidianIssueStatus({
        vault,
        vaultRoot: vault.root,
        space: this.plugin.settings.defaultSpace,
        relativeIssuePath: this.options.relativeIssuePath,
        targetStatus: this.targetStatus,
        now: this.now,
      });
      new Notice(`Moved ${result.issueId} ${result.oldStatus} -> ${result.newStatus}`);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }
}

function coerceIssueStatus(value: string): IssueStatus {
  return ISSUE_STATUSES.includes(value as IssueStatus) ? value as IssueStatus : 'READY';
}
