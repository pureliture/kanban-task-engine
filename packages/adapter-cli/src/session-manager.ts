import { ExecutionResult, ExecutionStatus } from '@kanban-task-engine/core';
import { exec, ChildProcess } from 'child_process';

export interface SessionConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

interface ActiveSession {
  id: string;
  process: ChildProcess | null;
  startedAt: string;
  status: ExecutionStatus;
  result?: ExecutionResult;
}

export class SessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private defaultConfig: Partial<SessionConfig>;

  constructor(defaultConfig?: Partial<SessionConfig>) {
    this.defaultConfig = defaultConfig ?? {};
  }

  async startSession(sessionId: string, config: SessionConfig): Promise<ExecutionResult> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const startedAt = new Date().toISOString();

    const session: ActiveSession = {
      id: sessionId,
      process: null,
      startedAt,
      status: 'running',
    };
    this.sessions.set(sessionId, session);

    try {
      const result = await this.executeCommand(mergedConfig, sessionId);

      const completedSession = this.sessions.get(sessionId);
      if (completedSession) {
        completedSession.status = result.success ? 'completed' : 'failed';
        completedSession.result = result;
      }

      return result;
    } catch (error) {
      const failedSession = this.sessions.get(sessionId);
      if (failedSession) {
        failedSession.status = 'failed';
      }
      return {
        success: false,
        error: String(error),
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }

  getSessionStatus(sessionId: string): ExecutionStatus {
    return this.sessions.get(sessionId)?.status ?? 'pending';
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.process) {
      session.process.kill('SIGTERM');
      session.status = 'cancelled';
    }
  }

  private executeCommand(config: SessionConfig, sessionId: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startedAt = new Date().toISOString();
      const timeout = config.timeout ?? 300000; // 5 min default

      const childProcess = exec(
        `${config.command} ${config.args?.join(' ') ?? ''}`,
        {
          cwd: config.cwd,
          env: { ...process.env, ...config.env },
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.process = null;
          }

          resolve({
            success: !error,
            sessionId,
            error: error?.message ?? (stderr ? stderr.slice(0, 500) : undefined),
            startedAt,
            completedAt: new Date().toISOString(),
          });
        }
      );

      const session = this.sessions.get(sessionId);
      if (session) {
        session.process = childProcess;
      }

      // Set timeout
      setTimeout(() => {
        if (childProcess.pid) {
          childProcess.kill('SIGTERM');
        }
      }, timeout);
    });
  }
}