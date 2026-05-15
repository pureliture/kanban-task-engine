import { Modal, Notice, Setting, TFile } from 'obsidian';
import { createObsidianTask } from '@kanban-task-engine/core/use-cases/obsidian-authoring';
import type { VaultPort } from '@kanban-task-engine/core/ports/vault-port';
import type KanbanTaskEnginePlugin from '../main';
import { ObsidianVaultPort } from '../vault-adapter';

export interface NewTaskModalOptions {
  vaultPort?: VaultPort;
  now?: Date;
}

export class NewTaskModal extends Modal {
  private title = '';
  private readonly vaultPort?: VaultPort;
  private readonly now?: Date;
  private space: string;
  private project?: string;
  private priority: 'P0' | 'P1' | 'P2' | 'P3';
  private executor: string;
  private syncBoardAfterCreate: boolean;
  private openIssueAfterCreate: boolean;

  constructor(
    private readonly plugin: KanbanTaskEnginePlugin,
    options: NewTaskModalOptions = {},
  ) {
    super(plugin.app);
    this.vaultPort = options.vaultPort;
    this.now = options.now;
    this.space = plugin.settings.defaultSpace;
    this.project = plugin.settings.defaultProject;
    this.priority = plugin.settings.defaultPriority;
    this.executor = plugin.settings.defaultExecutor;
    this.syncBoardAfterCreate = plugin.settings.syncBoardAfterCreate;
    this.openIssueAfterCreate = plugin.settings.openIssueAfterCreate;
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText('New Task');
    new Setting(this.contentEl)
      .setName('Title')
      .addText(text => text
        .setPlaceholder('Task title')
        .setValue(this.title)
        .onChange(value => {
          this.title = value;
        }));
    new Setting(this.contentEl)
      .setName('Create')
      .addButton(button => button
        .setButtonText('Create')
        .setCta()
        .onClick(() => void this.submit()));
  }

  setTaskTitle(title: string): void {
    this.title = title;
  }

  async submit(): Promise<void> {
    const title = this.title.trim();
    if (title === '') {
      new Notice('Title is required');
      return;
    }

    try {
      const vault = this.vaultPort ?? new ObsidianVaultPort(this.plugin.app.vault);
      const result = await createObsidianTask({
        vault,
        vaultRoot: vault.root,
        space: this.space,
        project: this.project,
        title,
        priority: this.priority,
        executor: this.executor as never,
        now: this.now,
        syncBoard: this.syncBoardAfterCreate,
      });
      new Notice(`Created ${result.issueId}`);
      if (this.openIssueAfterCreate) {
        await this.openIssue(result.issuePath);
      }
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private async openIssue(issuePath: string): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(issuePath);
    if (!(file instanceof TFile)) {
      new Notice(`Created issue file not found: ${issuePath}`);
      return;
    }
    await this.plugin.app.workspace.getLeaf(false).openFile(file);
  }
}
