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
        id: 'OC-001',
        status: 'RUNNING',
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
      expect(result.workflow.normalized_status).toBe('RUNNING');
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
      expect(result.workflow.normalized_status).toBe('TODO');
      expect(result.classification.issue_type).toBe('Task');
      expect(result.classification.priority).toBe('Medium');
    });
  });

  describe('canonicalToYaml', () => {
    it('round-trips through yamlToCanonical and back', () => {
      const original = {
        id: 'OC-002',
        status: 'TODO',
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
      expect(yaml.status).toBe('TODO');
      expect(yaml.priority).toBe('Medium');
      expect(yaml.issueType).toBe('Bug');
    });
  });
});
