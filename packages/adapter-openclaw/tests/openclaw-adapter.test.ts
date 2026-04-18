import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenClawAdapter } from '../src/openclaw-adapter';
import { ConfigAdapter, TokenExpiredError } from '../src/config-adapter';
import { PersistentRateLimitQueue } from '../src/rate-limit-queue';
import type { CanonicalTaskModel } from '@kanban-task-engine/core';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a minimal CanonicalTaskModel for testing
function createMockTask(overrides: Partial<CanonicalTaskModel> = {}): CanonicalTaskModel {
  return {
    task_ref: { provider: 'local', external_key: 'TEST-001', external_id: 'TEST-001' },
    summary: 'Test task',
    workflow: {
      normalized_status: 'ACTIVE',
      raw_status: 'In Progress',
      raw_status_category: 'IN_PROGRESS'
    },
    classification: {
      issue_type: 'Task',
      priority: 'High',
      labels: [],
      component: []
    },
    ownership: { assignee: 'test-user', reporter: 'test-user' },
    planning: {},
    automation: { policy_id: 'default', on_enter: [], on_exit: [], execution_profile: 'standard' },
    sync: { last_synced_at: new Date().toISOString(), last_source: 'local' },
    ...overrides
  } as CanonicalTaskModel;
}

describe('OpenClawAdapter', () => {
  let adapter: OpenClawAdapter;
  let mockConfig: ConfigAdapter;
  let mockQueue: PersistentRateLimitQueue;

  const mockTask = createMockTask();

  beforeEach(async () => {
    vi.clearAllMocks();

    mockConfig = new ConfigAdapter('/tmp/test-config');
    mockQueue = new PersistentRateLimitQueue('/tmp/test-queue.json', { maxSize: 100 });
    await mockQueue.clear();

    adapter = new OpenClawAdapter(mockConfig, mockQueue, 'https://gateway.test.local');
  });

  describe('execute', () => {
    it('should send task to gateway API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'completion-1', status: 'queued' })
      });

      // Mock getCredentials
      vi.spyOn(mockConfig, 'getCredentials').mockResolvedValue({
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write', 'gateway.trigger'],
        updatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 3600000
      });

      const result = await adapter.execute(mockTask);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.test.local/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token'
          })
        })
      );
      expect(result.status).toBe('queued');
    });

    it('should queue task when rate limited (429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429
      });

      vi.spyOn(mockConfig, 'getCredentials').mockResolvedValue({
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write', 'gateway.trigger'],
        updatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 3600000
      });

      await expect(adapter.execute(mockTask)).rejects.toThrow('Rate limited');
      expect(mockQueue.size()).toBe(1);
    });

    it('should handle gateway errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error'
      });

      vi.spyOn(mockConfig, 'getCredentials').mockResolvedValue({
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write', 'gateway.trigger'],
        updatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 3600000
      });

      await expect(adapter.execute(mockTask)).rejects.toThrow('Gateway error');
    });
  });

  describe('name', () => {
    it('should return adapter name', () => {
      expect(adapter.name).toBe('openclaw');
    });
  });
});