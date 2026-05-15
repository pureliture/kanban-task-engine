import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type KanbanTaskEnginePluginSettings } from './settings';
import { registerKanbanTaskEngineCommands } from './commands';

export default class KanbanTaskEnginePlugin extends Plugin {
  settings: KanbanTaskEnginePluginSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    registerKanbanTaskEngineCommands(this);

    if (this.settings.showRibbonActions) {
      this.addRibbonIcon('list-checks', 'Kanban Task Engine', () => {
        new Notice('Kanban Task Engine: menu/status open');
      });
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
