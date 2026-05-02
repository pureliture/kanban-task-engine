export type ModuleSideEffect =
  | 'readIssue'
  | 'writeIssue'
  | 'startExecution'
  | 'writeEvent'
  | 'gitCommit'
  | 'externalRequest';

export type RuntimeMode = 'home' | 'work' | 'validate-only';
export type ExternalSyncPolicy = 'none' | 'atlassian-only' | 'home-automation';
export type AdapterId = 'jira' | 'firebase' | 'openclaw' | 'claude-code' | 'codex' | 'cli';

export interface RuntimePolicy {
  mode?: RuntimeMode;
  automationCanMoveIssues?: boolean;
  automationCanStartExecution?: boolean;
  externalSync?: ExternalSyncPolicy;
  allowedAdapters?: AdapterId[];
  deniedAdapters?: AdapterId[];
  allowedExecutionRoots?: string[];
  writeBack?: {
    allowedFields: string[];
    bodyAllowed: boolean;
  };
  jira?: {
    allowedHosts: string[];
  };
  allowedSideEffects: ModuleSideEffect[];
}

export const ADAPTER_IDS: readonly AdapterId[] = [
  'jira',
  'firebase',
  'openclaw',
  'claude-code',
  'codex',
  'cli',
];

export function assertSideEffectsAllowed(moduleName: string, required: ModuleSideEffect[], policy: RuntimePolicy): void {
  for (const sideEffect of required) {
    if (!policy.allowedSideEffects.includes(sideEffect)) {
      throw new Error(`Module ${moduleName} requires disallowed side effect: ${sideEffect}`);
    }
  }
}
