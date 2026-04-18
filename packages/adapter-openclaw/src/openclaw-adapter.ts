import type { CanonicalTaskModel } from '@kanban-task-engine/core';
import type { GatewayCredentials, GatewayCompletionResponse } from './types';
import { ConfigAdapter, TokenExpiredError } from './config-adapter';
import { PersistentRateLimitQueue } from './rate-limit-queue';

export interface ExecutionAdapter {
  name: string;
  execute(task: CanonicalTaskModel): Promise<GatewayCompletionResponse>;
}

export interface OpenClawAdapterOptions {
  timeout?: number;
  retries?: number;
}

export class OpenClawAdapter implements ExecutionAdapter {
  readonly name = 'openclaw';

  constructor(
    private config: ConfigAdapter,
    private queue: PersistentRateLimitQueue,
    private gatewayUrl: string,
    private options: OpenClawAdapterOptions = {}
  ) {}

  async execute(task: CanonicalTaskModel): Promise<GatewayCompletionResponse> {
    const credentials = await this.config.getCredentials('gateway');

    try {
      const response = await this.sendRequest(task, credentials);

      if (response.status === 429) {
        await this.queue.enqueue(task, this.getPriority(task));
        throw new Error('Rate limited: task enqueued for retry');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gateway error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        await this.config.refreshCredentials('gateway');
        const newCreds = await this.config.getCredentials('gateway');
        const retryResponse = await this.sendRequest(task, newCreds);

        if (!retryResponse.ok) {
          throw new Error(`Gateway error after token refresh: ${retryResponse.status}`);
        }

        return await retryResponse.json();
      }

      throw err;
    }
  }

  private async sendRequest(task: CanonicalTaskModel, credentials: GatewayCredentials): Promise<Response> {
    const controller = new AbortController();
    const timeout = this.options.timeout ?? 30000;
    setTimeout(() => controller.abort(), timeout);

    return fetch(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.token}`
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        messages: [
          {
            role: 'user',
            content: this.buildPrompt(task)
          }
        ],
        metadata: {
          ticketId: task.task_ref.external_key,
          workspace: task.automation.workspace ?? 'default'
        }
      }),
      signal: controller.signal
    });
  }

  private buildPrompt(task: CanonicalTaskModel): string {
    return `Execute task ${task.task_ref.external_key}: ${task.summary}\n\n${task.description_ref ?? ''}`;
  }

  private getPriority(task: CanonicalTaskModel): number {
    const priorityMap: Record<string, number> = {
      'Blocker': 100,
      'Critical': 80,
      'High': 60,
      'Medium': 40,
      'Low': 20,
      'Trivial': 0
    };
    return priorityMap[task.classification.priority] ?? 40;
  }
}