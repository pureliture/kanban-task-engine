import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceResolver, WorkspaceConfig, WorkspaceType } from '../src/store/workspace-resolver';

describe('WorkspaceResolver', () => {
  let resolver: WorkspaceResolver;
  const config: Record<string, WorkspaceConfig> = {
    'openclaw': {
      type: 'single' as WorkspaceType,
      path: '/test/issues/openclaw'
    },
    'vibe-coding': {
      type: 'container' as WorkspaceType,
      path: '/test/issues/vibe-coding',
      projects: ['ai-cli-orch-wrapper', 'kanban-task-engine']
    }
  };

  beforeEach(() => {
    resolver = new WorkspaceResolver(config);
  });

  describe('getTicketPath', () => {
    it('should resolve path for single-ticket workspace', () => {
      const result = resolver.getTicketPath('openclaw', 'OC-001');
      expect(result).toBe('/test/issues/openclaw/OC-001.md');
    });

    it('should resolve path for project-container workspace', () => {
      const result = resolver.getTicketPath('vibe-coding', 'ai-cli-orch-wrapper', 'AO-001');
      expect(result).toBe('/test/issues/vibe-coding/ai-cli-orch-wrapper/AO-001.md');
    });

    it('should throw for unknown workspace', () => {
      expect(() => resolver.getTicketPath('unknown', 'TK-001')).toThrow('Unknown workspace');
    });

    it('should throw for unknown project in container workspace', () => {
      expect(() => resolver.getTicketPath('vibe-coding', 'unknown-project', 'TK-001')).toThrow('Unknown project');
    });

    it('should throw when project specified for single workspace', () => {
      expect(() => resolver.getTicketPath('openclaw', 'project', 'OC-001')).toThrow('does not support projects');
    });
  });

  describe('parseTicketPath', () => {
    it('should parse single-ticket workspace path', () => {
      const result = resolver.parseTicketPath('/test/issues/openclaw/issue-auth-refresh-001.md');
      expect(result).toEqual({
        workspace: 'openclaw',
        project: undefined,
        ticketId: 'issue-auth-refresh-001'
      });
    });

    it('should parse project-container workspace path', () => {
      const result = resolver.parseTicketPath('/test/issues/vibe-coding/ai-cli-orch-wrapper/issue-schema-core-001.md');
      expect(result).toEqual({
        workspace: 'vibe-coding',
        project: 'ai-cli-orch-wrapper',
        ticketId: 'issue-schema-core-001'
      });
    });

    it('should return null for invalid path', () => {
      const result = resolver.parseTicketPath('/invalid/path.md');
      expect(result).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('should return projects for container workspace', () => {
      const projects = resolver.listProjects('vibe-coding');
      expect(projects).toEqual(['ai-cli-orch-wrapper', 'kanban-task-engine']);
    });

    it('should return empty array for single workspace', () => {
      const projects = resolver.listProjects('openclaw');
      expect(projects).toEqual([]);
    });
  });

  describe('getWorkspaceType', () => {
    it('should return correct type for workspace', () => {
      expect(resolver.getWorkspaceType('openclaw')).toBe('single');
      expect(resolver.getWorkspaceType('vibe-coding')).toBe('container');
    });

    it('should throw for unknown workspace', () => {
      expect(() => resolver.getWorkspaceType('unknown')).toThrow('Unknown workspace');
    });
  });

  describe('fromRegistry', () => {
    it('creates resolver from vault registry shape', () => {
      const resolver = WorkspaceResolver.fromRegistry({
        spaces: {
          openclaw: { type: 'single', issues: 'issues/openclaw', board: 'boards/openclaw.md' },
          'vibe-coding': {
            type: 'container',
            issues: 'issues/vibe-coding',
            board: 'boards/vibe-coding.md',
            projects: {
              'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' },
            },
          },
        },
      }, '/vault');

      expect(resolver.getTicketPath('openclaw', 'issue-1')).toBe('/vault/issues/openclaw/issue-1.md');
      expect(resolver.getTicketPath('vibe-coding', 'kanban-task-engine', 'issue-2')).toBe('/vault/issues/vibe-coding/kanban-task-engine/issue-2.md');
    });

    it('uses explicit registry project paths instead of project names', () => {
      const resolver = WorkspaceResolver.fromRegistry({
        spaces: {
          'vibe-coding': {
            type: 'container',
            issues: 'issues/vibe-coding',
            board: 'boards/vibe-coding.md',
            projects: {
              renamed: { path: 'issues/vibe-coding/custom-folder' },
            },
          },
        },
      }, '/vault');

      expect(resolver.getTicketPath('vibe-coding', 'renamed', 'issue-1')).toBe('/vault/issues/vibe-coding/custom-folder/issue-1.md');
      expect(resolver.parseTicketPath('/vault/issues/vibe-coding/custom-folder/issue-1.md')).toEqual({
        workspace: 'vibe-coding',
        project: 'renamed',
        ticketId: 'issue-1',
      });
    });
  });
});
