import { CanonicalTaskModel, NormalizedStatus, RawStatusCategory } from '../types';
import grayMatter from 'gray-matter';
import { parseIssueMarkdown, validateCanonicalIssue } from '@kanban-task-engine/schema';

const STATUS_MAP: Record<string, NormalizedStatus> = {
  'todo': 'TODO',
  'ready': 'READY',
  'running': 'RUNNING',
  'in progress': 'RUNNING',
  'in-progress': 'RUNNING',
  'review': 'REVIEW',
  'in review': 'REVIEW',
  'in-review': 'REVIEW',
  'done': 'DONE',
  'failed': 'FAILED',
  'blocked': 'FAILED',
};

const STATUS_CATEGORY_MAP: Record<string, RawStatusCategory> = {
  'todo': 'TODO',
  'ready': 'READY',
  'running': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  'in-progress': 'IN_PROGRESS',
  'review': 'IN_REVIEW',
  'in review': 'IN_REVIEW',
  'in-review': 'IN_REVIEW',
  'done': 'DONE',
  'failed': 'FAILED',
  'blocked': 'FAILED',
};

export function rawStatusToNormalized(raw: string): NormalizedStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? 'TODO';
}

const REVERSE_STATUS_MAP: Record<NormalizedStatus, string> = {
  'TODO': 'TODO',
  'READY': 'READY',
  'RUNNING': 'RUNNING',
  'REVIEW': 'REVIEW',
  'DONE': 'DONE',
  'FAILED': 'FAILED',
};

export function normalizedToRawStatus(normalized: NormalizedStatus): string {
  return REVERSE_STATUS_MAP[normalized] ?? 'TODO';
}

export function parseMarkdownFile(content: string): { data: Record<string, any>; body: string } {
  const { data, content: body } = grayMatter(content);

  // Normalize workspace field: top-level takes precedence
  if (data.automation?.workspace && !data.workspace) {
    data.workspace = data.automation.workspace;
  }

  // Remove duplicate if same value
  if (data.automation?.workspace === data.workspace) {
    delete data.automation.workspace;
  }

  return { data, body };
}

/**
 * Convert frontmatter to CanonicalTaskModel.
 */
export function yamlToCanonical(yaml: Record<string, unknown>, filePath: string): CanonicalTaskModel {
  const workspace = extractWorkspace(filePath);
  const rawStatus = String(yaml.status ?? 'TODO');

  return {
    task_ref: {
      provider: 'local',
      external_key: workspace,
      external_id: String(yaml.id ?? ''),
    },
    summary: String(yaml.title ?? yaml.summary ?? ''),
    description_ref: filePath,
    workflow: {
      normalized_status: rawStatusToNormalized(rawStatus),
      raw_status: rawStatus,
      raw_status_category: STATUS_CATEGORY_MAP[rawStatus.toLowerCase()] ?? 'TODO',
    },
    classification: {
      issue_type: mapTypeToCanonical(String(yaml.type ?? 'task')),
      priority: mapPriorityToCanonical(String(yaml.priority ?? 'P2')),
      labels: Array.isArray(yaml.labels) ? yaml.labels as string[] : [],
      component: Array.isArray(yaml.components) ? yaml.components as string[] : [],
    },
    ownership: {
      assignee: String(yaml.assignee ?? ''),
      reporter: String(yaml.reporter ?? ''),
    },
    planning: {
      sprint: yaml.sprint ? String(yaml.sprint) : undefined,
      due_date: yaml.due_date ? String(yaml.due_date) : undefined,
      estimate: yaml.storyPoints ? { story_points: Number(yaml.storyPoints) } : undefined,
    },
    automation: {
      policy_id: String((yaml.automation as Record<string, unknown>)?.policy_id ?? (yaml.automation as Record<string, unknown>)?.workspace ?? 'default'),
      on_enter: ((yaml.automation as Record<string, unknown>)?.onEnter as string[])?.map(rawStatusToNormalized)
        ?? ((yaml.automation as Record<string, unknown>)?.triggerOnStatus as string[])?.map(rawStatusToNormalized) // legacy field
        ?? ['READY'],
      on_exit: [],
      execution_profile: 'standard',
      workspace: String(yaml.workspace ?? workspace),
      useAcp: Boolean((yaml.automation as Record<string, unknown>)?.useAcp ?? false),
    },
    sync: {
      last_synced_at: String(yaml.updated ?? yaml.created ?? new Date().toISOString()),
      last_source: 'local',
      checksum: (yaml.sync as Record<string, unknown>)?.checksum ? String((yaml.sync as Record<string, unknown>).checksum) : undefined,
    },
    created: yaml.created ? String(yaml.created) : undefined,
    updated: yaml.updated ? String(yaml.updated) : undefined,
    completed: yaml.completed ? String(yaml.completed) : undefined,
  };
}

