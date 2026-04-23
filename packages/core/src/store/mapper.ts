import { CanonicalTaskModel, NormalizedStatus, RawStatusCategory } from '../types';
import grayMatter from 'gray-matter';

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
    summary: String(yaml.summary ?? ''),
    description_ref: filePath,
    workflow: {
      normalized_status: rawStatusToNormalized(rawStatus),
      raw_status: rawStatus,
      raw_status_category: STATUS_CATEGORY_MAP[rawStatus.toLowerCase()] ?? 'TODO',
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
      on_enter: ((yaml.automation as Record<string, unknown>)?.triggerOnStatus as string[])?.map(rawStatusToNormalized) ?? ['READY'],
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
