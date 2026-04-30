import { CliHandler, fail, ok, requireIssueId } from '../index.js';
import { findIssueById, updateIssueStatus } from '../vault.js';
import { approveWithGit } from './git-lifecycle.js';

export const commandApprove: CliHandler = async (args, context) => {
  const parsed = parseApproveArgs(args);
  if (!parsed.ok) return fail(parsed.message);
  const flags = parsed.flags;
  const positional = parsed.positional;
  const issueId = requireIssueId(positional, 'approve');
  if (typeof issueId !== 'string') return issueId;

  const issue = await findIssueById(context.vaultRoot, issueId);
  if (!issue) {
    return fail(`Issue not found: ${issueId}`);
  }
  if (issue.status !== 'REVIEW') {
    return fail(`Issue ${issueId} is ${issue.status}; only REVIEW issues can be approved`);
  }
  const completedAt = new Date().toISOString();
  let logMessage = 'Approved with mock git merge.';
  if (!flags.has('--mock-git')) {
    try {
      const result = await approveWithGit(issue);
      logMessage = `Approved by ff-only merge into ${result.mergeInto}; worktree cleaned.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`approve failed: ${message}`);
    }
  }

  await updateIssueStatus(issue, {
    status: 'DONE',
    completed: completedAt,
    logMessage,
  });

  return ok([
    `issue: ${issue.id}`,
    'outcome: DONE',
    `completed: ${completedAt}`,
  ].join('\n'));
};

type ParseApproveArgsResult =
  | { ok: true; flags: Set<string>; positional: string[] }
  | { ok: false; message: string };

function parseApproveArgs(args: string[]): ParseApproveArgsResult {
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
