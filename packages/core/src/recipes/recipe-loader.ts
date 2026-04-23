import YAML from 'yaml';
import { RuntimePolicy } from '../runtime/policy';

export interface AutomationRecipe {
  mode: string;
  vaultPath?: string;
  modules: string[];
  policy: RuntimePolicy;
}

export function parseRecipeYaml(content: string): AutomationRecipe {
  const parsed = YAML.parse(content) as Partial<AutomationRecipe> | null;
  if (!parsed || typeof parsed.mode !== 'string' || parsed.mode.trim() === '') {
    throw new Error('Recipe mode is required');
  }
  if (!Array.isArray(parsed.modules)) {
    throw new Error('Recipe modules must be an array');
  }
  if (!parsed.policy || !Array.isArray(parsed.policy.allowedSideEffects)) {
    throw new Error('Recipe policy.allowedSideEffects must be an array');
  }
  return parsed as AutomationRecipe;
}
