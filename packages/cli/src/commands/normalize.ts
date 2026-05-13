import { normalizeIssue } from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

interface ParsedNormalizeArgs {
  sourcePath: string;
  space?: string;
  project?: string;
  write: boolean;
  json?: boolean;
}

type ParseResult<T> = { value: T } | { error: string };

export const commandNormalize: CliHandler = async (args, context) => {
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for kanban normalize');
  const parsed = parseNormalizeArgs(args);
  if ('error' in parsed) return fail(parsed.error);

  try {
    const result = await normalizeIssue({
      vaultRoot: context.vaultRoot,
      sourcePath: parsed.value.sourcePath,
      space: parsed.value.space,
      project: parsed.value.project,
      write: parsed.value.write,
    });
    if (parsed.value.json) {
      return ok(JSON.stringify({
        id: result.id,
        sourcePath: result.sourcePath,
        targetPath: result.targetPath,
        wrote: result.wrote,
        inPlace: result.inPlace,
        warnings: result.warnings,
        hasPlaceholders: result.hasPlaceholders,
        executionReady: result.executionReady,
      }));
    }

    const summary = `${result.wrote ? 'normalized' : 'check'} ${result.id} ${result.targetPath}`;
    return ok(result.warnings.length > 0 ? `${summary}\n${result.warnings.join('\n')}` : summary);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseNormalizeArgs(args: string[]): ParseResult<ParsedNormalizeArgs> {
  const value: Omit<ParsedNormalizeArgs, 'sourcePath' | 'write'> = {};
  const paths: string[] = [];
  let write: boolean | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check') {
      if (write !== undefined) return { error: 'Exactly one of --check or --write is required' };
      write = false;
    } else if (arg === '--write') {
      if (write !== undefined) return { error: 'Exactly one of --check or --write is required' };
      write = true;
    } else if (arg === '--space') {
      const option = readOptionValue(args, ++i, '--space');
      if ('error' in option) return option;
      value.space = option.value;
    } else if (arg === '--project') {
      const option = readOptionValue(args, ++i, '--project');
      if ('error' in option) return option;
      value.project = option.value;
    } else if (arg === '--json') {
      value.json = true;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else {
      paths.push(arg);
    }
  }

  if (paths.length !== 1) return { error: 'Usage: kanban normalize <path> (--check|--write)' };
  if (write === undefined) return { error: 'Exactly one of --check or --write is required' };
  return { value: { ...value, sourcePath: paths[0], write } };
}

function readOptionValue(args: string[], index: number, option: string): ParseResult<string> {
  const value = args[index];
  if (!value || value.startsWith('--')) return { error: `Missing value for ${option}` };
  return { value };
}
