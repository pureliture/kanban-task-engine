import YAML from 'yaml';
import { isIssueStatus, IssueStatus } from './status';

export interface IssueFrontmatter {
  id: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  executor: string;
  project: string;
  created: string;
  updated: string;
  // Optional
  epic?: string;
  priority?: Priority;
  assignee?: string;
  completed?: string;
  labels?: string[];
  depends_on?: string[];
  working_dir?: string;
  merge_into?: string;
  run_count?: number;
  automation?: Record<string, unknown>;
  sync?: IssueSyncMetadata;
}

export type IssueType = 'epic' | 'task' | 'bug' | 'chore' | 'docs';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface IssueSyncMetadata {
  jira?: {
    key?: string;
    status?: string;
    exportedAt?: string;
  };
}

export interface IssueRegistryValidationContext {
  idPrefix?: string;
  spaceType?: 'single' | 'container';
}

export interface ParsedIssueMarkdown {
  frontmatter: IssueFrontmatter;
  sections: Record<string, string>;
}

export interface CanonicalIssueModel {
  task_ref: {
    provider: string;
    external_key: string;
    external_id: string;
  };
  summary: string;
  workflow: {
    normalized_status: IssueStatus;
    raw_status: string;
    raw_status_category: string;
  };
  classification: {
    issue_type: string;
    priority: string;
    labels: string[];
    component: string[];
  };
  ownership: {
    assignee: string;
    reporter: string;
  };
  planning: Record<string, unknown>;
  automation: {
    policy_id: string;
    on_enter: IssueStatus[];
    on_exit: IssueStatus[];
    execution_profile: string;
    workspace?: string;
    useAcp?: boolean;
  };
  sync: {
    last_synced_at: string;
    last_source: string;
  };
  created?: string;
  updated?: string;
  completed?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const REQUIRED_FIELDS = ['id', 'title', 'type', 'status', 'executor', 'project', 'created', 'updated'] as const;
const REQUIRED_SECTIONS_TASK = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'] as const;
const REQUIRED_SECTIONS_EPIC = ['목표', '범위', '성공 지표', '하위 티켓', '로그'] as const;
const ISSUE_TYPES = ['epic', 'task', 'bug', 'chore', 'docs'] as const;
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export function validateIssueFrontmatter(input: unknown): ValidationResult<IssueFrontmatter> {
  return validateIssueFrontmatterInternal(input, {});
}

export function validateIssueFrontmatterForRegistry(
  input: unknown,
  context: IssueRegistryValidationContext,
): ValidationResult<IssueFrontmatter> {
  return validateIssueFrontmatterInternal(input, {
    allowSingleSpaceEmptyProject: context.spaceType === 'single',
    idPrefix: context.idPrefix,
  });
}

export function validateIssueIdSegment(id: string): string[] {
  const errors: string[] = [];
  if (id.length === 0 || id.trim() !== id || id.trim() === '') {
    errors.push('Invalid issue id: must be a non-empty path segment');
  }
  if (id === '.' || id === '..' || id.includes('/') || id.includes('\\') || id.includes('\u0000')) {
    errors.push('Invalid issue id: must not contain path separators');
  }
  if (id.startsWith('-')) {
    errors.push('Invalid issue id: must not start with hyphen');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    errors.push('Invalid issue id: contains unsupported characters');
  }
  return errors;
}

function validateIssueFrontmatterInternal(
  input: unknown,
  options: { allowSingleSpaceEmptyProject?: boolean; idPrefix?: string },
): ValidationResult<IssueFrontmatter> {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Frontmatter must be an object'] };
  }

  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const v = input[field];
    const allowsEmptyProject = input.type === 'epic' || options.allowSingleSpaceEmptyProject === true;
    if (field === 'project' && allowsEmptyProject && Object.prototype.hasOwnProperty.call(input, field)) {
      continue;
    }
    if (v === undefined || v === null || v === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const field of ['id', 'title', 'executor', 'created', 'updated'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      errors.push(`Invalid field type: ${field} must be a string`);
    }
  }

  // project는 문자열이어야 하며, 빈 값 허용 여부는 required-field 검증에서 결정한다.
  if (input.project !== undefined && input.project !== null && typeof input.project !== 'string') {
    errors.push('Invalid field type: project must be a string');
  }

  if (input.status !== undefined && !isIssueStatus(input.status)) {
    errors.push(`Invalid status: ${String(input.status)}`);
  }

  if (typeof input.id === 'string') {
    errors.push(...validateIssueIdSegment(input.id));
    if (options.idPrefix && !input.id.startsWith(`${options.idPrefix}-`)) {
      errors.push(`Invalid issue id: expected prefix ${options.idPrefix}`);
    }
  }

  if (typeof input.type === 'string' && !(ISSUE_TYPES as readonly string[]).includes(input.type)) {
    errors.push(`Invalid type: ${input.type}`);
  }

  if (input.type === 'epic') {
    if (input.status !== undefined && input.status !== 'TODO' && input.status !== 'DONE') {
      errors.push(`Invalid epic status: ${String(input.status)}`);
    }
    if (input.executor !== undefined && input.executor !== 'human') {
      errors.push('Epic executor must be human');
    }
  }

