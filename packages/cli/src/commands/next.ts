import { CliHandler, ok } from '../index.js';
import { loadVaultIssueIndex, selectNextIssue } from '../vault.js';

export const commandNext: CliHandler = async (_args, context) => {
  const index = await loadVaultIssueIndex(context.vaultRoot);
  const issue = selectNextIssue(index.issues);
  if (!issue) {
    return ok('No READY issues');
  }

  const warningText = index.warnings.length > 0 ? `\nwarnings: ${index.warnings.length}` : '';
  return ok(`${issue.id} ${issue.title} ${issue.relativePath}${warningText}`);
};
