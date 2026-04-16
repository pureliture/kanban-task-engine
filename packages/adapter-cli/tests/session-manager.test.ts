import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../src/session-manager';

describe('SessionManager', () => {
  it('creates a session and tracks status', async () => {
    const manager = new SessionManager();
    const result = await manager.startSession('test-1', {
      command: 'echo',
      args: ['hello'],
      timeout: 5000,
    });
    expect(result.success).toBe(true);
    expect(manager.getSessionStatus('test-1')).toBe('completed');
  });

  it('reports failure for non-existent commands', async () => {
    const manager = new SessionManager();
    const result = await manager.startSession('test-2', {
      command: 'nonexistent_command_xyz_12345',
      timeout: 5000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns pending status for unknown sessions', () => {
    const manager = new SessionManager();
    expect(manager.getSessionStatus('unknown')).toBe('pending');
  });
});