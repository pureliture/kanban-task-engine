import { describe, expect, it, vi } from 'vitest';
import KanbanTaskEnginePlugin from '../src/main';
import { registerKanbanTaskEngineCommands } from '../src/commands';

const noticeMessages: string[] = [];

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      noticeMessages.push(message);
    }
  },
  Plugin: class {
    addCommand(): void {
      return;
    }

    addRibbonIcon(): { remove: () => void } {
      return { remove: () => void 0 };
    }
  },
}));

type PluginCommand = { id: string; name: string; callback?: () => void };

type RibbonState = {
  icon: string;
  label: string;
  callback: (evt: MouseEvent) => unknown;
};

describe('command registration', () => {
  it('registers task commands', () => {
    const commands: PluginCommand[] = [];

    const plugin = {
      addCommand: (command: PluginCommand): void => {
        commands.push(command);
      },
      addRibbonIcon: () => ({ remove: () => void 0 }),
    };

    registerKanbanTaskEngineCommands(plugin as never);

    expect(commands.map(command => command.id)).toEqual([
      'new-task',
      'sync-current-board',
      'preview-board-moves',
      'apply-board-moves',
      'promote-raw-card',
      'normalize-current-note',
    ]);
    expect(commands.map(command => command.name)).toEqual([
      'New Task',
      'Sync Current Board',
      'Preview Board Moves',
      'Apply Board Moves',
      'Promote Raw Card',
      'Normalize Current Note',
    ]);
  });

  it('adds a safe ribbon action from plugin entrypoint', async () => {
    noticeMessages.length = 0;

    const commands: PluginCommand[] = [];
    let ribbon: RibbonState | null = null;

    const plugin = Object.create(KanbanTaskEnginePlugin.prototype) as KanbanTaskEnginePlugin & {
      addCommand: (command: PluginCommand) => PluginCommand;
      addRibbonIcon: (icon: string, label: string, callback: (evt: MouseEvent) => unknown) => HTMLElement;
      loadData: () => Promise<unknown>;
    };
    plugin.settings = {
      defaultSpace: 'vibe-coding',
      defaultPriority: 'P2',
      defaultExecutor: 'human',
      syncBoardAfterCreate: true,
      openIssueAfterCreate: false,
      showRibbonActions: true,
      requireApplyPreview: true,
    };
    plugin.loadData = async () => ({ showRibbonActions: true });
    plugin.addCommand = (command: PluginCommand) => {
      commands.push(command);
      return command;
    };
    plugin.addRibbonIcon = (icon, label, callback) => {
      ribbon = { icon, label, callback };
      return { remove: () => void 0 } as unknown as HTMLElement;
    };

    await plugin.onload();
    const ribbonState = requireRibbon(ribbon);
    expect(ribbonState).toMatchObject({
      icon: 'list-checks',
      label: 'Kanban Task Engine',
    });
    expect(typeof ribbonState.callback).toBe('function');

    commands.forEach(command => command.callback?.());
    expect(noticeMessages).toHaveLength(commands.length);

    ribbonState.callback(undefined as unknown as MouseEvent);
    const ribbonMessage = noticeMessages[noticeMessages.length - 1] ?? '';
    expect(ribbonMessage).toMatch(/menu\/status/);
    expect(ribbonMessage).not.toMatch(/write|apply|sync|create/i);
    expect(ribbonState.callback.toString()).not.toMatch(/vault|write|apply|create|sync/i);
  });
});

function requireRibbon(ribbon: RibbonState | null): RibbonState {
  if (!ribbon) throw new Error('Expected ribbon action to be registered');
  return ribbon;
}