  if (input.priority !== undefined && typeof input.priority === 'string'
      && !(PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.push(`Invalid priority: ${input.priority}`);
  }

  if (input.labels !== undefined && (!Array.isArray(input.labels)
      || !input.labels.every(label => typeof label === 'string'))) {
    errors.push('Invalid field type: labels must be a string array');
  }

  if (input.depends_on !== undefined && (!Array.isArray(input.depends_on)
      || !input.depends_on.every((v: unknown) => typeof v === 'string'))) {
    errors.push('Invalid field type: depends_on must be a string array');
  }

  if (input.run_count !== undefined && typeof input.run_count !== 'number') {
    errors.push('Invalid field type: run_count must be a number');
  }

  for (const field of ['jiraKey', 'jiraStatus', 'exportedAt', 'syncTarget', 'jiraProject'] as const) {
    if (input[field] !== undefined) {
      errors.push(`Deprecated field is not supported: ${field}`);
    }
  }

  for (const field of ['epic', 'assignee', 'completed', 'working_dir', 'merge_into'] as const) {
    if (input[field] !== undefined && input[field] !== null && typeof input[field] !== 'string') {
      errors.push(`Invalid field type: ${field} must be a string`);
    }
  }

  if (input.automation !== undefined && !isRecord(input.automation)) {
    errors.push('Invalid field type: automation must be an object');
  }

  if (input.sync !== undefined) {
    validateSyncMetadata(input.sync, errors);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as IssueFrontmatter };
}

export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return { ok: false, errors: ['Missing YAML frontmatter'] };

  let parsed: unknown;
  try {
    parsed = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Invalid YAML frontmatter: ${message}`] };
  }

  const frontmatterResult = validateIssueFrontmatter(parsed);
  const errors: string[] = frontmatterResult.ok ? [] : [...frontmatterResult.errors];

  const body = normalized.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);

  const issueType = isRecord(parsed) ? String(parsed.type ?? '') : '';
  const required = issueType === 'epic' ? REQUIRED_SECTIONS_EPIC : REQUIRED_SECTIONS_TASK;

  for (const section of required) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!frontmatterResult.ok) return { ok: false, errors: frontmatterResult.errors };

  return { ok: true, value: { frontmatter: frontmatterResult.value, sections } };
}

export function validateCanonicalIssue(input: unknown): ValidationResult<CanonicalIssueModel> {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Canonical issue must be an object'] };
  }

  const errors: string[] = [];
  requireString(input, 'summary', errors);
  requireRecord(input, 'task_ref', errors);
  requireRecord(input, 'workflow', errors);
  requireRecord(input, 'classification', errors);
  requireRecord(input, 'ownership', errors);
  requireRecord(input, 'planning', errors);
  requireRecord(input, 'automation', errors);
  requireRecord(input, 'sync', errors);

  if (isRecord(input.task_ref)) {
    requireString(input.task_ref, 'provider', errors, 'task_ref.provider');
    requireString(input.task_ref, 'external_key', errors, 'task_ref.external_key');
    requireString(input.task_ref, 'external_id', errors, 'task_ref.external_id');
  }

  if (isRecord(input.workflow)) {
    if (!isIssueStatus(input.workflow.normalized_status)) {
      errors.push(`Invalid canonical status: ${String(input.workflow.normalized_status)}`);
    }
    requireString(input.workflow, 'raw_status', errors, 'workflow.raw_status');
    requireString(input.workflow, 'raw_status_category', errors, 'workflow.raw_status_category');
  }

  if (isRecord(input.classification)) {
    requireString(input.classification, 'issue_type', errors, 'classification.issue_type');
    requireString(input.classification, 'priority', errors, 'classification.priority');
    requireStringArray(input.classification, 'labels', errors, 'classification.labels');
    requireStringArray(input.classification, 'component', errors, 'classification.component');
  }

  if (isRecord(input.ownership)) {
    requireString(input.ownership, 'assignee', errors, 'ownership.assignee');
    requireString(input.ownership, 'reporter', errors, 'ownership.reporter');
  }

  if (isRecord(input.automation)) {
    requireString(input.automation, 'policy_id', errors, 'automation.policy_id');
    requireIssueStatusArray(input.automation, 'on_enter', errors, 'automation.on_enter');
    requireIssueStatusArray(input.automation, 'on_exit', errors, 'automation.on_exit');
    requireString(input.automation, 'execution_profile', errors, 'automation.execution_profile');
  }

  if (isRecord(input.sync)) {
    requireString(input.sync, 'last_synced_at', errors, 'sync.last_synced_at');
    requireString(input.sync, 'last_source', errors, 'sync.last_source');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as CanonicalIssueModel };
}

function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let currentSection: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = match[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  return sections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSyncMetadata(input: unknown, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push('Invalid field type: sync must be an object');
    return;
  }
  if (input.jira !== undefined) {
    if (!isRecord(input.jira)) {
      errors.push('Invalid field type: sync.jira must be an object');
      return;
    }
    for (const field of ['key', 'status', 'exportedAt'] as const) {
      if (input.jira[field] !== undefined && typeof input.jira[field] !== 'string') {
        errors.push(`Invalid field type: sync.jira.${field} must be a string`);
      }
    }
  }
}

function requireRecord(input: Record<string, unknown>, field: string, errors: string[]): void {
  if (!isRecord(input[field])) {
    errors.push(`Invalid canonical field: ${field} must be an object`);
  }
}

function requireString(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (typeof input[field] !== 'string') {
    errors.push(`Invalid canonical field: ${label} must be a string`);
  }
}

function requireStringArray(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (!Array.isArray(input[field]) || !(input[field] as unknown[]).every(value => typeof value === 'string')) {
    errors.push(`Invalid canonical field: ${label} must be a string array`);
  }
}

function requireIssueStatusArray(input: Record<string, unknown>, field: string, errors: string[], label = field): void {
  if (!Array.isArray(input[field]) || !(input[field] as unknown[]).every(isIssueStatus)) {
    errors.push(`Invalid canonical field: ${label} must be an issue status array`);
  }
}
