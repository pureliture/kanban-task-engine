export * from './types';
export { StateMachine } from './state-machine';
export { MarkdownStore, FileWatcher, WriteBack } from './store';
export { EventBus } from './event-bus';
export { PolicyEngine, PolicyRule } from './policy-engine';
export { SyncCoordinator, ConflictResolution } from './sync-coordinator';
export { IdResolver } from './id-resolver';
export { computeChecksum, hasChanged } from './checksum';
export { SYNC_EVENTS, POLICY_EVENTS } from './events';
export { StateTransition } from './types';
export { DeadLetterQueue, DeadLetterEntry } from './dead-letter-queue';export { resolveKanbanHome, getAllowedIssueBasePath, expandHome } from './config/kanban-home';

export { ModuleRunner } from './runtime/module-runner';
export type { AutomationModule, ModuleContext } from './runtime/module';
export type { RuntimePolicy, ModuleSideEffect } from './runtime/policy';
export { assertAdapterAllowed } from './runtime/adapter-policy';

export type { AutomationRecipe } from './recipes/recipe-loader';
export { parseRecipeYaml } from './recipes/recipe-loader';

export { createManualCommandTrigger } from './modules/manual-command-trigger';
export { createStateTransitionModule } from './modules/state-transition-module';

export { createAuditLogModule } from './modules/audit-log-module';
export { createGitCheckpointModule } from './modules/git-checkpoint-module';

export { renderBoardMarkdown } from './boards/board-generator';
export type { BoardIssue, RenderBoardOptions } from './boards/board-generator';
export {
  computeBoardProjectionChecksum,
  renderObsidianBoardMarkdown,
} from './boards/obsidian-board-renderer';
export type {
  ObsidianBoardIssue,
  RenderObsidianBoardOptions,
} from './boards/obsidian-board-renderer';
export { renderDataviewIndexMarkdown } from './boards/dataview-index-renderer';
export type { RenderDataviewIndexOptions } from './boards/dataview-index-renderer';
export {
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
  BoardProjectionWriteError,
} from './boards/board-projection';
export type {
  BoardProjection,
  BoardProjectionFailedWriteTarget,
  BoardProjectionTargetKind,
  BoardProjectionWriteTarget,
  BoardProjectionWriteResult,
  CollectBoardProjectionOptions,
  WriteBoardProjectionOptions,
  WriteBoardProjectionsOptions,
} from './boards/board-projection';
export { loadRegistry, parseRegistryYaml, getRegistrySpace, listRegistrySpaces } from './store/registry';
export type { VaultRegistry, RegistrySpace, RegistrySpaceType, RegistryProject } from './store/registry';
export { resolveVaultPath } from './store/vault-path';
export { allocateNextIssueId, parseIssueSequence } from './store/sequence';
export type { AllocateIssueIdOptions } from './store/sequence';
export * from './authoring';
export * from './executor';
