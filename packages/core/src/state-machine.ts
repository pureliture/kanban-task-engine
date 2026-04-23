import {
  NormalizedStatus,
  RawStatusCategory,
  StateTransition,
  VALID_TRANSITIONS,
  CanonicalTaskModel,
} from './types';

const STATUS_TO_RAW: Record<NormalizedStatus, string> = {
  TODO: 'TODO',
  READY: 'READY',
  RUNNING: 'RUNNING',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

const STATUS_TO_CATEGORY: Record<NormalizedStatus, RawStatusCategory> = {
  TODO: 'TODO',
  READY: 'READY',
  RUNNING: 'IN_PROGRESS',
  REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

export class StateMachine {
  private transitions: Map<string, Set<NormalizedStatus>>;

  constructor(transitions: StateTransition[] = VALID_TRANSITIONS) {
    this.transitions = new Map();
    for (const t of transitions) {
      if (!this.transitions.has(t.from)) {
        this.transitions.set(t.from, new Set());
      }
      this.transitions.get(t.from)!.add(t.to);
    }
  }

  canTransition(from: NormalizedStatus, to: NormalizedStatus): boolean {
    const allowed = this.transitions.get(from);
    return allowed?.has(to) ?? false;
  }

  transition(task: CanonicalTaskModel, newStatus: NormalizedStatus): CanonicalTaskModel {
    if (!this.canTransition(task.workflow.normalized_status, newStatus)) {
      throw new Error(
        `Invalid transition: ${task.workflow.normalized_status} → ${newStatus} for task ${task.task_ref.external_id}`
      );
    }

    return {
      ...task,
      workflow: {
        ...task.workflow,
        normalized_status: newStatus,
        raw_status: STATUS_TO_RAW[newStatus],
        raw_status_category: STATUS_TO_CATEGORY[newStatus],
      },
      sync: {
        ...task.sync,
        last_synced_at: new Date().toISOString(),
        last_source: task.sync.last_source,
      },
      updated: new Date().toISOString(),
      completed: newStatus === 'DONE' || newStatus === 'FAILED'
        ? new Date().toISOString()
        : task.completed,
    };
  }

  getValidTransitions(from: NormalizedStatus): NormalizedStatus[] {
    return Array.from(this.transitions.get(from) ?? []);
  }

  isTerminalStatus(status: NormalizedStatus): boolean {
    return status === 'DONE' || status === 'FAILED';
  }
}
