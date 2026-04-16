import {
  NormalizedStatus,
  StateTransition,
  VALID_TRANSITIONS,
  CanonicalTaskModel,
} from './types';

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

    const prevStatus = task.workflow.normalized_status;
    return {
      ...task,
      workflow: {
        ...task.workflow,
        normalized_status: newStatus,
      },
      sync: {
        ...task.sync,
        last_synced_at: new Date().toISOString(),
        last_source: task.sync.last_source,
      },
      updated: new Date().toISOString(),
      completed: newStatus === 'DONE' || newStatus === 'CANCELLED'
        ? new Date().toISOString()
        : task.completed,
    };
  }

  getValidTransitions(from: NormalizedStatus): NormalizedStatus[] {
    return Array.from(this.transitions.get(from) ?? []);
  }

  isTerminalStatus(status: NormalizedStatus): boolean {
    return status === 'DONE' || status === 'CANCELLED';
  }
}