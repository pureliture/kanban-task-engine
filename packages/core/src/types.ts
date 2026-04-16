// === 식별 ===
export interface TaskRef {
  provider: 'local' | 'github' | 'jira';
  external_key: string;
  external_id: string;
}

// === 워크플로우 ===
export type NormalizedStatus =
  | 'BACKLOG'
  | 'SELECTED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'REVIEW'
  | 'DONE'
  | 'CANCELLED';

export type RawStatusCategory =
  | 'BACKLOG'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'IN_REVIEW'
  | 'DONE'
  | 'CANCELLED';

export interface Workflow {
  normalized_status: NormalizedStatus;
  raw_status: string;
  raw_status_category: RawStatusCategory;
}

// === 분류 (Jira 친화적) ===
export type IssueType = 'Epic' | 'Story' | 'Task' | 'Bug' | 'Sub-task';
export type Priority = 'Blocker' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Trivial';

export interface Classification {
  issue_type: IssueType;
  priority: Priority;
  labels: string[];
  component: string[];
}

// === 담당 ===
export interface Ownership {
  assignee: string;
  reporter: string;
}

// === 계획 ===
export interface Planning {
  sprint?: string;
  due_date?: string;
  estimate?: {
    story_points?: number;
    hours?: number;
    [key: string]: unknown;
  };
}

// === 자동화 ===
export type ExecutionProfile = 'standard' | 'aggressive' | 'conservative';

export interface Automation {
  policy_id: string;
  on_enter: NormalizedStatus[];
  on_exit: NormalizedStatus[];
  execution_profile: ExecutionProfile;
  workspace?: string;
  useAcp?: boolean;
}

// === 동기화 ===
export interface Sync {
  last_synced_at: string;
  last_source: 'local' | 'github' | 'firebase';
  checksum?: string;
}

// === 전체 모델 ===
export interface CanonicalTaskModel {
  task_ref: TaskRef;
  summary: string;
  description_ref?: string;
  workflow: Workflow;
  classification: Classification;
  ownership: Ownership;
  planning: Planning;
  automation: Automation;
  sync: Sync;
  created?: string;
  updated?: string;
  completed?: string;
}

// === 상태 전이 규칙 ===
export interface StateTransition {
  from: NormalizedStatus;
  to: NormalizedStatus;
}

export const VALID_TRANSITIONS: StateTransition[] = [
  // BACKLOG
  { from: 'BACKLOG', to: 'SELECTED' },
  { from: 'BACKLOG', to: 'ACTIVE' },
  { from: 'BACKLOG', to: 'CANCELLED' },
  // SELECTED
  { from: 'SELECTED', to: 'ACTIVE' },
  { from: 'SELECTED', to: 'CANCELLED' },
  // ACTIVE
  { from: 'ACTIVE', to: 'BLOCKED' },
  { from: 'ACTIVE', to: 'REVIEW' },
  { from: 'ACTIVE', to: 'DONE' },
  { from: 'ACTIVE', to: 'CANCELLED' },
  // BLOCKED
  { from: 'BLOCKED', to: 'ACTIVE' },
  { from: 'BLOCKED', to: 'CANCELLED' },
  // REVIEW
  { from: 'REVIEW', to: 'ACTIVE' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'CANCELLED' },
];

// === 어댑터 인터페이스 ===

export interface WorkStateProvider {
  fetchTasks(since?: string): Promise<CanonicalTaskModel[]>;
  fetchTask(externalKey: string): Promise<CanonicalTaskModel | null>;
  pushStatus(externalKey: string, status: NormalizedStatus): Promise<void>;
  resolveRef(taskRef: TaskRef): Promise<string>;
}

export interface SyncTransport {
  subscribe(handler: (event: SyncEvent) => void): void;
  publish(event: SyncEvent): Promise<void>;
  acknowledge(eventId: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<{ connected: boolean; latencyMs?: number }>;
}

export interface SyncEvent {
  event_id: string;
  provider: 'local' | 'github' | 'firebase';
  task_ref: TaskRef;
  prev_status: NormalizedStatus;
  new_status: NormalizedStatus;
  timestamp: string;
  checksum?: string;
}

export interface TaskStore {
  findByExternalKey(provider: string, externalKey: string): Promise<CanonicalTaskModel | null>;
  saveTask(task: CanonicalTaskModel): Promise<void>;
  updateTask(task: CanonicalTaskModel): Promise<void>;
  writeBack(task: CanonicalTaskModel, patch: Partial<CanonicalTaskModel>): Promise<void>;
  listTasks(filter?: TaskFilter): Promise<CanonicalTaskModel[]>;
  deleteTask(taskRef: TaskRef): Promise<void>;
}

export interface TaskFilter {
  status?: NormalizedStatus[];
  provider?: string[];
  assignee?: string[];
  workspace?: string[];
}

export interface ExecutionAdapter {
  execute(task: CanonicalTaskModel, transition: StateTransition): Promise<ExecutionResult>;
  getSessionStatus(sessionId: string): Promise<ExecutionStatus>;
  cancel(sessionId: string): Promise<void>;
}

export interface ExecutionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ConfigAdapter {
  getProviderConfig(provider: string): Promise<Record<string, unknown>>;
  getCredentials(service: string): Promise<{ token: string; baseUrl?: string }>;
  getWorkspacePaths(): Promise<string[]>;
}