export function canonicalToYaml(task: CanonicalTaskModel): Record<string, unknown> {
  const automation = canonicalAutomationToYaml(task.automation);
  const yaml: Record<string, unknown> = {
    id: task.task_ref.external_id,
    status: task.workflow.raw_status,
    priority: mapPriorityToFrontmatter(task.classification.priority),
    type: mapTypeToFrontmatter(task.classification.issue_type),
    title: task.summary,
    assignee: task.ownership.assignee,
    labels: task.classification.labels,
    project: task.task_ref.external_key,
    automation,
    created: task.created,
    updated: task.updated ?? new Date().toISOString(),
    completed: task.completed,
  };

  if (task.planning.due_date) yaml.due_date = task.planning.due_date;
  if (task.sync.jira) {
    yaml.sync = { jira: task.sync.jira };
  }

  return yaml;
}

function canonicalAutomationToYaml(taskAutomation: CanonicalTaskModel['automation']): Record<string, unknown> {
  const automation: Record<string, unknown> = {
    workspace: taskAutomation.workspace,
    useAcp: taskAutomation.useAcp,
    onEnter: taskAutomation.on_enter.map(normalizedToRawStatus),
    policy_id: taskAutomation.policy_id,
  };

  if (taskAutomation.trigger !== undefined) {
    automation.trigger = taskAutomation.trigger;
  }
  if (taskAutomation.allowedActions !== undefined) {
    automation.allowedActions = taskAutomation.allowedActions;
  }
  for (const [key, value] of Object.entries(taskAutomation.extra ?? {})) {
    if (automation[key] === undefined) {
      automation[key] = value;
    }
  }

  return automation;
}

function extractWorkspace(filePath: string): string {
  const match = filePath.match(/workspace-([^/]+)\/issues/);
  if (match) return `workspace-${match[1]}`;
  if (filePath.includes('/workspace/issues')) return 'workspace';
  return 'workspace';
}

export function markdownIssueToCanonical(content: string, filePath: string): CanonicalTaskModel {
  const parsed = parseIssueMarkdown(content);
  if (!parsed.ok) {
    throw new Error(parsed.errors.join('; '));
  }

  const { frontmatter } = parsed.value;
  const task: CanonicalTaskModel = {
    task_ref: {
      provider: 'local',
      external_key: frontmatter.project,
      external_id: frontmatter.id,
    },
    summary: frontmatter.title,
    description_ref: filePath,
    workflow: {
      normalized_status: frontmatter.status,
      raw_status: frontmatter.status,
      raw_status_category: frontmatter.status === 'RUNNING' ? 'IN_PROGRESS' :
        frontmatter.status === 'REVIEW' ? 'IN_REVIEW' :
        frontmatter.status,
    },
    classification: {
      issue_type: mapTypeToCanonical(frontmatter.type),
      priority: mapPriorityToCanonical(frontmatter.priority ?? 'P2'),
      labels: frontmatter.labels ?? [],
      component: [],
    },
    ownership: {
      assignee: '',
      reporter: '',
    },
    planning: {},
    automation: buildCanonicalAutomation(frontmatter),
    sync: {
      last_synced_at: frontmatter.updated,
      last_source: 'local',
      jira: frontmatter.sync?.jira,
    },
    created: frontmatter.created,
    updated: frontmatter.updated,
    completed: frontmatter.completed,
  };

  const canonical = validateCanonicalIssue(task);
  if (!canonical.ok) {
    throw new Error(canonical.errors.join('; '));
  }

  return task;
}

