export const SYNC_EVENTS = {
  TASK_ADDED: 'sync:task-added',
  TASK_UPDATED: 'sync:task-updated',
  COMPLETED: 'sync:completed',
  PUSHED: 'sync:pushed',
  REMOTE_EVENT: 'sync:remote-event',
  STATUS_CHANGE: 'sync:status-change',
} as const;

export const POLICY_EVENTS = {
  ERROR: 'policy:error',
  EVALUATED: 'policy:evaluated',
  TRANSITION: 'policy:transition',
} as const;