import YAML from 'yaml';
import type { IssueStatus, IssueType, Priority } from '@kanban-task-engine/schema';

export type IssueExecutor = 'human' | 'codex' | 'claude-code';

export interface IssueDraftInput {
  id: string;
  title: string;
  type?: IssueType;
  project: string;
  priority?: Priority;
  executor?: IssueExecutor;
  labels?: string[];
  assignee?: string;
  epic?: string;
  workingDir?: string;
  mergeInto?: string;
  now?: Date;
}

export interface IssueDraft {
  frontmatter: Record<string, unknown>;
  markdown: string;
}

export interface ExecutionReadinessInput {
  status: IssueStatus;
  type: IssueType;
  executor: IssueExecutor;
  hasPlaceholders: boolean;
}

export interface ExecutionReadinessResult {
  status: IssueStatus;
  executionReady: boolean;
  warnings: string[];
}

const PLACEHOLDER_MARKER = 'kanban:placeholder reason="missing-section-content"';
const PLACEHOLDER_BLOCKING_STATUSES = new Set<IssueStatus>(['READY', 'RUNNING', 'REVIEW', 'DONE']);

export function createIssueDraft(input: IssueDraftInput): IssueDraft {
  const type = input.type ?? 'task';
  const now = (input.now ?? new Date()).toISOString();
  const frontmatter: Record<string, unknown> = {
    id: input.id,
    title: input.title,
    type,
    status: 'TODO',
    priority: input.priority ?? 'P2',
    executor: type === 'epic' ? 'human' : input.executor ?? 'human',
    project: type === 'epic' ? '' : input.project,
    created: now,
    updated: now,
    assignee: input.assignee ?? '',
    labels: input.labels ?? [],
    depends_on: [],
  };

  if (input.epic && type !== 'epic') frontmatter.epic = input.epic;
  if (input.workingDir) frontmatter.working_dir = input.workingDir;
  if (input.mergeInto) frontmatter.merge_into = input.mergeInto;

  const body = type === 'epic' ? epicBody(input.title) : taskBody(input.title);
  return { frontmatter, markdown: serialize(frontmatter, body) };
}

export function hasKanbanPlaceholders(markdown: string): boolean {
  return markdown.includes(PLACEHOLDER_MARKER);
}

export function normalizeExecutionReadiness(input: ExecutionReadinessInput): ExecutionReadinessResult {
  if (input.hasPlaceholders && PLACEHOLDER_BLOCKING_STATUSES.has(input.status)) {
    return {
      status: 'TODO',
      executionReady: false,
      warnings: [`Placeholder content prevents ${input.status} status; normalized status to TODO`],
    };
  }

  const machineExecutor = input.executor === 'codex' || input.executor === 'claude-code';
  return {
    status: input.status,
    executionReady: input.type !== 'epic' && input.status === 'READY' && machineExecutor && !input.hasPlaceholders,
    warnings: [],
  };
}

function serialize(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${body.trimEnd()}\n`;
}

function taskBody(title: string): string {
  return `# ${title}

## 목적

- 작성 필요

## 컨텍스트

- 작성 필요

## Acceptance Criteria

- 작성 필요

## 실행 힌트

- 작성 필요

## 로그

- Created by kanban new
`;
}

function epicBody(title: string): string {
  return `# ${title}

## 목표

- 작성 필요

## 범위

- 작성 필요

## 성공 지표

- 작성 필요

## 하위 티켓

<!-- kanban:auto-render start -->
<!-- kanban:auto-render end -->

## 로그

- Created by kanban new
`;
}
