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
      const result = resolver.parseTicketPath('/test/issues/openclaw/OC-001.md');
      expect(result).toEqual({
        workspace: 'openclaw',
        project: undefined,
        ticketId: 'OC-001'
      });
    });

    it('should parse project-container workspace path', () => {
      const result = resolver.parseTicketPath('/test/issues/vibe-coding/ai-cli-orch-wrapper/AO-001.md');
      expect(result).toEqual({
        workspace: 'vibe-coding',
        project: 'ai-cli-orch-wrapper',
        ticketId: 'AO-001'
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
});
