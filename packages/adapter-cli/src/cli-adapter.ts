import {
  CanonicalTaskModel,
  ExecutionAdapter,
  ExecutionResult,
  ExecutionStatus,
  assertAdapterAllowed,
  RuntimePolicy,
  StateTransition,
} from '@kanban-task-engine/core';
import { buildExecutionPrompt, PromptOptions } from './prompt-builder';
import { SessionManager, SessionConfig } from './session-manager';

export interface CliAdapterConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  promptOptions?: PromptOptions;
}

export class CliAdapter implements ExecutionAdapter {
  readonly name = 'cli';
  private sessionManager: SessionManager;
  private config: CliAdapterConfig;

  constructor(config: CliAdapterConfig, private policy?: RuntimePolicy) {
    this.config = config;
    this.sessionManager = new SessionManager({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env,
      timeout: config.timeout,
    });
  }

  async execute(task: CanonicalTaskModel, transition: StateTransition): Promise<ExecutionResult> {
    this.assertPolicyAllowsExecution();
    const prompt = buildExecutionPrompt(task, transition, this.config.promptOptions);
    const sessionId = `${task.task_ref.external_id}-${transition.to}-${Date.now()}`;

    const sessionConfig: SessionConfig = {
      command: this.config.command,
      args: [...(this.config.args ?? []), prompt],
      cwd: this.config.cwd,
      env: this.config.env,
      timeout: this.config.timeout,
    };

    return this.sessionManager.startSession(sessionId, sessionConfig);
  }

  async getSessionStatus(sessionId: string): Promise<ExecutionStatus> {
    return this.sessionManager.getSessionStatus(sessionId);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.sessionManager.cancelSession(sessionId);
  }

  private assertPolicyAllowsExecution(): void {
    if (!this.policy) {
      throw new Error('CliAdapter requires RuntimePolicy');
    }
    assertAdapterAllowed(this.policy, 'cli', 'execute');
  }
}
