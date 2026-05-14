import { moveIssueStatus, type MoveIssueStatusOptions } from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

type IssueStatus = MoveIssueStatusOptions['targetStatus'];

interface ParsedMoveArgs {
  issueId: string;
  status: IssueStatus;
  dryRun: boolean;
  reason?: string;
  space?: string;
}

type ParseResult<T> = { value: T } | { error: string };

const ISSUE_STATUSES = new Set<string>(['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED']);

export const commandMove: CliHandler = async (args, context) => {
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for move');
  const parsed = parseMoveArgs(args);
  if ('error' in parsed) return fail(parsed.error);

  try {
    const result = await moveIssueStatus({
      vaultRoot: context.vaultRoot,
      issueId: parsed.value.issueId,
      targetStatus: parsed.value.status,
      dryRun: parsed.value.dryRun,
      reason: parsed.value.reason,
      space: parsed.value.space,
    });
    const verb = result.dryRun ? 'would move' : 'moved';
    return ok(`${verb} ${result.issueId} ${result.oldStatus} -> ${result.newStatus}: ${result.relativePath}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseMoveArgs(args: string[]): ParseResult<ParsedMoveArgs> {
  const positionals: string[] = [];
  let dryRun = false;
  let reason: string | undefined;
  let space: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--reason') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) return { error: 'Missing value for --reason' };
      reason = value;
      index += 1;
      continue;
    }
    if (arg === '--space') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) return { error: 'Missing value for --space' };
      space = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) return { error: `Unknown option: ${arg}` };
    positionals.push(arg);
  }

  if (positionals.length !== 2) return { error: 'Usage: kanban move <issue-id> <status> [--space <space>] [--reason <text>] [--dry-run]' };
  const [issueId, rawStatus] = positionals;
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issueId)) return { error: `Invalid issue id: ${issueId}` };
  if (!ISSUE_STATUSES.has(rawStatus)) return { error: `Invalid status: ${rawStatus}` };
  return { value: { issueId, status: rawStatus as IssueStatus, dryRun, reason, space } };
}
