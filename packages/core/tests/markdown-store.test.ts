import { describe, it, expect, vi } from 'vitest';
import { MarkdownStore } from '../src/store/markdown-store';
import fs from 'fs/promises';

vi.mock('fs/promises');

describe('MarkdownStore', () => {
  const initialContent = `---
id: TEST-001
status: Backlog
priority: Medium
issueType: Task
workspace: test
created: 2026-04-19
updated: 2026-04-19
---
# Test Task`;

  const updatedContent = `---
id: TEST-001
status: In Progress
priority: Medium
issueType: Task
workspace: test
created: 2026-04-19
updated: 2026-04-19
---
# Test Task`;

  const sameContent = `---
id: TEST-001
status: Backlog
priority: Medium
issueType: Task
workspace: test
created: 2026-04-19
updated: 2026-04-19
---
# Test Task`;

  describe('state change detection', () => {
    it('should detect status change from Backlog to In Progress', async () => {
      const mockPolicyEngine = {
        onTransition: vi.fn(),
        onParseError: vi.fn(),
      };

      const store = new MarkdownStore('/test', { policyEngine: mockPolicyEngine });

      // Mock computeChecksum to return different values (simulating file content change)
      vi.spyOn(store, 'computeChecksum')
        .mockResolvedValueOnce('checksum1')
        .mockResolvedValueOnce('checksum2');

      // Mock fs.readFile for loadFromFile
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(initialContent)
        .mockResolvedValueOnce(updatedContent);

      // First load - sets initial state
      await store.onFileChange('/test/issues/TEST-001.md');
      expect(mockPolicyEngine.onTransition).not.toHaveBeenCalled();

      // Second load - status changed
      await store.onFileChange('/test/issues/TEST-001.md');

      expect(mockPolicyEngine.onTransition).toHaveBeenCalledWith(
        expect.objectContaining({ task_ref: expect.objectContaining({ external_id: 'TEST-001' }) }),
        expect.objectContaining({ from: 'BACKLOG', to: 'ACTIVE' }),
      );
    });

    it('should not trigger onTransition for same status', async () => {
      const mockPolicyEngine = {
        onTransition: vi.fn(),
        onParseError: vi.fn(),
      };

      const store = new MarkdownStore('/test', { policyEngine: mockPolicyEngine });

      // Same checksum returned, but content parsed as same status
      vi.spyOn(store, 'computeChecksum')
        .mockResolvedValueOnce('checksum1')
        .mockResolvedValueOnce('checksum2');

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(sameContent)
        .mockResolvedValueOnce(sameContent);

      await store.onFileChange('/test/issues/TEST-001.md');
      await store.onFileChange('/test/issues/TEST-001.md');

      expect(mockPolicyEngine.onTransition).not.toHaveBeenCalled();
    });

    it('should skip duplicate events with same checksum', async () => {
      const mockPolicyEngine = {
        onTransition: vi.fn(),
        onParseError: vi.fn(),
      };

      const store = new MarkdownStore('/test', { policyEngine: mockPolicyEngine });

      // Same checksum - second call should return early without calling loadFromFile
      vi.spyOn(store, 'computeChecksum').mockResolvedValue('same-checksum');

      await store.onFileChange('/test/issues/TEST-001.md');
      await store.onFileChange('/test/issues/TEST-001.md');

      expect(mockPolicyEngine.onTransition).not.toHaveBeenCalled();
    });
  });
});