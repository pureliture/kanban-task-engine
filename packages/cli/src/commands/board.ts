import {
  BoardProjectionWriteError,
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
  type BoardProjectionWriteResult,
} from '@kanban-task-engine/core';
import { CliHandler, fail, ok } from '../index.js';
import { loadVaultIssueIndex, renderIssueBoard } from '../vault.js';

interface BoardArgs {
  write: boolean;
  all: boolean;
  space?: string;
}

export const commandBoard: CliHandler = async (args, context) => {
  const parsed = parseBoardArgs(args);
  if ('exitCode' in parsed) return parsed;

  if (parsed.write && !context.vaultRootExplicit) {
    return fail('KANBAN_HOME must be explicitly set for board --write');
  }

  try {
    if (parsed.write) {
      const generatedAt = new Date().toISOString();
      const results = parsed.all
        ? await writeBoardProjections({ vaultRoot: context.vaultRoot, all: true, generatedAt })
        : [await writeBoardProjection({
          vaultRoot: context.vaultRoot,
          space: parsed.space as string,
          generatedAt,
        })];
      return ok(formatWriteResults(results));
    }

    if (parsed.space) {
      const projection = await collectBoardProjection({
        vaultRoot: context.vaultRoot,
        space: parsed.space,
        generatedAt: new Date().toISOString(),
      });
      return ok(projection.boardMarkdown);
    }

    const index = await loadVaultIssueIndex(context.vaultRoot);
    return ok(renderIssueBoard('Kanban Board', index.issues, new Date().toISOString()));
  } catch (error) {
    if (error instanceof BoardProjectionWriteError) {
      return fail(formatProjectionWriteError(error));
    }
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseBoardArgs(args: string[]): BoardArgs | ReturnType<typeof fail> {
  const parsed: BoardArgs = { write: false, all: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      parsed.write = true;
      continue;
    }
    if (arg === '--all') {
      parsed.all = true;
      continue;
    }
    if (arg === '--space') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        return fail('Missing value for --space');
      }
      parsed.space = value;
      index += 1;
      continue;
    }
    return fail(`Unknown option: ${arg}`);
  }

  if (parsed.all && !parsed.write) {
    return fail('--all requires --write');
  }
  const hasSpace = parsed.space !== undefined;
  if (parsed.write && hasSpace === parsed.all) {
    return fail('Exactly one of --space or --all is required for board --write');
  }
  if (hasSpace && parsed.all) {
    return fail('Exactly one of --space or --all is required for board');
  }

  return parsed;
}

function formatWriteResults(results: BoardProjectionWriteResult[]): string {
  return results.map(result => [
    `wrote ${result.space} board: ${result.boardRelativePath}`,
    `wrote ${result.space} index: ${result.indexRelativePath}`,
    `issues: ${result.issueCount}`,
  ].join('\n')).join('\n');
}

function formatProjectionWriteError(error: BoardProjectionWriteError): string {
  return [
    error.message,
    ...error.succeeded.map(target => `succeeded ${target.space} ${target.kind}: ${target.relativePath}`),
    ...error.failed.map(target => `failed ${target.space} ${target.kind}: ${target.relativePath} (${target.error})`),
  ].join('\n');
}
