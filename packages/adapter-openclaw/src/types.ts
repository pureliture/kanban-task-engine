import type { CanonicalTaskModel } from '@kanban-task-engine/core';

export interface GatewayCredentials {
  deviceId: string;
  token: string;
  scope: ['operator.write', 'gateway.trigger'];
  updatedAtMs: number;
  expiresAtMs: number;
}

export interface GatewayCompletionResponse {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  conversationId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface QueuedTask {
  taskId: string;  // Use taskId directly for queue operations
  task: CanonicalTaskModel;
  priority: number;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  byPriority: Map<number, number>;
}