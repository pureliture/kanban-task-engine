import { describe, it, expect } from 'vitest';
import { yamlToCanonical, canonicalToYaml, rawStatusToNormalized, normalizedToRawStatus } from '../src/store/mapper';

describe('mapper', () => {
  describe('rawStatusToNormalized', () => {
    it('maps "backlog" to BACKLOG', () => {
      expect(rawStatusToNormalized('backlog')).toBe('BACKLOG');
    });
    it('maps "In Progress" to ACTIVE', () => {
      expect(rawStatusToNormalized('In Progress')).toBe('ACTIVE');
    });
    it('maps "in-progress" to ACTIVE', () => {
      expect(rawStatusToNormalized('in-progress')).toBe('ACTIVE');
    });
    it('maps "Done" to DONE', () => {
      expect(rawStatusToNormalized('Done')).toBe('DONE');
    });
    it('maps "Blocked" to BLOCKED', () => {
      expect(rawStatusToNormalized('Blocked')).toBe('BLOCKED');
    });
    it('defaults unknown status to BACKLOG', () => {
      expect(rawStatusToNormalized('unknown')).toBe('BACKLOG');
    });
  });

  describe('normalizedToRawStatus', () => {
    it('maps BACKLOG to "Backlog"', () => {
      expect(normalizedToRawStatus('BACKLOG')).toBe('Backlog');
    });
    it('maps ACTIVE to "In Progress"', () => {
      expect(normalizedToRawStatus('ACTIVE')).toBe('In Progress');
    });
    it('maps DONE to "Done"', () => {
      expect(normalizedToRawStatus('DONE')).toBe('Done');
    });
  });

  describe('yamlToCanonical', () => {
    it('converts YAML frontmatter to CanonicalTaskModel', () => {
      const yaml = {
        id: 'OC-001',
        status: 'In Progress',
        summary: 'Test task',
        priority: 'High',
        issueType: 'Task',
        assignee: 'claude',
        reporter: 'user',
        labels: ['frontend'],
        components: ['web'],
      };
      const result = yamlToCanonical(yaml, '/workspace-claude/issues/OC-001-test.md');
      expect(result.task_ref.external_id).toBe('OC-001');
      expect(result.workflow.normalized_status).toBe('ACTIVE');
      expect(result.summary).toBe('Test task');
      expect(result.classification.priority).toBe('High');
      expect(result.classification.labels).toEqual(['frontend']);
    });

    it('extracts workspace from path', () => {
      const result = yamlToCanonical({ id: 'T-1' }, '/workspace-claude/issues/T-1.md');
      expect(result.task_ref.external_key).toBe('workspace-claude');
    });

    it('provides defaults for missing fields', () => {
      const result = yamlToCanonical({}, '/workspace/issues/test.md');
      expect(result.workflow.normalized_status).toBe('BACKLOG');
      expect(result.classification.issue_type).toBe('Task');
      expect(result.classification.priority).toBe('Medium');
    });
  });

  describe('canonicalToYaml', () => {
    it('round-trips through yamlToCanonical and back', () => {
      const original = {
        id: 'OC-002',
        status: 'Backlog',
        priority: 'Medium',
        issueType: 'Bug',
        summary: 'Bug report',
        assignee: 'dev',
        reporter: 'qa',
        labels: [],
        components: [],
        created: '2026-04-16T10:00:00Z',
        updated: '2026-04-16T10:00:00Z',
      };
      const canonical = yamlToCanonical(original, '/workspace/issues/OC-002-bug.md');
      const yaml = canonicalToYaml(canonical);
      expect(yaml.id).toBe('OC-002');
      expect(yaml.status).toBe('Backlog');
      expect(yaml.priority).toBe('Medium');
      expect(yaml.issueType).toBe('Bug');
    });
  });
});