import { ExecutionResult, ExecutionStatus } from '@kanban-task-engine/core';
import { spawn, ChildProcess } from 'child_process';

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
  private maxSessions: number;

  constructor(defaultConfig?: Partial<SessionConfig>, maxSessions: number = 100) {
    this.defaultConfig = defaultConfig ?? {};
    this.maxSessions = maxSessions;
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

      this.cleanupCompletedSessions();

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
    if (session?.process && session.process.pid && !session.process.killed) {
      session.process.kill('SIGTERM');
      // SIGKILL after 5 second grace period
      setTimeout(() => {
        if (session.process?.pid && !session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, 5000);
      session.status = 'cancelled';
    }
    this.cleanupCompletedSessions();
  }

  private executeCommand(config: SessionConfig, sessionId: string): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const startedAt = new Date().toISOString();
      const timeout = config.timeout ?? 300000;

      const childProcess = spawn(config.command, config.args ?? [], {
        cwd: config.cwd,
        env: { ...process.env, ...config.env },
        stdio: 'pipe',
      });

      const session = this.sessions.get(sessionId);
      if (session) {
        session.process = childProcess;
      }

      let stderr = '';

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeoutTimer);
        const s = this.sessions.get(sessionId);
        if (s) {
          s.process = null;
        }

        resolve({
          success: code === 0,
          sessionId,
          error: code !== 0 ? (stderr.slice(0, 500) || `Process exited with code ${code}`) : undefined,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutTimer);
        const s = this.sessions.get(sessionId);
        if (s) {
          s.process = null;
        }

        resolve({
          success: false,
          sessionId,
          error: error.message,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      });

      // Set timeout with SIGKILL fallback
      const timeoutTimer = setTimeout(() => {
        if (childProcess.pid && !childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
        reject(new Error(`Process timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private cleanupCompletedSessions(): void {
    if (this.sessions.size <= this.maxSessions) return;

    // Remove oldest completed/failed/cancelled sessions
    for (const [id, session] of this.sessions) {
      if (session.status !== 'running' && session.status !== 'pending') {
        this.sessions.delete(id);
        if (this.sessions.size <= this.maxSessions * 0.8) break; // Clean up to 80% of max
      }
    }
  }
}