import { commandAbort } from './commands/abort.js';
import { commandApprove } from './commands/approve.js';
import { commandBoard } from './commands/board.js';
import { commandNew } from './commands/new.js';
import { commandNext } from './commands/next.js';
import { commandNormalize } from './commands/normalize.js';
import { commandRetry } from './commands/retry.js';
import { commandRecoverRun } from './commands/recover-run.js';
import { commandRun } from './commands/run.js';
import { commandSync } from './commands/sync.js';
import { CliContext, createCliContext } from './context.js';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CliHandler = (args: string[], context: CliContext) => Promise<CliResult> | CliResult;

const handlers: Record<string, CliHandler> = {
  new: commandNew,
  normalize: commandNormalize,
  run: commandRun,
  next: commandNext,
  approve: commandApprove,
  abort: commandAbort,
  retry: commandRetry,
  'recover-run': commandRecoverRun,
  sync: commandSync,
  board: commandBoard,
};

export async function runCli(argv: string[], context = createCliContext()): Promise<CliResult> {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') {
    return ok(helpText());
  }

  const handler = handlers[command];
  if (!handler) {
    return fail(`Unknown command: ${command}\n\n${helpText()}`);
  }

  return handler(args, context);
}

export function ok(stdout: string): CliResult {
  return { exitCode: 0, stdout: stdout.endsWith('\n') ? stdout : `${stdout}\n`, stderr: '' };
}

export function fail(stderr: string): CliResult {
  return { exitCode: 1, stdout: '', stderr: stderr.endsWith('\n') ? stderr : `${stderr}\n` };
}

export function requireIssueId(args: string[], command: string): string | CliResult {
  const [issueId] = args;
  if (!issueId) {
    return fail(`Usage: kanban ${command} <issue-id>`);
  }
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issueId)) {
    return fail(`Invalid issue id: ${issueId}`);
  }
  return issueId;
}

export function helpText(): string {
  return [
    'Usage: kanban <command> [args]',
    '',
    'Commands:',
    '  new --space <space> [--project <project>] "<title>"',
    '  normalize <path> (--check|--write)',
    '  run <issue-id>',
    '  next',
    '  approve <issue-id>',
    '  abort <issue-id>',
    '  retry <issue-id>',
    '  recover-run <issue-id>',
    '  sync',
    '  board [--space <space>] [--write (--space <space>|--all)]',
  ].join('\n');
}
