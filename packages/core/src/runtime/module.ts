import { RuntimePolicy, ModuleSideEffect } from './policy';

export interface ModuleContext {
  values: Record<string, unknown>;
  policy: RuntimePolicy;
}

export interface AutomationModule {
  name: string;
  sideEffects: ModuleSideEffect[];
  run(context: ModuleContext): Promise<ModuleContext>;
}
