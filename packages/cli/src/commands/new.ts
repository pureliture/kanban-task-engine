import { createIssue, type CreateIssueInput } from '@kanban-task-engine/core';
import { type CliHandler, fail, ok } from '../index.js';

type IssueType = NonNullable<CreateIssueInput['type']>;
type Priority = NonNullable<CreateIssueInput['priority']>;
type Executor = NonNullable<CreateIssueInput['executor']>;

type ParsedNewArgs = Omit<CreateIssueInput, 'vaultRoot'> & {
  labels: string[];
  json?: boolean;
};

interface NewArgsDraft {
  space?: string;
  project?: string;
  type?: IssueType;
  priority?: Priority;
  executor?: Executor;
  epic?: string;
  labels: string[];
  assignee?: string;
  workingDir?: string;
  mergeInto?: string;
  dryRun?: boolean;
  json?: boolean;
  title?: string;
}

type ParseResult<T> = { value: T } | { error: string };

const ISSUE_TYPES = new Set<string>(['task', 'bug', 'chore', 'docs', 'epic']);
const PRIORITIES = new Set<string>(['P0', 'P1', 'P2', 'P3']);
const EXECUTORS = new Set<string>(['human', 'codex', 'claude-code']);

export const commandNew: CliHandler = async (args, context) => {
  if (!context.vaultRootExplicit) return fail('KANBAN_HOME must be explicitly set for kanban new');
  const parsed = parseNewArgs(args);
  if ('error' in parsed) return fail(parsed.error);
  try {
    const result = await createIssue({ vaultRoot: context.vaultRoot, ...parsed.value });
    if (parsed.value.json) {
      return ok(JSON.stringify({
        id: result.id,
        path: result.relativePath,
        created: result.created,
        markdown: parsed.value.dryRun ? result.markdown : undefined,
        warnings: result.warnings,
      }));
    }
    const summary = `${result.created ? 'created' : 'dry-run'} ${result.id} ${result.relativePath}`;
    return ok(result.created ? summary : `${summary}\n\n${result.markdown}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

function parseNewArgs(args: string[]): ParseResult<ParsedNewArgs> {
  const value: NewArgsDraft = { labels: [] };
  const titleParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--space') {
      const option = readOptionValue(args, ++i, '--space');
      if ('error' in option) return option;
      value.space = option.value;
    } else if (arg === '--project') {
      const option = readOptionValue(args, ++i, '--project');
      if ('error' in option) return option;
      value.project = option.value;
    } else if (arg === '--type') {
      const option = readOptionValue(args, ++i, '--type');
      if ('error' in option) return option;
      if (!ISSUE_TYPES.has(option.value)) return { error: `Invalid value for --type: ${option.value}` };
      value.type = option.value as IssueType;
    } else if (arg === '--priority') {
      const option = readOptionValue(args, ++i, '--priority');
      if ('error' in option) return option;
      if (!PRIORITIES.has(option.value)) return { error: `Invalid value for --priority: ${option.value}` };
      value.priority = option.value as Priority;
    } else if (arg === '--executor') {
      const option = readOptionValue(args, ++i, '--executor');
      if ('error' in option) return option;
      if (!EXECUTORS.has(option.value)) return { error: `Invalid value for --executor: ${option.value}` };
      value.executor = option.value as Executor;
    } else if (arg === '--epic') {
      const option = readOptionValue(args, ++i, '--epic');
      if ('error' in option) return option;
      value.epic = option.value;
    } else if (arg === '--label') {
      const option = readOptionValue(args, ++i, '--label');
      if ('error' in option) return option;
      value.labels.push(option.value);
    } else if (arg === '--assignee') {
      const option = readOptionValue(args, ++i, '--assignee');
      if ('error' in option) return option;
      value.assignee = option.value;
    } else if (arg === '--working-dir') {
      const option = readOptionValue(args, ++i, '--working-dir');
      if ('error' in option) return option;
      value.workingDir = option.value;
    } else if (arg === '--merge-into') {
      const option = readOptionValue(args, ++i, '--merge-into');
      if ('error' in option) return option;
      value.mergeInto = option.value;
    } else if (arg === '--dry-run') {
      value.dryRun = true;
    } else if (arg === '--json') {
      value.json = true;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option: ${arg}` };
    } else {
      titleParts.push(arg);
    }
  }
  value.title = titleParts.join(' ').trim();
  const space = value.space;
  const title = value.title;
  if (!space) return { error: 'Usage: kanban new --space <space> [--project <project>] "<title>"' };
  if (!title) return { error: 'Title is required' };
  const validationError = validateNewArgs(value);
  if (validationError) return { error: validationError };
  return { value: { ...value, space, title } };
}

function validateNewArgs(value: NewArgsDraft): string | undefined {
  if (value.epic && !/^[A-Z][A-Z0-9]*-\d+$/.test(value.epic)) return `Invalid value for --epic: ${value.epic}`;
  if (value.workingDir && /[\0\r\n]/.test(value.workingDir)) return 'Invalid value for --working-dir';
  if (value.mergeInto && isUnsafeMergeInto(value.mergeInto)) {
    return 'Invalid value for --merge-into';
  }
  value.labels = value.labels.map(label => label.trim()).filter(Boolean);
  return undefined;
}

function readOptionValue(args: string[], index: number, option: string): ParseResult<string> {
  const value = args[index];
  if (!value || value.startsWith('--')) return { error: `Missing value for ${option}` };
  return { value };
}

function isUnsafeMergeInto(value: string): boolean {
  const branch = value.trim().replace(/^origin\//, '');
  return (
    value.trim() === '' ||
    /[\0\r\n]/.test(value) ||
    branch === '' ||
    branch.startsWith('-') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock') ||
    /[\s~^:?*[\\]/.test(branch)
  );
}
