import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownStore } from '../src/store/markdown-store';
import { CanonicalTaskModel } from '../src/types';
import fs from 'fs/promises';
import { VALID_ISSUE_MARKDOWN, INVALID_ISSUE_MISSING_목적 } from '@kanban-task-engine/schema';

vi.mock('fs/promises');

function dirent(name: string, type: 'file' | 'dir') {
  return {
    name,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
  };
}

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
      vi.mocked(fs.readFile).mockResolvedValueOnce(INVALID_ISSUE_MISSING_목적);

      const tasks = await store.listTasks();

      expect(tasks).toEqual([]);
      expect(mockPolicyEngine.onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Missing required section: 목적') }),
        '/test/issues/invalid.md'
      );
    });

    it('recursively lists nested vault issue files', async () => {
      const store = new MarkdownStore('/test');

      vi.mocked(fs.readdir).mockImplementation(async (dir: any) => {
        if (dir === '/test/issues') return [dirent('vibe-coding', 'dir')] as any;
        if (dir === '/test/issues/vibe-coding') return [dirent('kanban-task-engine', 'dir')] as any;
        if (dir === '/test/issues/vibe-coding/kanban-task-engine') {
          return [dirent('VC-001-hardening.md', 'file')] as any;
        }
        return [] as any;
      });
      vi.mocked(fs.readFile).mockResolvedValue(VALID_ISSUE_MARKDOWN);

      const tasks = await store.listTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].description_ref).toBe('/test/issues/vibe-coding/kanban-task-engine/VC-001-hardening.md');
      expect(fs.readFile).toHaveBeenCalledWith(
        '/test/issues/vibe-coding/kanban-task-engine/VC-001-hardening.md',
        'utf-8'
      );
    });

    it('builds new issue write paths inside the configured vault', () => {
      const store = new MarkdownStore('/vault');
      const task: CanonicalTaskModel = {
        task_ref: { provider: 'local', external_key: 'workspace-vibe-coding', external_id: 'VC-123' },
        summary: 'Hardening Slice',
        workflow: { normalized_status: 'TODO', raw_status: 'TODO', raw_status_category: 'TODO' },
        classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
        ownership: { assignee: '', reporter: '' },
        planning: {},
        automation: {
          policy_id: 'default',
          on_enter: [],
          on_exit: [],
          execution_profile: 'standard',
          workspace: '/outside/workspace',
        },
        sync: { last_synced_at: '2026-01-01T00:00:00Z', last_source: 'local' },
      };

      expect((store as any).getIssueFilePath(task)).toBe('/vault/issues/VC-123-hardening-slice.md');
    });

    it('rejects unsafe task ids before writing new issue files', async () => {
      const store = new MarkdownStore('/vault');
      const task: CanonicalTaskModel = {
        task_ref: { provider: 'local', external_key: 'workspace-vibe-coding', external_id: '../escape' },
        summary: 'Hardening Slice',
        workflow: { normalized_status: 'TODO', raw_status: 'TODO', raw_status_category: 'TODO' },
        classification: { issue_type: 'Task', priority: 'Medium', labels: [], component: [] },
        ownership: { assignee: '', reporter: '' },
        planning: {},
        automation: {
          policy_id: 'default',
          on_enter: [],
          on_exit: [],
          execution_profile: 'standard',
          workspace: 'workspace-vibe-coding',
        },
        sync: { last_synced_at: '2026-01-01T00:00:00Z', last_source: 'local' },
      };

      await expect(store.saveTask(task)).rejects.toThrow('Invalid issue id');
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.rename).not.toHaveBeenCalled();
    });
  });
});
