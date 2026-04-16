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
  issueType?: string;
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
  'backlog': 'BACKLOG',
  'todo': 'SELECTED',
  'selected': 'SELECTED',
  'in progress': 'ACTIVE',
  'active': 'ACTIVE',
  'blocked': 'BLOCKED',
  'in review': 'REVIEW',
  'review': 'REVIEW',
  'done': 'DONE',
  'cancelled': 'CANCELLED',
};

const CATEGORY_MAP: Record<string, RawStatusCategory> = {
  'BACKLOG': 'BACKLOG',
  'SELECTED': 'BACKLOG',
  'ACTIVE': 'IN_PROGRESS',
  'BLOCKED': 'BLOCKED',
  'REVIEW': 'IN_REVIEW',
  'DONE': 'DONE',
  'CANCELLED': 'CANCELLED',
};

export function firestoreDocToCanonical(
  doc: FirestoreTaskDoc,
  workspace: string
): CanonicalTaskModel {
  const rawStatus = doc.status ?? 'Backlog';
  const normalized = STATUS_MAP[rawStatus.toLowerCase()] ?? 'BACKLOG';

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
      raw_status_category: CATEGORY_MAP[normalized] ?? 'BACKLOG',
    },
    classification: {
      issue_type: (doc.issueType as CanonicalTaskModel['classification']['issue_type']) ?? 'Task',
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
      on_enter: ['ACTIVE'],
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
    issueType: task.classification.issue_type,
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