type SerializableAutomationValue =
  | string
  | number
  | boolean
  | null
  | SerializableAutomationValue[]
  | { [key: string]: SerializableAutomationValue };

function buildCanonicalAutomation(frontmatter: {
  project: string;
  executor: string;
  automation?: Record<string, unknown>;
}): CanonicalTaskModel['automation'] {
  const source = frontmatter.automation ?? {};
  const automation: CanonicalTaskModel['automation'] = {
    policy_id: String(source.policy_id ?? 'default'),
    on_enter: [],
    on_exit: [],
    execution_profile: 'standard',
    workspace: frontmatter.project,
    useAcp: frontmatter.executor === 'claude-code',
  };

  if (typeof source.trigger === 'string') {
    automation.trigger = source.trigger;
  }

  if (Array.isArray(source.allowedActions) && source.allowedActions.every(action => typeof action === 'string')) {
    automation.allowedActions = [...source.allowedActions];
  }

  const extra = collectAutomationExtra(source);
  if (Object.keys(extra).length > 0) {
    automation.extra = extra;
  }

  return automation;
}

function collectAutomationExtra(source: Record<string, unknown>): Record<string, SerializableAutomationValue> {
  const knownKeys = new Set([
    'policy_id',
    'onEnter',
    'on_enter',
    'onExit',
    'on_exit',
    'triggerOnStatus',
    'execution_profile',
    'workspace',
    'useAcp',
    'trigger',
    'allowedActions',
  ]);
  const extra: Record<string, SerializableAutomationValue> = {};
  for (const [key, value] of Object.entries(source)) {
    if (knownKeys.has(key)) continue;
    const serializable = toSerializableAutomationValue(value);
    if (serializable !== undefined) {
      extra[key] = serializable;
    }
  }
  return extra;
}

function toSerializableAutomationValue(value: unknown): SerializableAutomationValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(toSerializableAutomationValue);
    return values.every((entry): entry is SerializableAutomationValue => entry !== undefined) ? values : undefined;
  }
  if (isRecord(value)) {
    const record: Record<string, SerializableAutomationValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const serializable = toSerializableAutomationValue(entry);
      if (serializable === undefined) return undefined;
      record[key] = serializable;
    }
    return record;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapTypeToCanonical(input: string): CanonicalTaskModel['classification']['issue_type'] {
  switch (input.toLowerCase()) {
    case 'epic': return 'Epic';
    case 'bug':  return 'Bug';
    case 'task':
    case 'chore':
    case 'docs':
    default:
      return 'Task';
  }
}

function mapTypeToFrontmatter(input: CanonicalTaskModel['classification']['issue_type']): string {
  switch (input) {
    case 'Epic':     return 'epic';
    case 'Bug':      return 'bug';
    case 'Story':    return 'task';
    case 'Sub-task': return 'task';
    case 'Task':
    default:         return 'task';
  }
}

const PRIORITY_TO_CANONICAL: Record<string, CanonicalTaskModel['classification']['priority']> = {
  P0: 'Blocker',
  P1: 'High',
  P2: 'Medium',
  P3: 'Low',
};

const PRIORITY_TO_FRONTMATTER: Record<string, string> = {
  Blocker:  'P0',
  Critical: 'P0',
  High:     'P1',
  Medium:   'P2',
  Low:      'P3',
  Trivial:  'P3',
};

function mapPriorityToCanonical(input: string): CanonicalTaskModel['classification']['priority'] {
  return PRIORITY_TO_CANONICAL[input] ?? 'Medium';
}

function mapPriorityToFrontmatter(input: CanonicalTaskModel['classification']['priority']): string {
  return PRIORITY_TO_FRONTMATTER[input] ?? 'P2';
}
