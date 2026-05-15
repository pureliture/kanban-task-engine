export interface KanbanTaskEnginePluginSettings {
  defaultSpace: string;
  defaultProject?: string;
  defaultPriority: 'P0' | 'P1' | 'P2' | 'P3';
  defaultExecutor: string;
  syncBoardAfterCreate: boolean;
  openIssueAfterCreate: boolean;
  showRibbonActions: boolean;
  requireApplyPreview: boolean;
}

export const DEFAULT_SETTINGS: KanbanTaskEnginePluginSettings = {
  defaultSpace: 'vibe-coding',
  defaultProject: undefined,
  defaultPriority: 'P2',
  defaultExecutor: 'human',
  syncBoardAfterCreate: true,
  openIssueAfterCreate: false,
  showRibbonActions: true,
  requireApplyPreview: true,
};
