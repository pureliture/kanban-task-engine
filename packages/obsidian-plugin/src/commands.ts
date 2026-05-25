import path from 'node:path';
import { Notice, TFile } from 'obsidian';
import { normalizeIssue } from '@kanban-task-engine/core/authoring';
import { previewObsidianBoardMoves } from '@kanban-task-engine/core/use-cases/obsidian-board-reconcile';
import { writeObsidianBoardForSpace } from '@kanban-task-engine/core/use-cases/obsidian-board-sync';
import type KanbanTaskEnginePlugin from './main';
import { MoveCurrentIssueModal } from './modals/move-current-issue-modal';
import { NewTaskModal } from './modals/new-task-modal';
import { PromoteRawCardModal } from './modals/promote-raw-card-modal';
import { ReconcilePreviewModal } from './modals/reconcile-preview-modal';
import { SyncBoardModal } from './modals/sync-board-modal';
import { ObsidianVaultPort } from './vault-adapter';

export function registerKanbanTaskEngineCommands(plugin: KanbanTaskEnginePlugin): void {
  plugin.addCommand({
    id: 'new-task',
    name: 'New Task',
    callback: () => new NewTaskModal(plugin).open(),
  });
  plugin.addCommand({
    id: 'sync-current-board',
    name: 'Sync Current Board',
    callback: () => new SyncBoardModal(plugin, {
      onConfirm: () => syncCurrentBoard(plugin),
    }).open(),
  });
  plugin.addCommand({
    id: 'preview-board-moves',
    name: 'Preview Board Moves',
    callback: () => void openBoardMovePreview(plugin, false),
  });
  plugin.addCommand({
    id: 'apply-board-moves',
    name: 'Apply Board Moves',
    callback: () => void openBoardMovePreview(plugin, true),
  });
  plugin.addCommand({
    id: 'promote-raw-card',
    name: 'Promote Raw Card',
    callback: () => new PromoteRawCardModal(plugin).open(),
  });
  plugin.addCommand({
    id: 'normalize-current-note',
    name: 'Normalize Current Note',
    callback: () => void normalizeCurrentNote(plugin),
  });
  plugin.addCommand({
    id: 'move-current-issue',
    name: 'Move Current Issue',
    callback: () => openMoveCurrentIssue(plugin),
  });
}

async function syncCurrentBoard(plugin: KanbanTaskEnginePlugin): Promise<void> {
  try {
    const vault = new ObsidianVaultPort(plugin.app.vault);
    const result = await writeObsidianBoardForSpace({
      vault,
      vaultRoot: vault.root,
      space: plugin.settings.defaultSpace,
    });
    new Notice(`Synced ${result.issueCount} issue(s) to ${result.boardPath}`);
  } catch (error) {
    new Notice(formatError(error));
  }
}

async function normalizeCurrentNote(plugin: KanbanTaskEnginePlugin): Promise<void> {
  const activeFile = plugin.app.workspace.getActiveFile();
  if (!(activeFile instanceof TFile) || !activeFile.path.endsWith('.md')) {
    new Notice('Open a Markdown note before normalizing');
    return;
  }
  try {
    const vault = new ObsidianVaultPort(plugin.app.vault);
    const result = await normalizeIssue({
      vaultRoot: vault.root,
      sourcePath: activeFile.path,
      space: plugin.settings.defaultSpace,
      project: plugin.settings.defaultProject,
      write: false,
    });

    const relativeTargetPath = path.relative(vault.root, result.targetPath).split(path.sep).join('/');

    if (result.inPlace) {
      await plugin.app.vault.modify(activeFile, result.markdown);
    } else {
      await vault.create(relativeTargetPath, result.markdown);
      await plugin.app.vault.delete(activeFile);
    }

    const board = await writeObsidianBoardForSpace({
      vault,
      vaultRoot: vault.root,
      space: plugin.settings.defaultSpace,
    });
    new Notice(`Normalized ${result.id} to ${board.boardPath}`);
  } catch (error) {
    new Notice(formatError(error));
  }
}

function openMoveCurrentIssue(plugin: KanbanTaskEnginePlugin): void {
  const activeFile = plugin.app.workspace.getActiveFile();
  if (!(activeFile instanceof TFile) || !activeFile.path.endsWith('.md')) {
    new Notice('Open a Markdown issue note before moving it');
    return;
  }
  new MoveCurrentIssueModal(plugin, {
    relativeIssuePath: activeFile.path,
  }).open();
}

async function openBoardMovePreview(
  plugin: KanbanTaskEnginePlugin,
  allowApply: boolean,
): Promise<void> {
  try {
    const vault = new ObsidianVaultPort(plugin.app.vault);
    const preview = await previewObsidianBoardMoves({
      vault,
      vaultRoot: vault.root,
      space: plugin.settings.defaultSpace,
    });
    const issueTitles = await loadIssueTitles(vault, preview.changes);
    new ReconcilePreviewModal(plugin, {
      preview,
      allowApply,
      vaultPort: vault,
      issueTitles,
    }).open();
  } catch (error) {
    new Notice(formatError(error));
  }
}

async function loadIssueTitles(
  vault: ObsidianVaultPort,
  changes: Array<{ issueId: string; relativeIssuePath: string }>,
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  for (const change of changes) {
    try {
      const markdown = await vault.read(change.relativeIssuePath);
      const title = extractFrontmatterTitle(markdown);
      if (title) titles[change.issueId] = title;
    } catch {
      titles[change.issueId] = 'unavailable';
    }
  }
  return titles;
}

function extractFrontmatterTitle(markdown: string): string | undefined {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return undefined;
  const titleLine = frontmatter[1].split(/\r?\n/).find(line => line.trimStart().startsWith('title:'));
  if (!titleLine) return undefined;
  return titleLine.slice(titleLine.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
