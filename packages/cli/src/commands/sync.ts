import { CliHandler, ok } from '../index.js';
import { CliIssueStatus, loadVaultIssueIndex } from '../vault.js';

const STATUSES: CliIssueStatus[] = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'];

export const commandSync: CliHandler = async (_args, context) => {
  const index = await loadVaultIssueIndex(context.vaultRoot);
  const lines = [
    `vault: ${context.vaultRoot}`,
    `issues: ${index.issues.length}`,
    ...STATUSES.map(status => `${status}: ${index.issues.filter(issue => issue.status === status).length}`),
    `warnings: ${index.warnings.length}`,
  ];

  return ok(lines.join('\n'));
};
