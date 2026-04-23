import { CanonicalTaskModel, NormalizedStatus } from '../types';
import { StateMachine } from '../state-machine';
import { AutomationModule } from '../runtime/module';

export function createStateTransitionModule(stateMachine = new StateMachine()): AutomationModule {
  return {
    name: 'state-transition',
    sideEffects: ['writeIssue'],
    async run(context) {
      const issue = context.values.issue as CanonicalTaskModel | undefined;
      const requestedStatus = context.values.requestedStatus as NormalizedStatus | undefined;
      if (!issue || !requestedStatus) return context;
      const updated = stateMachine.transition(issue, requestedStatus);
      return { ...context, values: { ...context.values, issue: updated } };
    },
  };
}
