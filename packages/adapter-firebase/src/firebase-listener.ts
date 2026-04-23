import * as admin from 'firebase-admin';
import { SyncEvent } from '@kanban-task-engine/core';

export interface FirestoreListenerConfig {
  collectionPath: string;
  workspace: string;
}

export class FirebaseListener {
  private app: admin.app.App;
  private unsubscribe: (() => void) | null = null;
  private config: FirestoreListenerConfig;

  constructor(app: admin.app.App, config: FirestoreListenerConfig) {
    this.app = app;
    this.config = config;
  }

  start(handler: (event: SyncEvent) => void): void {
    const db = admin.firestore(this.app);
    const collectionRef = db.collection(this.config.collectionPath);

    this.unsubscribe = collectionRef.onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data();
          const eventType = change.type;

          if (eventType === 'added' || eventType === 'modified') {
            const prevStatus = normalizeStatus((docData as any).prevStatus);
            const newStatus = normalizeStatus((docData as any).status);

            const event: SyncEvent = {
              event_id: `${change.doc.id}-${Date.now()}`,
              provider: 'firebase',
              task_ref: {
                provider: 'firebase',
                external_key: this.config.workspace,
                external_id: change.doc.id,
              },
              prev_status: prevStatus,
              new_status: newStatus,
              timestamp: new Date().toISOString(),
              checksum: (docData as any).checksum,
            };
            handler(event);
          }
        });
      },
      (error) => {
        console.error('FirebaseListener error:', error);
      }
    );
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

function normalizeStatus(status: unknown): SyncEvent['new_status'] {
  const value = typeof status === 'string' ? status.toLowerCase() : 'todo';
  if (value === 'ready' || value === 'selected' || value === 'todo') return 'READY';
  if (value === 'running' || value === 'active' || value === 'in progress') return 'RUNNING';
  if (value === 'review' || value === 'in review') return 'REVIEW';
  if (value === 'done') return 'DONE';
  if (value === 'failed' || value === 'blocked' || value === 'cancelled') return 'FAILED';
  return 'TODO';
}
