import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

  it('rejects unknown recipe modes instead of defaulting to Home policy', () => {
    expect(() => parseRecipeYaml(`
mode: work-jira-export
modules: []
policy:
  allowedSideEffects: []
`)).toThrow('Invalid recipe mode: work-jira-export');
  });

  it('rejects recipe modules that have no runtime module mapping', () => {
    expect(() => parseRecipeYaml(`
mode: home-full-auto
modules:
  - watcher
policy:
  allowedSideEffects:
    - readIssue
`)).toThrow('Invalid recipe module: watcher');
  });

  it('keeps validate-only recipes read-only by default', () => {
    const recipe = parseRecipeYaml(`
mode: validate-only
modules:
  - parser
  - validator
policy:
  allowedSideEffects:
    - readIssue
`);

    expect(recipe.policy.mode).toBe('validate-only');
    expect(recipe.policy.automationCanMoveIssues).toBe(false);
    expect(recipe.policy.automationCanStartExecution).toBe(false);
    expect(recipe.policy.externalSync).toBe('none');
  });

  it('loads the bundled work Jira export recipe with Work-safe policy gates', async () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const content = await readFile(path.join(repoRoot, 'recipes/work-jira-export.yaml'), 'utf8');
    const recipe = parseRecipeYaml(content);

    expect(recipe.mode).toBe('work');
    expect(recipe.modules).toEqual(['parser', 'validator', 'jira-exporter', 'audit-log']);
    expect(recipe.policy.mode).toBe('work');
    expect(recipe.policy.automationCanMoveIssues).toBe(false);
    expect(recipe.policy.automationCanStartExecution).toBe(false);
    expect(recipe.policy.externalSync).toBe('atlassian-only');
    expect(recipe.policy.allowedAdapters).toEqual(['jira']);
    expect(recipe.policy.deniedAdapters).toEqual(['firebase', 'openclaw', 'claude-code', 'codex', 'cli']);
    expect(recipe.policy.writeBack).toEqual({
      allowedFields: ['sync.jira.key', 'sync.jira.status', 'sync.jira.exportedAt'],
      bodyAllowed: false,
    });
  });
});
