import YAML from 'yaml';
import { RuntimePolicy } from '../runtime/policy';

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

export function parseRecipeYaml(content: string): AutomationRecipe {
  const parsed = YAML.parse(content) as Partial<AutomationRecipe> | null;
  if (!parsed || typeof parsed.mode !== 'string' || parsed.mode.trim() === '') {
    throw new Error('Recipe mode is required');
  }
  if (!Array.isArray(parsed.modules) || !parsed.modules.every(m => typeof m === 'string')) {
    throw new Error('Recipe modules must be an array of strings');
  }
  if (!parsed.policy || !Array.isArray(parsed.policy.allowedSideEffects)) {
    throw new Error('Recipe policy.allowedSideEffects must be an array');
  }
  for (const se of parsed.policy.allowedSideEffects) {
    if (!VALID_SIDE_EFFECTS.has(se as string)) {
      throw new Error(`Invalid side effect in policy: ${se}`);
    }
  }
  return parsed as AutomationRecipe;
}
