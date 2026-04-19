import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownStore } from '../src/store/markdown-store';
import fs from 'fs/promises';

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

      const content = `---
id: TEST-001
status: Backlog
workspace: test
---
# Test Task`;

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(content)
        .mockResolvedValueOnce(content);

      const task = await (store as any).loadFromFile('/test/TEST-001.md');

      expect(task).not.toBeNull();
      expect(task?.workflow?.normalized_status).toBe('BACKLOG');
    });
  });
});
