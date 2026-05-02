import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'child_process';
import { buildAgentEnv, spawnAgentProcess } from '../../src/executor/agent-process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

class FakeStdin extends EventEmitter {
  readonly write = vi.fn();
  readonly end = vi.fn();
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = new FakeStdin();
  readonly kill = vi.fn();
  readonly pid = 4321;
}

function mockSpawnChild(child = new FakeChildProcess()): FakeChildProcess {
  vi.mocked(spawn).mockReturnValue(child as never);
  return child;
}

describe('agent process runner', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('spawns with args array and shell false', async () => {
    const child = mockSpawnChild();

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec', '--json'],
      cwd: '/repo',
      stdin: 'run this',
      timeoutMs: 1000,
      env: { PATH: '/bin' },
    });
    child.stdout.emit('data', Buffer.from('ok'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
    });
    expect(spawn).toHaveBeenCalledWith('codex', ['exec', '--json'], expect.objectContaining({
      cwd: '/repo',
      shell: false,
      detached: process.platform !== 'win32',
    }));
    expect(child.stdin.write).toHaveBeenCalledWith('run this');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('passes only allowlisted env vars', () => {
    expect(buildAgentEnv({
      PATH: '/bin',
      HOME: '/home/me',
      OPENAI_API_KEY: 'sk-allowed',
      CODEX_HOME: '/home/me/.codex',
      ANTHROPIC_API_KEY: 'sk-ant-allowed',
      CLAUDE_CONFIG_DIR: '/home/me/.claude',
      LANG: 'ko_KR.UTF-8',
      LC_ALL: 'ko_KR.UTF-8',
      LC_CTYPE: 'UTF-8',
      TERM: 'xterm-256color',
      TZ: 'Asia/Seoul',
      LOGNAME: 'runner',
      AWS_SECRET_ACCESS_KEY: 'do-not-pass',
      NODE_OPTIONS: '--inspect',
    })).toEqual({
      PATH: '/bin',
      HOME: '/home/me',
      OPENAI_API_KEY: 'sk-allowed',
      CODEX_HOME: '/home/me/.codex',
      ANTHROPIC_API_KEY: 'sk-ant-allowed',
      CLAUDE_CONFIG_DIR: '/home/me/.claude',
      LANG: 'ko_KR.UTF-8',
      LC_ALL: 'ko_KR.UTF-8',
      LC_CTYPE: 'UTF-8',
      TERM: 'xterm-256color',
      TZ: 'Asia/Seoul',
      LOGNAME: 'runner',
    });
  });

  it('kills timed out process with exitCode 124', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    await vi.advanceTimersByTimeAsync(10);
    child.emit('close', null);
    await vi.advanceTimersByTimeAsync(5);

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      stdout: '',
      stderr: '',
      timedOut: true,
    });
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    }
  });

  it('waits for a timed out process to close and escalates to SIGKILL', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    result.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    }
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(5);
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    }
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      timedOut: true,
    });
  });

  it('waits for SIGKILL escalation even when the timed out child closes before grace ends', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    result.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    child.emit('close', null);
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(5);
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    }

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      timedOut: true,
    });
  });

  it('waits for SIGKILL escalation when stdin errors after timeout', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      stdin: 'prompt',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    result.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    child.stdin.emit('error', new Error('write EPIPE'));
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(5);
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    }
    await Promise.resolve();
    expect(resolved).toBe(false);
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      stderr: 'write EPIPE',
      timedOut: true,
    });
  });

  it('waits for SIGKILL escalation when child errors after timeout', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    result.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    child.emit('error', new Error('spawn error after timeout'));
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(5);
    if (process.platform === 'win32') {
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } else {
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    }
    await Promise.resolve();
    expect(resolved).toBe(false);
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      stderr: 'spawn error after timeout',
      timedOut: true,
    });
  });

  it('keeps the timeout result when a child close event arrives later', async () => {
    vi.useFakeTimers();
    const child = mockSpawnChild();
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 10,
      killGraceMs: 5,
    });
    await vi.advanceTimersByTimeAsync(10);
    child.emit('close', 0);
    await vi.advanceTimersByTimeAsync(5);

    await expect(result).resolves.toMatchObject({
      exitCode: 124,
      timedOut: true,
    });
  });

  it('resolves stdin errors as failed results without throwing', async () => {
    const child = mockSpawnChild();
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      stdin: 'prompt',
      timeoutMs: 1000,
    });
    result.then(() => {
      resolved = true;
    });

    expect(() => child.stdin.emit('error', new Error('write EPIPE'))).not.toThrow();
    await Promise.resolve();
    expect(resolved).toBe(false);
    child.emit('close', null);
    await expect(result).resolves.toMatchObject({
      exitCode: 1,
      stderr: 'write EPIPE',
    });
  });

  it('keeps the stdin error result when child close arrives later', async () => {
    const child = mockSpawnChild();

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      stdin: 'prompt',
      timeoutMs: 1000,
    });
    child.stdin.emit('error', new Error('stdin closed'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({
      exitCode: 1,
      stderr: 'stdin closed',
    });
  });

  it('records synchronous stdin write errors and waits for child close', async () => {
    const child = mockSpawnChild();
    child.stdin.write.mockImplementationOnce(() => {
      throw new Error('ERR_STREAM_DESTROYED');
    });
    let resolved = false;

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      stdin: 'prompt',
      timeoutMs: 1000,
    });
    result.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    child.emit('close', null);
    await expect(result).resolves.toMatchObject({
      exitCode: 1,
      stderr: 'ERR_STREAM_DESTROYED',
    });
  });

  it('keeps the successful close result when stdin error arrives later', async () => {
    const child = mockSpawnChild();

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec'],
      cwd: '/repo',
      stdin: 'prompt',
      timeoutMs: 1000,
    });
    child.stdout.emit('data', Buffer.from('done'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'done',
    });
    expect(() => child.stdin.emit('error', new Error('late stdin error'))).not.toThrow();
    await expect(result).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'done',
    });
  });

  it('keeps the child error result when child close arrives later', async () => {
    const child = mockSpawnChild();

    const result = spawnAgentProcess({
      executable: 'missing-codex',
      args: ['exec'],
      cwd: '/repo',
      timeoutMs: 1000,
    });
    child.emit('error', new Error('spawn ENOENT'));
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({
      exitCode: 127,
      stderr: 'spawn ENOENT',
    });
  });

  it('records command without secrets', async () => {
    const child = mockSpawnChild();

    const result = spawnAgentProcess({
      executable: 'codex',
      args: ['exec', 'OPENAI_API_KEY=sk-secret', '--api-key=sk-secret', 'sk-anothersecret'],
      cwd: '/repo',
      timeoutMs: 1000,
    });
    child.emit('close', 0);

    await expect(result).resolves.toMatchObject({
      command: ['codex', 'exec', 'OPENAI_API_KEY=[REDACTED]', '--api-key=[REDACTED]', '[REDACTED]'],
    });
  });
});
