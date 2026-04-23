import YAML from 'yaml';
import { isIssueStatus, IssueStatus } from './status';

export interface IssueFrontmatter {
  id: string;
  title: string;
  issueType: string;
  project: string;
  status: IssueStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  parent?: string;
  labels?: string[];
  executor?: string;
  syncTarget?: string;
  jiraProject?: string;
  jiraKey?: string;
  automation?: Record<string, unknown>;
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

const REQUIRED_FIELDS = ['id', 'title', 'issueType', 'project', 'status', 'priority', 'createdAt', 'updatedAt'] as const;
const REQUIRED_SECTIONS = ['Goal', 'Acceptance Criteria', 'Implementation Tasks', 'Notes'] as const;
const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'sub-task'] as const;
const PRIORITIES = ['blocker', 'critical', 'high', 'medium', 'low', 'trivial'] as const;

export function validateIssueFrontmatter(input: unknown): ValidationResult<IssueFrontmatter> {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Frontmatter must be an object'] };
  }

  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const field of ['id', 'title', 'issueType', 'project', 'priority', 'createdAt', 'updatedAt'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      errors.push(`Invalid field type: ${field} must be a string`);
    }
  }

  if (input.status !== undefined && !isIssueStatus(input.status)) {
    errors.push(`Invalid status: ${String(input.status)}`);
  }

  if (typeof input.issueType === 'string' && !ISSUE_TYPES.includes(input.issueType.toLowerCase() as typeof ISSUE_TYPES[number])) {
    errors.push(`Invalid issueType: ${input.issueType}`);
  }

  if (typeof input.priority === 'string' && !PRIORITIES.includes(input.priority.toLowerCase() as typeof PRIORITIES[number])) {
    errors.push(`Invalid priority: ${input.priority}`);
  }

  if (input.labels !== undefined && (!Array.isArray(input.labels) || !input.labels.every(label => typeof label === 'string'))) {
    errors.push('Invalid field type: labels must be a string array');
  }

  if (input.automation !== undefined && !isRecord(input.automation)) {
    errors.push('Invalid field type: automation must be an object');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as IssueFrontmatter };
}

export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
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

  const body = content.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);

  for (const section of REQUIRED_SECTIONS) {
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
