import { describe, it, expect } from 'vitest';
import { firestoreDocToCanonical, canonicalToFirestoreDoc } from '../src/firebase-mapper';

describe('Firebase mapper', () => {
  describe('firestoreDocToCanonical', () => {
    it('converts Firestore document to CanonicalTaskModel', () => {
      const doc = {
        id: 'VC-001',
        summary: 'Test task',
        status: 'In Progress',
        priority: 'High',
        type: 'task',
        labels: ['backend'],
        assignee: 'dev',
        workspace: 'workspace-vibe-coding',
      };
      const result = firestoreDocToCanonical(doc, 'workspace-vibe-coding');
      expect(result.task_ref.provider).toBe('firebase');
      expect(result.task_ref.external_id).toBe('VC-001');
      expect(result.workflow.normalized_status).toBe('RUNNING');
      expect(result.classification.priority).toBe('High');
      expect(result.classification.issue_type).toBe('Task');
    });

    it('maps type=bug to canonical Bug', () => {
      const doc = { id: 'VC-002', type: 'bug', status: 'todo' };
      const result = firestoreDocToCanonical(doc, 'ws');
      expect(result.classification.issue_type).toBe('Bug');
    });

    it('maps type=epic to canonical Epic', () => {
      const doc = { id: 'VC-003', type: 'epic', status: 'todo' };
      const result = firestoreDocToCanonical(doc, 'ws');
      expect(result.classification.issue_type).toBe('Epic');
    });

    it('maps "todo" status to TODO', () => {
      const doc = { id: 'VC-004', status: 'todo' };
      const result = firestoreDocToCanonical(doc, 'ws');
      expect(result.workflow.normalized_status).toBe('TODO');
    });

    it('provides defaults for missing fields', () => {
      const result = firestoreDocToCanonical({ id: 'VC-005' }, 'ws');
      expect(result.workflow.normalized_status).toBe('TODO');
      expect(result.classification.priority).toBe('Medium');
      expect(result.ownership.assignee).toBe('');
    });
  });

  describe('canonicalToFirestoreDoc', () => {
    it('round-trips through firestoreDocToCanonical', () => {
      const doc = {
        id: 'VC-006',
        summary: 'Round trip',
        status: 'Done',
        priority: 'Low',
        type: 'bug',
        labels: [],
        assignee: 'dev',
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-02T00:00:00Z',
      };
      const canonical = firestoreDocToCanonical(doc, 'ws');
      const back = canonicalToFirestoreDoc(canonical);
      expect(back.summary).toBe('Round trip');
      expect(back.status).toBe('Done');
      expect(back.priority).toBe('Low');
      expect(back.type).toBe('bug');
    });

    it('maps canonical Epic back to type=epic', () => {
      const doc = { id: 'VC-007', type: 'epic', status: 'todo', summary: 'An epic' };
      const canonical = firestoreDocToCanonical(doc, 'ws');
      const back = canonicalToFirestoreDoc(canonical);
      expect(back.type).toBe('epic');
    });
  });
});
