import { ADAPTER_IDS, type AdapterId, type RuntimePolicy } from './policy';

export function assertAdapterAllowed(policy: RuntimePolicy, adapterId: string, action: string): asserts adapterId is AdapterId {
  if (!isAdapterId(adapterId)) {
    throw new Error(`Invalid adapter id: ${adapterId}`);
  }
  if (policy.deniedAdapters?.includes(adapterId)) {
    throw new Error(`Adapter ${adapterId} is denied for ${action}`);
  }
  if (!policy.allowedAdapters?.includes(adapterId)) {
    throw new Error(`Adapter ${adapterId} is not allowed for ${action}`);
  }
  if (isExecutionAction(action) && policy.automationCanStartExecution === false) {
    throw new Error(`Adapter ${adapterId} cannot start execution in ${policy.mode ?? 'unknown'} mode`);
  }
}

export function isAdapterId(value: string): value is AdapterId {
  return (ADAPTER_IDS as readonly string[]).includes(value);
}

function isExecutionAction(action: string): boolean {
  return action === 'execute' || action === 'run' || action === 'startExecution';
}
