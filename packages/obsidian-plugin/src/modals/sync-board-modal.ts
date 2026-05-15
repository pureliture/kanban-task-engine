import { Modal, Notice, Setting } from 'obsidian';
import type KanbanTaskEnginePlugin from '../main';

export interface SyncBoardModalOptions {
  onConfirm: () => Promise<void> | void;
}

export class SyncBoardModal extends Modal {
  private readonly onConfirm: () => Promise<void> | void;

  constructor(
    plugin: KanbanTaskEnginePlugin,
    options: SyncBoardModalOptions,
  ) {
    super(plugin.app);
    this.onConfirm = options.onConfirm;
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('Sync Current Board');
    this.contentEl.createEl('p', {
      text: 'This regenerates the generated board projection and can discard unapplied board-only lane edits.',
    });
    this.contentEl.createEl('p', {
      text: 'Preview and apply board moves first when cards were moved directly in Obsidian.',
    });
    new Setting(this.contentEl)
      .setName('Confirm sync')
      .setDesc('Regenerate the board from canonical issue frontmatter.')
      .addButton(button => button
        .setButtonText('Sync')
        .setWarning()
        .onClick(() => void this.confirm()));
  }

  async confirm(): Promise<void> {
    try {
      await this.onConfirm();
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }
}
