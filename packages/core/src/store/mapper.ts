import { CanonicalTaskModel, NormalizedStatus, RawStatusCategory } from '../types';

// 기존 Obsidian 상태 → Canonical 상태 매핑
const STATUS_MAP: Record<string, NormalizedStatus> = {
  'backlog': 'BACKLOG',
  'in progress': 'ACTIVE',
  'in-progress': 'ACTIVE',
  'in review': 'REVIEW',
  'in-review': 'REVIEW',
  'done': 'DONE',
  'selected': 'SELECTED',
  'todo': 'SELECTED',
  'blocked': 'BLOCKED',
  'cancelled': 'CANCELLED',
};

const STATUS_CATEGORY_MAP: Record<string, RawStatusCategory> = {
  'backlog': 'BACKLOG',
  'in progress': 'IN_PROGRESS',
  'in-progress': 'IN_PROGRESS',
  'in review': 'IN_REVIEW',
  'in-review': 'IN_REVIEW',
  'done': 'DONE',
  'blocked': 'BLOCKED',
  'cancelled': 'CANCELLED',
};

export function rawStatusToNormalized(raw: string): NormalizedStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? 'BACKLOG';
}

export function normalizedToRawStatus(normalized: NormalizedStatus): string {
  const reverse: Record<string, string> = {
    'BACKLOG': 'Backlog',
    'SELECTED': 'Todo',
    'ACTIVE': 'In Progress',
    'BLOCKED': 'Blocked',
    'REVIEW': 'In Review',
    'DONE': 'Done',
    'CANCELLED': 'Cancelled',
  };
  return reverse[normalized] ?? 'Backlog';
}

export function yamlToCanonical(yaml: Record<string, unknown>, filePath: string): CanonicalTaskModel {
  const workspace = extractWorkspace(filePath);
  const rawStatus = String(yaml.status ?? 'Backlog');

  return {
    task_ref: {
      provider: 'local',
      external_key: workspace,
      external_id: String(yaml.id ?? ''),
    },
    summary: String(yaml.summary ?? ''),
    description_ref: filePath,
    workflow: {
      normalized_status: rawStatusToNormalized(rawStatus),
      raw_status: rawStatus,
      raw_status_category: STATUS_CATEGORY_MAP[rawStatus.toLowerCase()] ?? 'BACKLOG',
    },
    classification: {
      issue_type: String(yaml.issueType ?? 'Task') as CanonicalTaskModel['classification']['issue_type'],
      priority: String(yaml.priority ?? 'Medium') as CanonicalTaskModel['classification']['priority'],
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
      on_enter: ((yaml.automation as Record<string, unknown>)?.triggerOnStatus as string[])?.map(rawStatusToNormalized) ?? ['ACTIVE'],
      on_exit: [],
      execution_profile: 'standard',
      workspace: (yaml.automation as Record<string, unknown>)?.workspace ? String((yaml.automation as Record<string, unknown>).workspace) : workspace,
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
  const yaml: Record<string, unknown> = {
    id: task.task_ref.external_id,
    status: task.workflow.raw_status,
    priority: task.classification.priority,
    issueType: task.classification.issue_type,
    summary: task.summary,
    assignee: task.ownership.assignee,
    reporter: task.ownership.reporter,
    labels: task.classification.labels,
    project: task.task_ref.external_key,
    components: task.classification.component,
    sprint: task.planning.sprint,
    storyPoints: task.planning.estimate?.story_points,
    automation: {
      workspace: task.automation.workspace,
      useAcp: task.automation.useAcp,
      triggerOnStatus: task.automation.on_enter.map(normalizedToRawStatus),
      policy_id: task.automation.policy_id,
    },
    created: task.created,
    updated: task.updated ?? new Date().toISOString(),
    completed: task.completed,
  };

  if (task.planning.due_date) yaml.due_date = task.planning.due_date;

  return yaml;
}

function extractWorkspace(filePath: string): string {
  const match = filePath.match(/workspace-([^/]+)\/issues/);
  if (match) return `workspace-${match[1]}`;
  if (filePath.includes('/workspace/issues')) return 'workspace';
  return 'workspace';
}