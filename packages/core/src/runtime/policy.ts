export type ModuleSideEffect =
  | 'readIssue'
  | 'writeIssue'
  | 'startExecution'
  | 'writeEvent'
  | 'gitCommit'
  | 'externalRequest';

export interface RuntimePolicy {
  allowedSideEffects: ModuleSideEffect[];
}

export function assertSideEffectsAllowed(moduleName: string, required: ModuleSideEffect[], policy: RuntimePolicy): void {
  for (const sideEffect of required) {
    if (!policy.allowedSideEffects.includes(sideEffect)) {
      throw new Error(`Module ${moduleName} requires disallowed side effect: ${sideEffect}`);
    }
  }
}
