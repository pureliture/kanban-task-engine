import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as obsidian from 'obsidian';
import type { BoardStatusProposal } from '@kanban-task-engine/core/boards/reconcile-board';
import { NewTaskModal } from '../src/modals/new-task-modal';
import { PromoteRawCardModal } from '../src/modals/promote-raw-card-modal';
import { ReconcilePreviewModal } from '../src/modals/reconcile-preview-modal';
import { SyncBoardModal } from '../src/modals/sync-board-modal';

const noticeMessages = (obsidian as unknown as { noticeMessages: string[] }).noticeMessages;

const mocks = vi.hoisted(() => ({
  createObsidianTask: vi.fn(),
  previewNextObsidianIssueId: vi.fn(),
  applyObsidianBoardMoves: vi.fn(),
  promoteRawBoardCard: vi.fn(),
}));

vi.mock('@kanban-task-engine/core/use-cases/obsidian-authoring', () => ({
  createObsidianTask: mocks.createObsidianTask,
  previewNextObsidianIssueId: mocks.previewNextObsidianIssueId,
}));

vi.mock('@kanban-task-engine/core/use-cases/obsidian-board-reconcile', () => ({
  applyObsidianBoardMoves: mocks.applyObsidianBoardMoves,
}));

vi.mock('@kanban-task-engine/core/use-cases/obsidian-raw-card-promotion', () => ({
  promoteRawBoardCard: mocks.promoteRawBoardCard,
}));

