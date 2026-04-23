import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownStore } from '../src/store/markdown-store';
import fs from 'fs/promises';
import { VALID_ISSUE_MARKDOWN, INVALID_ISSUE_MISSING_GOAL } from '@kanban-task-engine/schema';

vi.mock('fs/promises');

describe('MarkdownStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cache operations', () => {
    it('should expose syncCache method', () => {
      const store = new MarkdownStore('/test');
      expect(typeof (store as any).syncCache).toBe('function');
    });

    it('should expose invalidateCache method', () => {
      const store = new MarkdownStore('/test');
      expect(typeof (store as any).invalidateCache).toBe('function');
    });

    it('should track state cache after loadFromFile', async () => {
      const mockPolicyEngine = { onTransition: vi.fn(), onParseError: vi.fn() };
      const store = new MarkdownStore('/test', { policyEngine: mockPolicyEngine });

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN)
        .mockResolvedValueOnce(VALID_ISSUE_MARKDOWN);

      const task = await (store as any).loadFromFile('/test/TEST-001.md');

      expect(task).not.toBeNull();
      expect(task?.workflow?.normalized_status).toBe('READY');
    });

    it('rejects invalid constrained issues when listing tasks', async () => {
      const mockPolicyEngine = { onTransition: vi.fn(), onParseError: vi.fn() };
      const store = new MarkdownStore('/test', { policyEngine: mockPolicyEngine });

      vi.mocked(fs.readdir).mockResolvedValueOnce(['invalid.md'] as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(INVALID_ISSUE_MISSING_GOAL);

      const tasks = await store.listTasks();

      expect(tasks).toEqual([]);
      expect(mockPolicyEngine.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Missing required section: Goal') }),
        '/test/issues/invalid.md'
      );
    });
  });
});
