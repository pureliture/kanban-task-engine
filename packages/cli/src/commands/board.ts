import { CliHandler, ok } from '../index.js';
import { loadVaultIssueIndex, renderIssueBoard } from '../vault.js';

export const commandBoard: CliHandler = async (_args, context) => {
  const index = await loadVaultIssueIndex(context.vaultRoot);
  return ok(renderIssueBoard('Kanban Board', index.issues, new Date().toISOString()));
};
