import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeadLetterQueue, DeadLetterEntry } from '../src/dead-letter-queue';
import fs from 'fs/promises';
import path from 'path';

describe('DeadLetterQueue', () => {
  const testQueuePath = path.join(__dirname, 'test-dead-letter.json');
  let queue: DeadLetterQueue;

  beforeEach(async () => {
    queue = new DeadLetterQueue(testQueuePath);
    await queue.clear();
  });

  afterEach(async () => {
    await queue.clear();
    try {
      await fs.unlink(testQueuePath);
    } catch {}
  });

  describe('add', () => {
    it('should add a failed parse entry to the queue', async () => {
      const entry: DeadLetterEntry = {
        filePath: '/test/path/ticket.md',
        error: 'YAML parse error: invalid syntax',
        timestamp: Date.now(),
        rawContent: '---\ninvalid yaml\n---'
      };

      await queue.add(entry);

      const entries = await queue.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].filePath).toBe(entry.filePath);
      expect(entries[0].error).toBe(entry.error);
    });

    it('should persist queue to disk', async () => {
      const entry: DeadLetterEntry = {
        filePath: '/test/path/ticket.md',
        error: 'YAML parse error',
        timestamp: Date.now(),
        rawContent: 'content'
      };

      await queue.add(entry);

      // Create new queue instance to test persistence
      const newQueue = new DeadLetterQueue(testQueuePath);
      const entries = await newQueue.getAll();
      expect(entries).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('should remove entry by file path', async () => {
      const entry: DeadLetterEntry = {
        filePath: '/test/path/ticket.md',
        error: 'error',
        timestamp: Date.now(),
        rawContent: 'content'
      };

      await queue.add(entry);
      await queue.remove('/test/path/ticket.md');

      const entries = await queue.getAll();
      expect(entries).toHaveLength(0);
    });
  });

  describe('getByError', () => {
    it('should filter entries by error type', async () => {
      await queue.add({
        filePath: '/test/1.md',
        error: 'YAML parse error',
        timestamp: Date.now(),
        rawContent: 'content'
      });
      await queue.add({
        filePath: '/test/2.md',
        error: 'Validation error',
        timestamp: Date.now(),
        rawContent: 'content'
      });

      const yamlErrors = await queue.getByError('YAML');
      expect(yamlErrors).toHaveLength(1);
      expect(yamlErrors[0].filePath).toBe('/test/1.md');
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await queue.add({ filePath: '/test/1.md', error: 'e1', timestamp: 1, rawContent: '' });
      await queue.add({ filePath: '/test/2.md', error: 'e2', timestamp: 2, rawContent: '' });

      await queue.clear();

      const entries = await queue.getAll();
      expect(entries).toHaveLength(0);
    });
  });
});