describe('command modals', () => {
  beforeEach(() => {
    noticeMessages.length = 0;
    mocks.createObsidianTask.mockReset();
    mocks.previewNextObsidianIssueId.mockReset();
    mocks.applyObsidianBoardMoves.mockReset();
    mocks.promoteRawBoardCard.mockReset();
  });

  it('requires a title before creating a new task', async () => {
    const modal = new NewTaskModal(createPluginMock(), {
      vaultPort: createVaultPortMock(),
    });

    await modal.submit();

    expect(mocks.createObsidianTask).not.toHaveBeenCalled();
    expect(noticeMessages.at(-1)).toMatch(/Title is required/);
  });

  it('creates a new task with settings defaults and reports the created id', async () => {
    mocks.createObsidianTask.mockResolvedValue({
      issueId: 'VC-001',
      issuePath: 'issues/vibe-coding/kanban-task-engine/VC-001-test.md',
      boardPath: 'boards/vibe-coding.md',
      warnings: [],
    });
    const plugin = createPluginMock({
      settings: {
        defaultSpace: 'vibe-coding',
        defaultProject: 'kanban-task-engine',
        defaultPriority: 'P1',
        defaultExecutor: 'codex',
        syncBoardAfterCreate: true,
        openIssueAfterCreate: false,
        showRibbonActions: true,
        requireApplyPreview: true,
      },
    });
    const vaultPort = createVaultPortMock();
    const modal = new NewTaskModal(plugin, { vaultPort });
    modal.setTaskTitle('Test task');

    await modal.submit();

    expect(mocks.createObsidianTask).toHaveBeenCalledWith(expect.objectContaining({
      vault: vaultPort,
      vaultRoot: '/vault/root',
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      title: 'Test task',
      priority: 'P1',
      executor: 'codex',
      syncBoard: true,
    }));
    expect(noticeMessages.at(-1)).toContain('Created VC-001');
  });

  it('requires explicit confirmation before promoting a raw card', async () => {
    const modal = new PromoteRawCardModal(createPluginMock(), {
      vaultPort: createVaultPortMock(),
      initialTitle: 'Raw card',
    });

    await modal.submit();

    expect(mocks.promoteRawBoardCard).not.toHaveBeenCalled();
    expect(noticeMessages.at(-1)).toMatch(/requires confirmation/i);
  });

  it('shows raw-card lane, target, generated id preview, and duplicate-title warnings', async () => {
    mocks.previewNextObsidianIssueId.mockResolvedValue({
      issueId: 'VC-042',
      duplicateTitleWarnings: ['Similar canonical issue title: VC-001 issues/vibe-coding/kanban-task-engine/VC-001-raw-card.md'],
    });
    const vaultPort = createVaultPortMock();
    const modal = new PromoteRawCardModal(createPluginMock({
      settings: { defaultProject: 'kanban-task-engine' },
    }), {
      vaultPort,
      initialTitle: 'Raw card',
      lane: 'TODO',
    });

    modal.open();
    await modal.refreshPreview();

    expect(mocks.previewNextObsidianIssueId).toHaveBeenCalledWith(expect.objectContaining({
      vault: vaultPort,
      space: 'vibe-coding',
      title: 'Raw card',
    }));
    expect(collectText(modal.contentEl)).toContain('Detected lane/status: TODO');
    expect(collectText(modal.contentEl)).toContain('Target: vibe-coding / kanban-task-engine');
    expect(collectText(modal.contentEl)).toContain('Generated issue ID: VC-042');
    expect(collectText(modal.contentEl)).toContain('Duplicate title warning: Similar canonical issue title: VC-001 issues/vibe-coding/kanban-task-engine/VC-001-raw-card.md');
  });

  it('passes the detected lane when promoting a confirmed raw card', async () => {
    mocks.promoteRawBoardCard.mockResolvedValue({
      issueId: 'VC-010',
      issuePath: 'issues/vibe-coding/kanban-task-engine/VC-010-raw-card.md',
      boardPath: 'boards/vibe-coding.md',
      warnings: [],
    });
    const vaultPort = createVaultPortMock();
    const modal = new PromoteRawCardModal(createPluginMock(), {
      vaultPort,
      initialTitle: 'Raw card',
    });
    modal.setLane('READY');
    modal.setConfirmed(true);

    await modal.submit();

    expect(mocks.promoteRawBoardCard).toHaveBeenCalledWith(expect.objectContaining({
      vault: vaultPort,
      title: 'Raw card',
      lane: 'READY',
      confirmed: true,
    }));
  });

  it('blocks reconcile apply when conflicts exist', async () => {
    const modal = new ReconcilePreviewModal(createPluginMock(), {
      vaultPort: createVaultPortMock(),
      preview: {
        boardPath: 'boards/vibe-coding.md',
        changes: [change('VC-001', 'TODO', 'READY')],
        conflicts: [{
          kind: 'stale-checksum',
          message: 'stale checksum',
          source: 'boards/vibe-coding.md',
        }],
      },
      allowApply: true,
    });

    await modal.apply();

    expect(mocks.applyObsidianBoardMoves).not.toHaveBeenCalled();
    expect(noticeMessages.at(-1)).toMatch(/conflict/i);
  });

  it('applies reconcile using the previewed changes as expectedChanges', async () => {
    const previewedChanges = [change('VC-001', 'TODO', 'READY')];
    mocks.applyObsidianBoardMoves.mockResolvedValue({
      applied: [],
      conflicts: [],
      boardPath: 'boards/vibe-coding.md',
    });
    const vaultPort = createVaultPortMock();
    const modal = new ReconcilePreviewModal(createPluginMock(), {
      vaultPort,
      preview: {
        boardPath: 'boards/vibe-coding.md',
        changes: previewedChanges,
        conflicts: [],
      },
      allowApply: true,
    });

    await modal.apply();

    expect(mocks.applyObsidianBoardMoves).toHaveBeenCalledWith(expect.objectContaining({
      vault: vaultPort,
      vaultRoot: '/vault/root',
      space: 'vibe-coding',
      expectedChanges: previewedChanges,
    }));
  });

  it('renders reconcile preview with title, source path, statuses, and conflict status', () => {
    const modal = new ReconcilePreviewModal(createPluginMock(), {
      vaultPort: createVaultPortMock(),
      preview: {
        boardPath: 'boards/vibe-coding.md',
        changes: [change('VC-001', 'TODO', 'READY')],
        conflicts: [{
          kind: 'stale-checksum',
          issueId: 'VC-002',
          message: 'stale checksum',
          source: 'issues/vibe-coding/kanban-task-engine/VC-002-stale.md',
        }],
      },
      issueTitles: {
        'VC-001': 'Ready item',
      },
      allowApply: false,
    });

    modal.open();

    const text = collectText(modal.contentEl);
    expect(text).toContain('Title: Ready item');
    expect(text).toContain('Source issue: issues/vibe-coding/kanban-task-engine/VC-001.md');
    expect(text).toContain('Old status: TODO');
    expect(text).toContain('Proposed status: READY');
    expect(text).toContain('Conflict status: stale-checksum');
    expect(text).toContain('Conflict source: issues/vibe-coding/kanban-task-engine/VC-002-stale.md');
  });

  it('requires explicit confirmation before regenerating the generated board projection', async () => {
    const onConfirm = vi.fn();
    const modal = new SyncBoardModal(createPluginMock(), { onConfirm });

    modal.open();

    expect(collectText(modal.contentEl)).toContain('discard unapplied board-only lane edits');
    expect(onConfirm).not.toHaveBeenCalled();

    await modal.confirm();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

function createPluginMock(input: {
  settings?: Record<string, unknown>;
} = {}) {
  return {
    app: {
      vault: {
        adapter: {
          getBasePath: () => '/vault/root',
        },
        getAbstractFileByPath: () => null,
      },
      workspace: {
        getLeaf: () => ({
          openFile: vi.fn(),
        }),
      },
    },
    settings: {
      defaultSpace: 'vibe-coding',
      defaultProject: undefined,
      defaultPriority: 'P2',
      defaultExecutor: 'human',
      syncBoardAfterCreate: true,
      openIssueAfterCreate: false,
      showRibbonActions: true,
      requireApplyPreview: true,
      ...input.settings,
    },
  } as never;
}

function createVaultPortMock() {
  return {
    root: '/vault/root',
    read: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
    process: vi.fn(),
    listMarkdownFiles: vi.fn(),
  };
}

function collectText(element: unknown): string {
  const node = element as { textContent?: string; children?: unknown[] };
  return [
    node.textContent ?? '',
    ...(node.children ?? []).map(child => collectText(child)),
  ].filter(Boolean).join('\n');
}

function change(
  issueId: string,
  currentStatus: BoardStatusProposal['currentStatus'],
  proposedStatus: BoardStatusProposal['proposedStatus'],
): BoardStatusProposal {
  return {
    issueId,
    source: 'generated-card',
    boardPath: 'boards/vibe-coding.md',
    boardLane: proposedStatus,
    recordedStatus: currentStatus,
    currentStatus,
    proposedStatus,
    relativeIssuePath: `issues/vibe-coding/kanban-task-engine/${issueId}.md`,
  };
}
