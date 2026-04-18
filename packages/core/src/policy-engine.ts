import {
  CanonicalTaskModel,
  NormalizedStatus,
  StateTransition,
  ExecutionAdapter,
} from './types';
import { StateMachine } from './state-machine';
import { EventBus } from './event-bus';
import { POLICY_EVENTS } from './events';

export interface PolicyRule {
  id: string;
  fromStatus?: NormalizedStatus;
  toStatus?: NormalizedStatus;
  action: 'enter' | 'exit';
  handler: (task: CanonicalTaskModel, transition: StateTransition) => void | Promise<void>;
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];
  private adapters: Map<string, ExecutionAdapter> = new Map();
  private stateMachine: StateMachine;
  private eventBus: EventBus;

  constructor(stateMachine: StateMachine, eventBus: EventBus) {
    this.stateMachine = stateMachine;
    this.eventBus = eventBus;
  }

  /**
   * Register an execution adapter.
   */
  registerAdapter(adapter: ExecutionAdapter): void {
    this.adapters.set(adapter.name, adapter);
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
    const exitRules = this.matchRules('exit', transition);
    const enterRules = this.matchRules('enter', transition);
    const matchingRules = [...exitRules, ...enterRules];

    for (const rule of matchingRules) {
      try {
        await rule.handler(task, transition);
      } catch (err) {
        this.eventBus.emit(POLICY_EVENTS.ERROR, { ruleId: rule.id, error: err });
      }
    }

    this.eventBus.emit(POLICY_EVENTS.EVALUATED, { taskRef: task.task_ref, transition, ruleCount: matchingRules.length });
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
        this.eventBus.emit(POLICY_EVENTS.ERROR, { ruleId: rule.id, error: err });
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
        this.eventBus.emit(POLICY_EVENTS.ERROR, { ruleId: rule.id, error: err });
      }
    }

    this.eventBus.emit(POLICY_EVENTS.TRANSITION, { taskRef: task.task_ref, transition });

    return updatedTask;
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Handle a parse error.
   * Logs the error and emits a policy:error event.
   */
  async onParseError(filePath: string, error: Error): Promise<void> {
    this.eventBus.emit(POLICY_EVENTS.ERROR, {
      ruleId: 'parse-error',
      error: `Parse error for ${filePath}: ${error.message}`,
    });
  }
}