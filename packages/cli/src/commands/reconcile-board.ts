import {
  reconcileBoard,
  type BoardReconcileConflict,
  type ReconcileBoardResult,
} from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

interface ParsedReconcileArgs {
  space: string;
  apply: boolean;
}

type ParseResult<T> = { value: T } | { error: string };

export const commandReconcileBoard: CliHandler = async (args, context) => {
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for reconcile-board');
  const parsed = parseReconcileArgs(args);
  if ('error' in parsed) return fail(parsed.error);

  try {
    const result = await reconcileBoard({
      vaultRoot: context.vaultRoot,
      space: parsed.value.space,
      apply: parsed.value.apply,
    });
    if (result.conflicts.length > 0) return fail(formatConflicts(result.space, result.conflicts));
    if (result.proposals.length === 0) return ok(`no board changes for ${result.space}`);
    return ok(parsed.value.apply ? formatApplied(result) : formatDryRun(result));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseReconcileArgs(args: string[]): ParseResult<ParsedReconcileArgs> {
  let space: string | undefined;
  let apply = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--space') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) return { error: 'Missing value for --space' };
      space = value;
      index += 1;
      continue;
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    return { error: `Unknown option: ${arg}` };
  }

  if (!space) return { error: 'Usage: kanban reconcile-board --space <space> [--dry-run|--apply]' };
  if (apply && dryRun) return { error: 'Only one of --dry-run or --apply is allowed' };
  return { value: { space, apply } };
}

function formatDryRun(result: ReconcileBoardResult): string {
  return [
    `board changes for ${result.space}`,
    ...result.proposals
      .slice()
      .sort((a, b) => a.issueId.localeCompare(b.issueId))
      .map(proposal => `${proposal.issueId} ${proposal.currentStatus} -> ${proposal.proposedStatus}: ${proposal.relativeIssuePath}`),
  ].join('\n');
}

function formatApplied(result: ReconcileBoardResult): string {
  return [
    `applied board changes for ${result.space}`,
    ...result.applied
      .slice()
      .sort((a, b) => a.issueId.localeCompare(b.issueId))
      .map(applied => `${applied.issueId} ${applied.oldStatus} -> ${applied.newStatus}: ${applied.relativePath}`),
  ].join('\n');
}

function formatConflicts(space: string, conflicts: BoardReconcileConflict[]): string {
  return [
    `board conflicts for ${space}`,
    ...conflicts
      .slice()
      .sort((a, b) => (a.issueId ?? '').localeCompare(b.issueId ?? '') || a.kind.localeCompare(b.kind))
      .map(conflict => `${conflict.issueId ?? '-'} ${conflict.kind}: ${conflict.message}`),
  ].join('\n');
}
