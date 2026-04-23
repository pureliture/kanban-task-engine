import { describe, it, expect } from 'vitest';
import { firestoreDocToCanonical, canonicalToFirestoreDoc } from '../src/firebase-mapper';

describe('Firebase mapper', () => {
  describe('firestoreDocToCanonical', () => {
    it('converts Firestore document to CanonicalTaskModel', () => {
      const doc = {
        id: 'T-001',
        summary: 'Test task',
        status: 'In Progress',
        priority: 'High',
        issueType: 'Task',
        labels: ['backend'],
        components: ['api'],
        assignee: 'dev',
        reporter: 'pm',
        workspace: 'workspace-claude',
      };
      const result = firestoreDocToCanonical(doc, 'workspace-claude');
      expect(result.task_ref.provider).toBe('firebase');
      expect(result.task_ref.external_id).toBe('T-001');
      expect(result.workflow.normalized_status).toBe('RUNNING');
      expect(result.classification.priority).toBe('High');
    });

    it('maps "todo" status to TODO', () => {
      const doc = { id: 'T-002', status: 'todo' };
      const result = firestoreDocToCanonical(doc, 'ws');
      expect(result.workflow.normalized_status).toBe('TODO');
    });

    it('provides defaults for missing fields', () => {
      const result = firestoreDocToCanonical({ id: 'T-003' }, 'ws');
      expect(result.workflow.normalized_status).toBe('TODO');
      expect(result.classification.priority).toBe('Medium');
      expect(result.ownership.assignee).toBe('');
    });
  });

  describe('canonicalToFirestoreDoc', () => {
    it('round-trips through firestoreDocToCanonical', () => {
      const doc = {
        id: 'T-004',
        summary: 'Round trip',
        status: 'Done',
        priority: 'Low',
        issueType: 'Bug',
        labels: [],
        components: [],
        assignee: 'dev',
        reporter: 'qa',
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-02T00:00:00Z',
      };
      const canonical = firestoreDocToCanonical(doc, 'ws');
      const back = canonicalToFirestoreDoc(canonical);
      expect(back.summary).toBe('Round trip');
      expect(back.status).toBe('Done');
      expect(back.priority).toBe('Low');
    });
  });
});
