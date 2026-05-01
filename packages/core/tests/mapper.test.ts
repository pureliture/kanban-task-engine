import { describe, it, expect } from 'vitest';
import { yamlToCanonical, canonicalToYaml, rawStatusToNormalized, normalizedToRawStatus } from '../src/store/mapper';

describe('mapper', () => {
  describe('rawStatusToNormalized', () => {
    it('maps "todo" to TODO', () => {
      expect(rawStatusToNormalized('todo')).toBe('TODO');
    });
    it('maps "RUNNING" to RUNNING', () => {
      expect(rawStatusToNormalized('RUNNING')).toBe('RUNNING');
    });
    it('maps "in-progress" to RUNNING', () => {
      expect(rawStatusToNormalized('in-progress')).toBe('RUNNING');
    });
    it('maps "Done" to DONE', () => {
      expect(rawStatusToNormalized('Done')).toBe('DONE');
    });
    it('maps "Blocked" to FAILED', () => {
      expect(rawStatusToNormalized('Blocked')).toBe('FAILED');
    });
    it('defaults unknown status to TODO', () => {
      expect(rawStatusToNormalized('unknown')).toBe('TODO');
    });
  });

  describe('normalizedToRawStatus', () => {
    it('maps TODO to "TODO"', () => {
      expect(normalizedToRawStatus('TODO')).toBe('TODO');
    });
    it('maps RUNNING to "RUNNING"', () => {
      expect(normalizedToRawStatus('RUNNING')).toBe('RUNNING');
    });
    it('maps DONE to "DONE"', () => {
      expect(normalizedToRawStatus('DONE')).toBe('DONE');
    });
  });

  describe('yamlToCanonical', () => {
    it('converts YAML frontmatter to CanonicalTaskModel', () => {
      const yaml = {
        id: 'VC-001',
        status: 'RUNNING',
        title: 'Test task',
        priority: 'P1',
        type: 'task',
        assignee: 'claude',
        labels: ['frontend'],
      };
      const result = yamlToCanonical(yaml, '/workspace-vibe-coding/issues/VC-001-test.md');
      expect(result.task_ref.external_id).toBe('VC-001');
      expect(result.workflow.normalized_status).toBe('RUNNING');
      expect(result.summary).toBe('Test task');
      expect(result.classification.priority).toBe('High');
      expect(result.classification.issue_type).toBe('Task');
      expect(result.classification.labels).toEqual(['frontend']);
    });

    it('maps type=bug to canonical Bug', () => {
      const result = yamlToCanonical(
        { id: 'VC-002', type: 'bug', title: 'A bug' },
        '/workspace-vibe-coding/issues/VC-002.md',
      );
      expect(result.classification.issue_type).toBe('Bug');
    });

    it('ignores deprecated issueType fallback', () => {
      const result = yamlToCanonical(
        { id: 'VC-002', issueType: 'bug', title: 'Legacy bug' },
        '/workspace-vibe-coding/issues/VC-002.md',
      );
      expect(result.classification.issue_type).toBe('Task');
    });

    it('maps type=epic to canonical Epic', () => {
      const result = yamlToCanonical(
        { id: 'VC-003', type: 'epic', title: 'An epic' },
        '/workspace-vibe-coding/issues/VC-003.md',
      );
      expect(result.classification.issue_type).toBe('Epic');
    });

    it('maps type=chore to canonical Task', () => {
      const result = yamlToCanonical(
        { id: 'VC-004', type: 'chore', title: 'Chore' },
        '/workspace-vibe-coding/issues/VC-004.md',
      );
      expect(result.classification.issue_type).toBe('Task');
    });

    it('maps P0 priority to canonical Blocker', () => {
      const result = yamlToCanonical(
        { id: 'VC-005', type: 'task', priority: 'P0' },
        '/workspace-vibe-coding/issues/VC-005.md',
      );
      expect(result.classification.priority).toBe('Blocker');
    });

    it('maps P3 priority to canonical Low', () => {
      const result = yamlToCanonical(
        { id: 'VC-006', type: 'task', priority: 'P3' },
        '/workspace-vibe-coding/issues/VC-006.md',
      );
      expect(result.classification.priority).toBe('Low');
    });

    it('extracts workspace from path', () => {
      const result = yamlToCanonical(
        { id: 'VC-001' },
        '/workspace-vibe-coding/issues/VC-001.md',
      );
      expect(result.task_ref.external_key).toBe('workspace-vibe-coding');
    });

    it('provides defaults for missing fields', () => {
      const result = yamlToCanonical({}, '/workspace/issues/test.md');
      expect(result.workflow.normalized_status).toBe('TODO');
      expect(result.classification.issue_type).toBe('Task');
      expect(result.classification.priority).toBe('Medium');
    });
  });

  describe('canonicalToYaml', () => {
    it('round-trips through yamlToCanonical and back', () => {
      const original = {
        id: 'VC-002',
        status: 'TODO',
        priority: 'P2',
        type: 'bug',
        title: 'Bug report',
        assignee: 'dev',
        labels: [],
        created: '2026-04-16T10:00:00Z',
        updated: '2026-04-16T10:00:00Z',
      };
      const canonical = yamlToCanonical(original, '/workspace-vibe-coding/issues/VC-002-bug.md');
      const yaml = canonicalToYaml(canonical);
      expect(yaml.id).toBe('VC-002');
      expect(yaml.status).toBe('TODO');
      expect(yaml.priority).toBe('P2');
      expect(yaml.type).toBe('bug');
      expect(yaml.title).toBe('Bug report');
    });

    it('maps canonical Blocker priority back to P0', () => {
      const original = { id: 'VC-001', type: 'task', priority: 'P0', title: 't' };
      const canonical = yamlToCanonical(original, '/workspace/issues/VC-001.md');
      const yaml = canonicalToYaml(canonical);
      expect(yaml.priority).toBe('P0');
    });

    it('maps canonical Epic type back to epic', () => {
      const original = { id: 'VC-001', type: 'epic', title: 'An epic' };
      const canonical = yamlToCanonical(original, '/workspace/issues/VC-001.md');
      const yaml = canonicalToYaml(canonical);
      expect(yaml.type).toBe('epic');
    });
  });
});
