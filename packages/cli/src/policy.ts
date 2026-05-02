import fs from 'fs/promises';
import path from 'path';
import { parseRecipeYaml, type RuntimePolicy } from '@kanban-task-engine/core';
import type { CliContext } from './context.js';

const DEFAULT_HOME_RECIPE = `
mode: home-assisted
modules:
  - manual-command-trigger
  - state-transition
  - claude-code-executor
  - audit-log
  - git-checkpoint
policy:
  allowedSideEffects:
    - readIssue
    - writeIssue
    - startExecution
    - writeEvent
    - gitCommit
  allowedAdapters:
    - claude-code
    - codex
    - cli
`;

export async function loadActiveRecipePolicy(context: CliContext): Promise<RuntimePolicy> {
  const recipe = await readFirstExisting([
    context.recipePath,
    path.join(context.vaultRoot, 'config', 'active-recipe.yaml'),
    path.resolve(process.cwd(), 'recipes/home-assisted.yaml'),
  ]);

  return parseRecipeYaml(recipe ?? DEFAULT_HOME_RECIPE).policy;
}

async function readFirstExisting(paths: Array<string | undefined>): Promise<string | null> {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }
  return null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
