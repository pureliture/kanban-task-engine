import { Notice } from 'obsidian';
import type KanbanTaskEnginePlugin from './main';

export function registerKanbanTaskEngineCommands(plugin: KanbanTaskEnginePlugin): void {
  plugin.addCommand({
    id: 'new-task',
    name: 'New Task',
    callback: () => new Notice('Kanban Task Engine: New Task'),
  });
  plugin.addCommand({
    id: 'sync-current-board',
    name: 'Sync Current Board',
    callback: () => new Notice('Kanban Task Engine: Sync Current Board'),
  });
  plugin.addCommand({
    id: 'preview-board-moves',
    name: 'Preview Board Moves',
    callback: () => new Notice('Kanban Task Engine: Preview Board Moves'),
  });
  plugin.addCommand({
    id: 'apply-board-moves',
    name: 'Apply Board Moves',
    callback: () => new Notice('Kanban Task Engine: Apply Board Moves'),
  });
  plugin.addCommand({
    id: 'promote-raw-card',
    name: 'Promote Raw Card',
    callback: () => new Notice('Kanban Task Engine: Promote Raw Card'),
  });
  plugin.addCommand({
    id: 'normalize-current-note',
    name: 'Normalize Current Note',
    callback: () => new Notice('Kanban Task Engine: Normalize Current Note'),
  });
}
