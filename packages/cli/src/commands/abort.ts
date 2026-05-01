import { CliHandler, fail, ok, requireIssueId } from '../index.js';
import { findIssueById, updateIssueStatus } from '../vault.js';
import { discardAbortWithGit } from './git-lifecycle.js';

export const commandAbort: CliHandler = async (args, context) => {
  const parsed = parseAbortArgs(args);
  if (!parsed.ok) return fail(parsed.message);
  const flags = parsed.flags;
  const positional = parsed.positional;
  const issueId = requireIssueId(positional, 'abort');
  if (typeof issueId !== 'string') return issueId;

  const issue = await findIssueById(context.vaultRoot, issueId);
  if (!issue) {
    return fail(`Issue not found: ${issueId}`);
  }
  if (issue.status !== 'REVIEW' && issue.status !== 'FAILED') {
    return fail(`Issue ${issueId} is ${issue.status}; only REVIEW or FAILED issues can be aborted`);
  }
  let logMessage = flags.has('--discard') ? 'Aborted and discarded worktree with mock git cleanup.' : 'Aborted; worktree preserved.';
  if (flags.has('--discard') && !flags.has('--mock-git')) {
    try {
      const result = await discardAbortWithGit(issue);
      logMessage = `Aborted and discarded worktree after verifying kanban branch is merged into origin/${result.mergeInto}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`abort failed: ${message}`);
    }
  }

  await updateIssueStatus(issue, {
    status: 'READY',
    logMessage,
  });

  return ok([
    `issue: ${issue.id}`,
    'outcome: READY',
    `discard: ${flags.has('--discard') ? 'true' : 'false'}`,
  ].join('\n'));
};

type ParseAbortArgsResult =
  | { ok: true; flags: Set<string>; positional: string[] }
  | { ok: false; message: string };

function parseAbortArgs(args: string[]): ParseAbortArgsResult {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      if (arg !== '--discard' && arg !== '--mock-git') return { ok: false, message: `Unknown option: ${arg}` };
      flags.add(arg);
      continue;
    }
    positional.push(arg);
  }
  if (positional.length > 1) {
    return { ok: false, message: `Unexpected argument: ${positional[1]}` };
  }
  return { ok: true, flags, positional };
}
