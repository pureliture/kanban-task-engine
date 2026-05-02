import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { spawn } from 'child_process';
import { SessionManager } from '../src/session-manager';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

class FakeChildProcess extends EventEmitter {
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
  readonly pid = 1234;
  killed = false;
}

const unsafeEnv = {
  NODE_OPTIONS: '--inspect',
  AWS_SECRET_ACCESS_KEY: 'aws-secret',
  GOOGLE_APPLICATION_CREDENTIALS: '/tmp/google-creds.json',
  CUSTOM_TOKEN: 'custom-token',
  CUSTOM_SECRET: 'custom-secret',
} as const;

const originalUnsafeEnv: Partial<Record<keyof typeof unsafeEnv, string>> = {};

function mockSpawnChild(child = new FakeChildProcess()): FakeChildProcess {
  vi.mocked(spawn).mockReturnValue(child as never);
  return child;
}

function getSpawnEnv(): NodeJS.ProcessEnv {
  return vi.mocked(spawn).mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv;
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(spawn).mockReset();
    for (const [key, value] of Object.entries(unsafeEnv)) {
      originalUnsafeEnv[key as keyof typeof unsafeEnv] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(() => {
    for (const key of Object.keys(unsafeEnv)) {
      const originalValue = originalUnsafeEnv[key as keyof typeof unsafeEnv];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
      delete originalUnsafeEnv[key as keyof typeof unsafeEnv];
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a session and tracks status', async () => {
    const child = mockSpawnChild();
    const manager = new SessionManager();
    const result = manager.startSession('test-1', {
      command: 'echo',
      args: ['hello'],
      timeout: 5000,
    });
    child.emit('close', 0);
    await expect(result).resolves.toMatchObject({ success: true });
    expect(manager.getSessionStatus('test-1')).toBe('completed');
  });

  it('reports failure for non-existent commands', async () => {
    const child = mockSpawnChild();
    const manager = new SessionManager();
    const result = manager.startSession('test-2', {
      command: 'nonexistent_command_xyz_12345',
      timeout: 5000,
    });
    child.emit('error', new Error('spawn nonexistent_command_xyz_12345 ENOENT'));
    await expect(result).resolves.toMatchObject({
      success: false,
      error: 'spawn nonexistent_command_xyz_12345 ENOENT',
    });
  });

  it('returns pending status for unknown sessions', () => {
    const manager = new SessionManager();
    expect(manager.getSessionStatus('unknown')).toBe('pending');
  });

  it('does not pass unsafe ambient env variables to child processes', async () => {
    const child = mockSpawnChild();
    const manager = new SessionManager();
    const result = manager.startSession('test-env-filter', {
      command: 'echo',
      args: ['hello'],
      timeout: 5000,
    });
    child.emit('close', 0);
    await expect(result).resolves.toMatchObject({ success: true });

    expect(getSpawnEnv()).not.toMatchObject(unsafeEnv);
    for (const key of Object.keys(unsafeEnv)) {
      expect(getSpawnEnv()).not.toHaveProperty(key);
    }
  });

  it('does not pass unsafe config.env variables to child processes', async () => {
    const child = mockSpawnChild();
    const manager = new SessionManager();
    const result = manager.startSession('test-env-allowed', {
      command: 'echo',
      args: ['hello'],
      env: {
        NODE_OPTIONS: '--max-old-space-size=4096',
        AWS_SECRET_ACCESS_KEY: 'explicit-aws-secret',
        GOOGLE_APPLICATION_CREDENTIALS: '/safe/google-creds.json',
        CUSTOM_TOKEN: 'explicit-custom-token',
        CUSTOM_SECRET: 'explicit-custom-secret',
      },
      timeout: 5000,
    });
    child.emit('close', 0);
    await expect(result).resolves.toMatchObject({ success: true });

    for (const key of Object.keys(unsafeEnv)) {
      expect(getSpawnEnv()).not.toHaveProperty(key);
    }
  });

  it('allows config.env to override explicitly allowlisted variables only', async () => {
    const child = mockSpawnChild();
    const manager = new SessionManager();
    const result = manager.startSession('test-env-safe-override', {
      command: 'echo',
      args: ['hello'],
      env: {
        PATH: '/safe/bin',
        ANTHROPIC_API_KEY: 'explicit-anthropic-key',
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      timeout: 5000,
    });
    child.emit('close', 0);
    await expect(result).resolves.toMatchObject({ success: true });

    expect(getSpawnEnv()).toMatchObject({
      PATH: '/safe/bin',
      ANTHROPIC_API_KEY: 'explicit-anthropic-key',
    });
    expect(getSpawnEnv()).not.toHaveProperty('NODE_OPTIONS');
  });
});
