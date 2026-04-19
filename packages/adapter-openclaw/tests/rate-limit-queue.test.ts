import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersistentRateLimitQueue } from '../src/rate-limit-queue';
import fs from 'fs/promises';
import path from 'path';

describe('PersistentRateLimitQueue', () => {
  const testQueuePath = path.join(__dirname, 'test-queue.json');
  let queue: PersistentRateLimitQueue;

  const mockTask = {
    task_ref: {
      external_key: 'TEST-001'
    },
    summary: 'Test task',
    status: 'Backlog',
    priority: 'Medium',
    issueType: 'Task',
    workspace: 'test',
    labels: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(async () => {
    queue = new PersistentRateLimitQueue(testQueuePath, { maxSize: 100 });
    await queue.clear();
  });

  afterEach(async () => {
    try {
      await fs.unlink(testQueuePath);
    } catch {}
  });

  describe('enqueue/dequeue', () => {
    it('should enqueue and dequeue tasks in priority order', async () => {
      await queue.enqueue(mockTask, 1);
      await queue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-002' } }, 3);
      await queue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-003' } }, 2);

      const first = await queue.dequeue();
      expect(first?.task_ref.external_key).toBe('TEST-002'); // Highest priority first

      const second = await queue.dequeue();
      expect(second?.task_ref.external_key).toBe('TEST-003');

      const third = await queue.dequeue();
      expect(third?.task_ref.external_key).toBe('TEST-001');
    });

    it('should persist queue to disk', async () => {
      await queue.enqueue(mockTask, 1);

      // Create new instance
      const newQueue = new PersistentRateLimitQueue(testQueuePath);
      const stats = await newQueue.getQueueStats();
      expect(stats.total).toBe(1);
    });

    it('should reject when queue is at max size', async () => {
      const smallQueue = new PersistentRateLimitQueue(testQueuePath, { maxSize: 2 });
      await smallQueue.enqueue(mockTask, 1);
      await smallQueue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-002' } }, 1);

      await expect(smallQueue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-003' } }, 1)).rejects.toThrow('Queue full');
    });
  });

  describe('setPriority', () => {
    it('should update priority of queued task', async () => {
      await queue.enqueue(mockTask, 1);
      await queue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-002' } }, 2);
      queue.setPriority('TEST-001', 5);

      const task = await queue.dequeue();
      expect(task?.task_ref.external_key).toBe('TEST-001');
    });
  });

  describe('getQueueStats', () => {
    it('should return correct stats', async () => {
      await queue.enqueue(mockTask, 1);
      await queue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-002' } }, 2);

      const stats = await queue.getQueueStats();
      expect(stats.total).toBe(2);
      expect(stats.byPriority.get(1)).toBe(1);
      expect(stats.byPriority.get(2)).toBe(1);
    });
  });

  describe('peek', () => {
    it('should return highest priority task without removing', async () => {
      await queue.enqueue(mockTask, 1);
      await queue.enqueue({ ...mockTask, task_ref: { external_key: 'TEST-002' } }, 3);

      const peeked = queue.peek();
      expect(peeked?.task_ref.external_key).toBe('TEST-002');

      const stats = await queue.getQueueStats();
      expect(stats.total).toBe(2);
    });
  });
});