import { Modal } from 'obsidian';
import type KanbanTaskEnginePlugin from '../main';

export class KanbanTaskEngineStatusModal extends Modal {
  constructor(private readonly plugin: KanbanTaskEnginePlugin) {
    super(plugin.app);
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('Kanban Task Engine');
    this.contentEl.createEl('p', {
      text: `Default space: ${this.plugin.settings.defaultSpace}`,
    });
    this.contentEl.createEl('p', {
      text: `Default project: ${this.plugin.settings.defaultProject ?? 'none'}`,
    });
    this.contentEl.createEl('p', {
      text: 'Use the command palette for New Task, Sync Board, Preview Board Moves, Apply Board Moves, Move Current Issue, and Promote Raw Card.',
    });
  }
}
