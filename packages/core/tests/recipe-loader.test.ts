import { describe, expect, it } from 'vitest';
import { parseRecipeYaml } from '../src/recipes/recipe-loader';

describe('recipe loader', () => {
  it('parses a valid recipe', () => {
    const recipe = parseRecipeYaml(`
mode: validate-only
modules:
  - parser
policy:
  allowedSideEffects:
    - readIssue
`);
    expect(recipe.mode).toBe('validate-only');
    expect(recipe.modules).toEqual(['parser']);
    expect(recipe.policy.allowedSideEffects).toEqual(['readIssue']);
  });

  it('rejects recipe without mode', () => {
    expect(() => parseRecipeYaml('modules: []')).toThrow('Recipe mode is required');
  });
});
