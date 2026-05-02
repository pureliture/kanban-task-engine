import YAML from 'yaml';
import { ADAPTER_IDS, RuntimePolicy } from '../runtime/policy';

export interface AutomationRecipe {
  mode: string;
  vaultPath?: string;
  modules: string[];
  policy: RuntimePolicy;
}

const VALID_SIDE_EFFECTS = new Set([
  'readIssue',
  'writeIssue',
  'startExecution',
  'writeEvent',
  'gitCommit',
  'externalRequest'
]);

const VALID_RECIPE_MODES = new Set(['home', 'home-assisted', 'home-full-auto', 'validate-only', 'work']);
const VALID_RECIPE_MODULES = new Set([
  'parser',
  'validator',
  'manual-command-trigger',
  'state-transition',
  'claude-code-executor',
  'jira-exporter',
  'audit-log',
  'git-checkpoint',
]);

export function parseRecipeYaml(content: string): AutomationRecipe {
  const parsed = YAML.parse(content) as Partial<AutomationRecipe> | null;
  if (!parsed || typeof parsed.mode !== 'string' || parsed.mode.trim() === '') {
    throw new Error('Recipe mode is required');
  }
  if (!Array.isArray(parsed.modules) || !parsed.modules.every(m => typeof m === 'string')) {
    throw new Error('Recipe modules must be an array of strings');
  }
  for (const moduleName of parsed.modules) {
    if (!VALID_RECIPE_MODULES.has(moduleName)) {
      throw new Error(`Invalid recipe module: ${moduleName}`);
    }
  }
  if (!VALID_RECIPE_MODES.has(parsed.mode)) {
    throw new Error(`Invalid recipe mode: ${parsed.mode}`);
  }
  if (!parsed.policy || !Array.isArray(parsed.policy.allowedSideEffects)) {
    throw new Error('Recipe policy.allowedSideEffects must be an array');
  }
  for (const se of parsed.policy.allowedSideEffects) {
    if (!VALID_SIDE_EFFECTS.has(se as string)) {
      throw new Error(`Invalid side effect in policy: ${se}`);
    }
  }
  for (const adapter of parsed.policy.allowedAdapters ?? []) {
    if (!(ADAPTER_IDS as readonly string[]).includes(adapter as string)) {
      throw new Error(`Invalid adapter id: ${adapter}`);
    }
  }
  for (const adapter of parsed.policy.deniedAdapters ?? []) {
    if (!(ADAPTER_IDS as readonly string[]).includes(adapter as string)) {
      throw new Error(`Invalid adapter id: ${adapter}`);
    }
  }

  const runtimeMode = parsed.mode === 'work' ? 'work' : parsed.mode === 'validate-only' ? 'validate-only' : 'home';
  parsed.policy = {
    mode: runtimeMode,
    automationCanMoveIssues: runtimeMode === 'home',
    automationCanStartExecution: runtimeMode === 'home',
    externalSync: runtimeMode === 'work' ? 'atlassian-only' : runtimeMode === 'validate-only' ? 'none' : 'home-automation',
    allowedAdapters: [],
    deniedAdapters: [],
    allowedExecutionRoots: [],
    writeBack: { allowedFields: [], bodyAllowed: false },
    ...parsed.policy,
  };
  return parsed as AutomationRecipe;
}
