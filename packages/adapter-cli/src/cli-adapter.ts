import {
  CanonicalTaskModel,
  ExecutionAdapter,
  ExecutionResult,
  ExecutionStatus,
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
  private sessionManager: SessionManager;
  private config: CliAdapterConfig;

  constructor(config: CliAdapterConfig) {
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
}