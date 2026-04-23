import {
  CanonicalTaskModel,
  NormalizedStatus,
  RawStatusCategory,
} from '@kanban-task-engine/core';

export interface FirestoreTaskDoc {
  id: string;
  summary?: string;
  status?: string;
  priority?: string;
  type?: string;
  labels?: string[];
  components?: string[];
  assignee?: string;
  reporter?: string;
  sprint?: string;
  dueDate?: string;
  storyPoints?: number;
  workspace?: string;
  useAcp?: boolean;
  policyId?: string;
  lastSyncedAt?: string;
  lastSource?: string;
  checksum?: string;
  created?: string;
  updated?: string;
  completed?: string;
}

const STATUS_MAP: Record<string, NormalizedStatus> = {
  'backlog': 'TODO',
  'todo': 'TODO',
  'selected': 'READY',
  'ready': 'READY',
  'in progress': 'RUNNING',
  'active': 'RUNNING',
  'running': 'RUNNING',
  'blocked': 'FAILED',
  'failed': 'FAILED',
  'in review': 'REVIEW',
  'review': 'REVIEW',
  'done': 'DONE',
  'cancelled': 'FAILED',
};

const CATEGORY_MAP: Record<string, RawStatusCategory> = {
  'TODO': 'TODO',
  'READY': 'READY',
  'RUNNING': 'IN_PROGRESS',
  'REVIEW': 'IN_REVIEW',
  'DONE': 'DONE',
  'FAILED': 'FAILED',
};

export function firestoreDocToCanonical(
  doc: FirestoreTaskDoc,
  workspace: string
): CanonicalTaskModel {
  const rawStatus = doc.status ?? 'TODO';
  const normalized = STATUS_MAP[rawStatus.toLowerCase()] ?? 'TODO';

  return {
    task_ref: {
      provider: 'firebase',
      external_key: workspace,
      external_id: doc.id,
    },
    summary: doc.summary ?? '',
    workflow: {
      normalized_status: normalized,
      raw_status: rawStatus,
      raw_status_category: CATEGORY_MAP[normalized] ?? 'TODO',
    },
    classification: {
      issue_type: mapFirebaseTypeToCanonical(doc.type),
      priority: (doc.priority as CanonicalTaskModel['classification']['priority']) ?? 'Medium',
      labels: doc.labels ?? [],
      component: doc.components ?? [],
    },
    ownership: {
      assignee: doc.assignee ?? '',
      reporter: doc.reporter ?? '',
    },
    planning: {
      sprint: doc.sprint,
      due_date: doc.dueDate,
      estimate: doc.storyPoints ? { story_points: doc.storyPoints } : undefined,
    },
    automation: {
      policy_id: doc.policyId ?? 'default',
      on_enter: ['RUNNING'],
      on_exit: [],
      execution_profile: 'standard',
      workspace: doc.workspace ?? workspace,
      useAcp: doc.useAcp ?? false,
    },
    sync: {
      last_synced_at: doc.lastSyncedAt ?? new Date().toISOString(),
      last_source: (doc.lastSource as CanonicalTaskModel['sync']['last_source']) ?? 'firebase',
      checksum: doc.checksum,
    },
    created: doc.created,
    updated: doc.updated,
    completed: doc.completed,
  };
}

export function canonicalToFirestoreDoc(task: CanonicalTaskModel): Omit<FirestoreTaskDoc, 'id'> {
  return {
    summary: task.summary,
    status: task.workflow.raw_status,
    priority: task.classification.priority,
    type: mapCanonicalToFirebaseType(task.classification.issue_type),
    labels: task.classification.labels,
    components: task.classification.component,
    assignee: task.ownership.assignee,
    reporter: task.ownership.reporter,
    sprint: task.planning.sprint,
    dueDate: task.planning.due_date,
    storyPoints: task.planning.estimate?.story_points,
    workspace: task.automation.workspace,
    useAcp: task.automation.useAcp,
    policyId: task.automation.policy_id,
    lastSyncedAt: task.sync.last_synced_at,
    lastSource: task.sync.last_source,
    checksum: task.sync.checksum,
    created: task.created,
    updated: task.updated,
    completed: task.completed,
  };
}

function mapFirebaseTypeToCanonical(input?: string): CanonicalTaskModel['classification']['issue_type'] {
  switch ((input ?? 'task').toLowerCase()) {
    case 'epic': return 'Epic';
    case 'bug':  return 'Bug';
    case 'task':
    case 'chore':
    case 'docs':
    default:
      return 'Task';
  }
}

function mapCanonicalToFirebaseType(input: CanonicalTaskModel['classification']['issue_type']): string {
  switch (input) {
    case 'Epic': return 'epic';
    case 'Bug':  return 'bug';
    default:     return 'task';
  }
}
