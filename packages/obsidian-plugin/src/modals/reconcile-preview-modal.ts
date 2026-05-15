import { Modal, Notice, Setting } from 'obsidian';
import { applyObsidianBoardMoves } from '@kanban-task-engine/core/use-cases/obsidian-board-reconcile';
import type {
  BoardReconcileConflict,
  BoardStatusProposal,
} from '@kanban-task-engine/core/boards/reconcile-board';
import type { VaultPort } from '@kanban-task-engine/core/ports/vault-port';
import type KanbanTaskEnginePlugin from '../main';
import { ObsidianVaultPort } from '../vault-adapter';

export interface ReconcilePreview {
  boardPath: string;
  changes: BoardStatusProposal[];
  conflicts: BoardReconcileConflict[];
}

export interface ReconcilePreviewModalOptions {
  preview: ReconcilePreview;
  allowApply: boolean;
  vaultPort?: VaultPort;
  issueTitles?: Record<string, string>;
}

export class ReconcilePreviewModal extends Modal {
  private readonly preview: ReconcilePreview;
  private readonly allowApply: boolean;
  private readonly vaultPort?: VaultPort;
  private readonly issueTitles: Record<string, string>;

  constructor(
    private readonly plugin: KanbanTaskEnginePlugin,
    options: ReconcilePreviewModalOptions,
  ) {
    super(plugin.app);
    this.preview = options.preview;
    this.allowApply = options.allowApply;
    this.vaultPort = options.vaultPort;
    this.issueTitles = options.issueTitles ?? {};
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('Board Moves');
    this.contentEl.createEl('p', {
      text: `${this.preview.changes.length} change(s), ${this.preview.conflicts.length} conflict(s)`,
    });
    for (const change of this.preview.changes) {
      const container = this.contentEl.createDiv();
      container.createEl('div', { text: `${change.issueId}: ${change.currentStatus} -> ${change.proposedStatus}` });
      container.createEl('div', { text: `Title: ${this.issueTitles[change.issueId] ?? 'unavailable'}` });
      container.createEl('div', { text: `Source issue: ${change.relativeIssuePath}` });
      container.createEl('div', { text: `Old status: ${change.currentStatus}` });
      container.createEl('div', { text: `Proposed status: ${change.proposedStatus}` });
    }
    for (const conflict of this.preview.conflicts) {
      const container = this.contentEl.createDiv();
      container.createEl('div', { text: `Conflict: ${conflict.message}` });
      container.createEl('div', { text: `Conflict status: ${conflict.kind}` });
      if (conflict.issueId) container.createEl('div', { text: `Conflict issue: ${conflict.issueId}` });
      if (conflict.source) container.createEl('div', { text: `Conflict source: ${conflict.source}` });
      if (conflict.boardLane) container.createEl('div', { text: `Conflict lane: ${conflict.boardLane}` });
    }
    if (this.allowApply) {
      new Setting(this.contentEl)
        .setName('Apply')
        .setDisabled(this.preview.conflicts.length > 0)
        .addButton(button => button
          .setButtonText('Apply')
          .setCta()
          .setDisabled(this.preview.conflicts.length > 0)
          .onClick(() => void this.apply()));
    }
  }

  async apply(): Promise<void> {
    if (!this.allowApply) {
      new Notice('Open Apply Board Moves to apply this preview');
      return;
    }
    if (this.preview.conflicts.length > 0) {
      new Notice('Cannot apply board moves while conflicts exist');
      return;
    }

    try {
      const vault = this.vaultPort ?? new ObsidianVaultPort(this.plugin.app.vault);
      const result = await applyObsidianBoardMoves({
        vault,
        vaultRoot: vault.root,
        space: this.plugin.settings.defaultSpace,
        expectedChanges: this.preview.changes,
      });
      new Notice(`Applied ${result.applied.length} board move(s)`);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }
}
