import {
  CanonicalTaskModel,
  NormalizedStatus,
  StateTransition,
} from './types';
import { StateMachine } from './state-machine';
import { EventBus } from './event-bus';

export interface PolicyRule {
  id: string;
  fromStatus?: NormalizedStatus;
  toStatus?: NormalizedStatus;
  action: 'enter' | 'exit';
  handler: (task: CanonicalTaskModel, transition: StateTransition) => void | Promise<void>;
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];
  private stateMachine: StateMachine;
  private eventBus: EventBus;

  constructor(stateMachine: StateMachine, eventBus: EventBus) {
    this.stateMachine = stateMachine;
    this.eventBus = eventBus;
  }

  private matchRules(action: 'enter' | 'exit', transition: StateTransition): PolicyRule[] {
    return this.rules.filter(rule => {
      if (rule.action !== action) return false;
      if (action === 'enter' && rule.toStatus !== undefined && rule.toStatus !== transition.to) return false;
      if (action === 'exit' && rule.fromStatus !== undefined && rule.fromStatus !== transition.from) return false;
      return true;
    });
  }

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  async evaluate(task: CanonicalTaskModel, transition: StateTransition): Promise<void> {
    const matchingRules = this.rules.filter(rule => {
      if (rule.action === 'enter' && rule.toStatus !== undefined && rule.toStatus !== transition.to) return false;
      if (rule.action === 'exit' && rule.fromStatus !== undefined && rule.fromStatus !== transition.from) return false;
      return true;
    });

    for (const rule of matchingRules) {
      try {
        await rule.handler(task, transition);
      } catch (err) {
        this.eventBus.emit('policy:error', { ruleId: rule.id, error: err });
      }
    }

    this.eventBus.emit('policy:evaluated', { taskRef: task.task_ref, transition, ruleCount: matchingRules.length });
  }

  async onTransition(task: CanonicalTaskModel, newStatus: NormalizedStatus): Promise<CanonicalTaskModel> {
    const transition: StateTransition = {
      from: task.workflow.normalized_status,
      to: newStatus,
    };

    // Evaluate exit policies for current status
    const exitRules = this.matchRules('exit', transition);
    for (const rule of exitRules) {
      try {
        await rule.handler(task, transition);
      } catch (err) {
        this.eventBus.emit('policy:error', { ruleId: rule.id, error: err });
      }
    }

    // Perform state transition
    const updatedTask = this.stateMachine.transition(task, newStatus);

    // Evaluate enter policies for new status
    const enterRules = this.matchRules('enter', transition);
    for (const rule of enterRules) {
      try {
        await rule.handler(updatedTask, transition);
      } catch (err) {
        this.eventBus.emit('policy:error', { ruleId: rule.id, error: err });
      }
    }

    this.eventBus.emit('policy:transition', { taskRef: task.task_ref, transition });

    return updatedTask;
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }
}