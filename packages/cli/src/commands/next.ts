import { CliHandler, fail, ok } from '../index.js';
import { loadVaultIssueIndex, selectNextIssue } from '../vault.js';
import { commandRun } from './run.js';

export const commandNext: CliHandler = async (args, context) => {
  const execute = args.includes('--execute');
  if (args.some(arg => arg.startsWith('--') && arg !== '--execute' && arg !== '--agent')) {
    return fail(`Unknown option: ${args.find(arg => arg.startsWith('--') && arg !== '--execute' && arg !== '--agent')}`);
  }

  const index = await loadVaultIssueIndex(context.vaultRoot);
  const issue = selectNextIssue(index.issues);
  if (!issue) {
    return ok('No READY issues');
  }

  if (execute) {
    return commandRun([issue.id, ...args], context);
  }

  const warningText = index.warnings.length > 0 ? `\nwarnings: ${index.warnings.length}` : '';
  return ok(`${issue.id} ${issue.title} ${issue.relativePath}${warningText}`);
};
