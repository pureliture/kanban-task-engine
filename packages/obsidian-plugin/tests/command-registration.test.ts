import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as obsidian from 'obsidian';
import KanbanTaskEnginePlugin from '../src/main';
import { registerKanbanTaskEngineCommands } from '../src/commands';

const noticeMessages = (obsidian as unknown as { noticeMessages: string[] }).noticeMessages;

const commandMocks = vi.hoisted(() => ({
  writeObsidianBoardForSpace: vi.fn(),
  previewObsidianBoardMoves: vi.fn(),
  normalizeIssue: vi.fn(),
}));

vi.mock('@kanban-task-engine/core/authoring', () => ({
  normalizeIssue: commandMocks.normalizeIssue,
}));

vi.mock('@kanban-task-engine/core/use-cases/obsidian-board-sync', () => ({
  writeObsidianBoardForSpace: commandMocks.writeObsidianBoardForSpace,
}));

vi.mock('@kanban-task-engine/core/use-cases/obsidian-board-reconcile', () => ({
  previewObsidianBoardMoves: commandMocks.previewObsidianBoardMoves,
}));

type PluginCommand = { id: string; name: string; callback?: () => unknown };

type RibbonState = {
  icon: string;
  label: string;
  callback: (evt: MouseEvent) => unknown;
};

describe('command registration', () => {
  beforeEach(() => {
    commandMocks.writeObsidianBoardForSpace.mockReset();
    commandMocks.previewObsidianBoardMoves.mockReset();
    commandMocks.normalizeIssue.mockReset();
  });

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
      'move-current-issue',
    ]);
    expect(commands.map(command => command.name)).toEqual([
      'New Task',
      'Sync Current Board',
      'Preview Board Moves',
      'Apply Board Moves',
      'Promote Raw Card',
      'Normalize Current Note',
      'Move Current Issue',
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

    ribbonState.callback(undefined as unknown as MouseEvent);
    const ribbonMessage = noticeMessages[noticeMessages.length - 1] ?? '';
    expect(ribbonMessage).toBe('');
    expect(ribbonMessage).not.toMatch(/write|apply|sync|create/i);
    expect(ribbonState.callback.toString()).not.toMatch(/vault|write|apply|create|sync/i);
  });

  it('opens sync confirmation without regenerating the board immediately', () => {
    const commands: PluginCommand[] = [];
    const plugin = {
      app: {},
      settings: {
        defaultSpace: 'vibe-coding',
      },
      addCommand: (command: PluginCommand): void => {
        commands.push(command);
      },
      addRibbonIcon: () => ({ remove: () => void 0 }),
    };

    registerKanbanTaskEngineCommands(plugin as never);
    commands.find(command => command.id === 'sync-current-board')?.callback?.();

    expect(commandMocks.writeObsidianBoardForSpace).not.toHaveBeenCalled();
  });

  it('normalizes the active markdown note and refreshes the board', async () => {
    commandMocks.normalizeIssue.mockResolvedValue({
      id: 'VC-001',
      targetPath: '/vault/root/issues/vibe-coding/kanban-task-engine/VC-001-note.md',
      wrote: true,
    });
    const commands: PluginCommand[] = [];
    const plugin = createCommandPlugin(commands);
    registerKanbanTaskEngineCommands(plugin as never);

    await commands.find(command => command.id === 'normalize-current-note')?.callback?.();

    expect(commandMocks.normalizeIssue).toHaveBeenCalledWith(expect.objectContaining({
      vaultRoot: '/vault/root',
      sourcePath: 'inbox/rough.md',
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    }));
  });
});

function requireRibbon(ribbon: RibbonState | null): RibbonState {
  if (!ribbon) throw new Error('Expected ribbon action to be registered');
  return ribbon;
}

function createCommandPlugin(commands: PluginCommand[]) {
  return {
    app: {
      vault: {
        adapter: {
          getBasePath: () => '/vault/root',
        },
        getAbstractFileByPath: () => null,
      },
      workspace: {
        getActiveFile: () => Object.assign(new obsidian.TFile(), {
          path: 'inbox/rough.md',
          extension: 'md',
        }),
      },
    },
    settings: {
      defaultSpace: 'vibe-coding',
      defaultProject: 'kanban-task-engine',
    },
    addCommand: (command: PluginCommand): void => {
      commands.push(command);
    },
    addRibbonIcon: () => ({ remove: () => void 0 }),
  };
}
