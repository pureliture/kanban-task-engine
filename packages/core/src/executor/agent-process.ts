import { spawn } from 'child_process';
import { AgentRunResult } from './agent-runner.js';
import { redactSecrets } from './redaction.js';

export interface SpawnAgentProcessInput {
  executable: string;
  args: string[];
  cwd: string;
  stdin?: string;
  timeoutMs: number;
  killGraceMs?: number;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_KILL_GRACE_MS = 5_000;

const AGENT_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'OPENAI_API_KEY',
  'CODEX_HOME',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CONFIG_DIR',
  'XDG_CONFIG_HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TZ',
  'LOGNAME',
] as const;

export function buildAgentEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed: NodeJS.ProcessEnv = {};
  for (const key of AGENT_ENV_ALLOWLIST) {
    const value = env[key];
    if (typeof value === 'string') {
      allowed[key] = value;
    }
  }
  return allowed;
}

export async function spawnAgentProcess(input: SpawnAgentProcessInput): Promise<AgentRunResult> {
  return new Promise(resolve => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const command = [input.executable, ...input.args].map(redactSecrets);
    let settled = false;
    let timedOut = false;
    let childClosed = false;
    let closeCode: number | null = null;
    let killEscalated = false;
    let stdinFailed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      detached: process.platform !== 'win32',
      env: buildAgentEnv(input.env),
      shell: false,
    });

    const appendStderr = (message: string) => {
      stderr.push(Buffer.from(message));
    };

    const finish = (result: Pick<AgentRunResult, 'exitCode'> & Partial<AgentRunResult>) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (killTimer && (!timedOut || killEscalated)) clearTimeout(killTimer);
      resolve({
        exitCode: result.exitCode,
        stdout: result.stdout ?? Buffer.concat(stdout).toString('utf8'),
        stderr: result.stderr ?? Buffer.concat(stderr).toString('utf8'),
        timedOut: result.timedOut ?? false,
        command,
      });
    };

    timeout = setTimeout(() => {
      timedOut = true;
      terminateAgentProcess(child, 'SIGTERM');
      killTimer = setTimeout(() => {
        killEscalated = true;
        terminateAgentProcess(child, 'SIGKILL');
        if (childClosed) {
          finish({ exitCode: 124, timedOut: true });
        }
      }, input.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
      killTimer.unref?.();
    }, input.timeoutMs);
    timeout.unref?.();

    child.stdout?.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr?.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.on('error', error => {
      if (timedOut) {
        appendStderr(error.message);
        return;
      }
      const existingStderr = Buffer.concat(stderr).toString('utf8');
      finish({
        exitCode: isExecutableMissing(error) ? 127 : 1,
        stderr: existingStderr ? `${existingStderr}\n${error.message}` : error.message,
        timedOut: false,
      });
    });
    child.on('close', code => {
      childClosed = true;
      closeCode = code;
      if (timedOut && !killEscalated) {
        return;
      }
      finish({ exitCode: timedOut ? 124 : stdinFailed ? 1 : closeCode ?? 1, timedOut });
    });

    const handleStdinError = (error: unknown) => {
      if (settled) return;
      const message = getErrorMessage(error);
      appendStderr(message);
      if (timedOut) {
        return;
      }
      stdinFailed = true;
      terminateAgentProcess(child, 'SIGTERM');
    };

    child.stdin?.on('error', handleStdinError);

    if (input.stdin !== undefined) {
      try {
        child.stdin?.write(input.stdin);
        child.stdin?.end();
      } catch (error) {
        handleStdinError(error);
      }
    }
  });
}

function terminateAgentProcess(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && typeof child.pid === 'number') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      child.kill(signal);
      return;
    }
  }

  child.kill(signal);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isExecutableMissing(error: Error): boolean {
  return (isNodeError(error) && error.code === 'ENOENT') || error.message.includes('ENOENT');
}
