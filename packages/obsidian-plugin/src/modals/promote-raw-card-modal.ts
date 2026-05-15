import { Modal, Notice, Setting } from 'obsidian';
import { previewNextObsidianIssueId } from '@kanban-task-engine/core/use-cases/obsidian-authoring';
import { promoteRawBoardCard } from '@kanban-task-engine/core/use-cases/obsidian-raw-card-promotion';
import type { VaultPort } from '@kanban-task-engine/core/ports/vault-port';
import type KanbanTaskEnginePlugin from '../main';
import { ObsidianVaultPort } from '../vault-adapter';

type BoardLane = 'TODO' | 'READY' | 'RUNNING' | 'REVIEW' | 'DONE' | 'FAILED';
const BOARD_LANES: BoardLane[] = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'];

export interface PromoteRawCardModalOptions {
  vaultPort?: VaultPort;
  initialTitle?: string;
  lane?: BoardLane;
}

export class PromoteRawCardModal extends Modal {
  private readonly vaultPort?: VaultPort;
  private title: string;
  private lane: BoardLane;
  private confirmed = false;
  private previewEl?: HTMLElement;
  private previewIssueId?: string;
  private duplicateTitleWarnings: string[] = [];
  private previewError?: string;

  constructor(
    private readonly plugin: KanbanTaskEnginePlugin,
    options: PromoteRawCardModalOptions = {},
  ) {
    super(plugin.app);
    this.vaultPort = options.vaultPort;
    this.title = options.initialTitle ?? '';
    this.lane = options.lane ?? 'TODO';
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('Promote Raw Card');
    this.contentEl.createEl('p', {
      text: 'Acceptance criteria, executor intent, and external sync target are not inferred.',
    });
    this.contentEl.createEl('p', {
      text: `Detected lane/status: ${this.lane}`,
    });
    this.contentEl.createEl('p', {
      text: `Target: ${this.plugin.settings.defaultSpace} / ${this.plugin.settings.defaultProject ?? 'none'}`,
    });
    new Setting(this.contentEl)
      .setName('Raw card title')
      .addText(text => text
        .setValue(this.title)
        .onChange(value => {
          this.title = value;
          void this.refreshPreview();
        }));
    new Setting(this.contentEl)
      .setName('Lane/status')
      .setDesc('TODO lane is the only promotable lane in Phase 3 MVP.')
      .addDropdown(dropdown => {
        for (const lane of BOARD_LANES) dropdown.addOption(lane, lane);
        dropdown
          .setValue(this.lane)
          .onChange(value => {
            this.lane = parseBoardLane(value);
          });
      });
    this.previewEl = this.contentEl.createDiv();
    this.renderPreview();
    void this.refreshPreview();
    new Setting(this.contentEl)
      .setName('Confirm')
      .setDesc('TODO lane only for Phase 3 MVP.')
      .addToggle(toggle => toggle
        .setValue(this.confirmed)
        .onChange(value => {
          this.confirmed = value;
        }));
    new Setting(this.contentEl)
      .setName('Promote')
      .addButton(button => button
        .setButtonText('Promote')
        .setWarning()
        .onClick(() => void this.submit()));
  }

  setRawTitle(title: string): void {
    this.title = title;
  }

  setConfirmed(confirmed: boolean): void {
    this.confirmed = confirmed;
  }

  setLane(lane: BoardLane): void {
    this.lane = lane;
  }

  async refreshPreview(): Promise<void> {
    try {
      const vault = this.vaultPort ?? new ObsidianVaultPort(this.plugin.app.vault);
      const preview = await previewNextObsidianIssueId({
        vault,
        space: this.plugin.settings.defaultSpace,
        title: this.title.trim() || undefined,
      });
      this.previewIssueId = preview.issueId;
      this.duplicateTitleWarnings = preview.duplicateTitleWarnings;
      this.previewError = undefined;
    } catch (error) {
      this.previewIssueId = undefined;
      this.duplicateTitleWarnings = [];
      this.previewError = error instanceof Error ? error.message : String(error);
    }
    this.renderPreview();
  }

  async submit(): Promise<void> {
    const title = this.title.trim();
    if (title === '') {
      new Notice('Raw card title is required');
      return;
    }
    if (!this.confirmed) {
      new Notice('Raw card promotion requires confirmation');
      return;
    }

    try {
      const vault = this.vaultPort ?? new ObsidianVaultPort(this.plugin.app.vault);
      const result = await promoteRawBoardCard({
        vault,
        vaultRoot: vault.root,
        space: this.plugin.settings.defaultSpace,
        project: this.plugin.settings.defaultProject,
        title,
        lane: this.lane,
        confirmed: true,
      });
      new Notice(`Created ${result.issueId}`);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private renderPreview(): void {
    if (!this.previewEl) return;
    this.previewEl.empty();
    if (this.previewError) {
      this.previewEl.createEl('div', { text: `ID preview unavailable: ${this.previewError}` });
      return;
    }
    this.previewEl.createEl('div', {
      text: `Generated issue ID: ${this.previewIssueId ?? 'loading'}`,
    });
    for (const warning of this.duplicateTitleWarnings) {
      this.previewEl.createEl('div', {
        text: `Duplicate title warning: ${warning}`,
      });
    }
  }
}

function parseBoardLane(value: string): BoardLane {
  if ((BOARD_LANES as string[]).includes(value)) return value as BoardLane;
  return 'TODO';
}
