import { CliHandler, fail, ok, requireIssueId } from '../index.js';
import { findIssueById, updateIssueStatus } from '../vault.js';
import { retryWithGit } from './git-lifecycle.js';

export const commandRetry: CliHandler = async (args, context) => {
  const parsed = parseRetryArgs(args);
  if (!parsed.ok) return fail(parsed.message);
  const flags = parsed.flags;
  const positional = parsed.positional;
  const issueId = requireIssueId(positional, 'retry');
  if (typeof issueId !== 'string') return issueId;

  const issue = await findIssueById(context.vaultRoot, issueId);
  if (!issue) {
    return fail(`Issue not found: ${issueId}`);
  }
  if (issue.status !== 'REVIEW' && issue.status !== 'FAILED') {
    return fail(`Issue ${issueId} is ${issue.status}; only REVIEW or FAILED issues can be retried`);
  }
  let logMessage = 'Retry requested; worktree and branch cleaned with mock git cleanup.';
  if (!flags.has('--mock-git')) {
    try {
      await retryWithGit(issue);
      logMessage = 'Retry requested; worktree and branch force-cleaned.';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`retry failed: ${message}`);
    }
  }

  await updateIssueStatus(issue, {
    status: 'READY',
    logMessage,
  });

  return ok([
    `issue: ${issue.id}`,
    'outcome: READY',
    'cleanup: forced',
  ].join('\n'));
};

type ParseRetryArgsResult =
  | { ok: true; flags: Set<string>; positional: string[] }
  | { ok: false; message: string };

function parseRetryArgs(args: string[]): ParseRetryArgsResult {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      if (arg !== '--mock-git') return { ok: false, message: `Unknown option: ${arg}` };
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
