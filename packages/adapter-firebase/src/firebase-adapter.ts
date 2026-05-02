import {
  assertAdapterAllowed,
  SyncTransport,
  SyncEvent,
  RuntimePolicy,
} from '@kanban-task-engine/core';
import * as admin from 'firebase-admin';
import { FirebaseListener, FirestoreListenerConfig } from './firebase-listener';
import { firestoreDocToCanonical, FirestoreTaskDoc } from './firebase-mapper';

export interface FirebaseAdapterConfig {
  projectId: string;
  collectionPath: string;
  workspace: string;
  serviceAccount?: admin.ServiceAccount;
}

export class FirebaseAdapter implements SyncTransport {
  private app: admin.app.App;
  private config: FirebaseAdapterConfig;
  private listener: FirebaseListener | null = null;
  private handlers: ((event: SyncEvent) => void)[] = [];
  private connected = false;

  constructor(config: FirebaseAdapterConfig, private policy?: RuntimePolicy) {
    this.assertPolicyAllowsFirebase('connect');
    this.config = config;

    this.app = admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: config.serviceAccount
            ? admin.credential.cert(config.serviceAccount)
            : admin.credential.applicationDefault(),
          projectId: config.projectId,
        });
  }

  subscribe(handler: (event: SyncEvent) => void): void {
    this.handlers.push(handler);

    if (!this.listener) {
      this.listener = new FirebaseListener(this.app, {
        collectionPath: this.config.collectionPath,
        workspace: this.config.workspace,
      });

      this.listener.start((event) => {
        for (const h of [...this.handlers]) {
          try {
            h(event);
          } catch (err) {
            console.error('FirebaseAdapter: handler error:', err);
          }
        }
      });
    }
  }

  unsubscribe(handler: (event: SyncEvent) => void): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
    // If no handlers remain, stop the listener
    if (this.handlers.length === 0 && this.listener) {
      this.listener.stop();
      this.listener = null;
    }
  }

  async publish(event: SyncEvent): Promise<void> {
    this.assertPolicyAllowsFirebase('externalRequest');
    const db = admin.firestore(this.app);
    const docRef = db.collection(this.config.collectionPath).doc(event.task_ref.external_id);

    await docRef.set({
      id: event.task_ref.external_id,
      status: event.new_status,
      prevStatus: event.prev_status,
      lastSyncedAt: event.timestamp,
      lastSource: event.provider,
      checksum: event.checksum,
    }, { merge: true });
  }

  async acknowledge(eventId: string): Promise<void> {
    this.assertPolicyAllowsFirebase('externalRequest');
    // Mark the event as processed
    const db = admin.firestore(this.app);
    const ackRef = db.collection(`${this.config.collectionPath}_acks`).doc(eventId);
    await ackRef.set({ acknowledged: true, timestamp: admin.firestore.FieldValue.serverTimestamp() });
  }

  async connect(): Promise<void> {
    this.assertPolicyAllowsFirebase('connect');
    // Firebase Admin SDK connects on first use
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.listener) {
      this.listener.stop();
      this.listener = null;
    }
    this.handlers = [];
    this.connected = false;
  }

  async health(): Promise<{ connected: boolean; latencyMs?: number }> {
    this.assertPolicyAllowsFirebase('externalRequest');
    if (!this.connected) return { connected: false };

    const start = Date.now();
    try {
      const db = admin.firestore(this.app);
      await db.collection(this.config.collectionPath).limit(1).get();
      return { connected: true, latencyMs: Date.now() - start };
    } catch {
      return { connected: false };
    }
  }

  private assertPolicyAllowsFirebase(action: string): void {
    if (!this.policy) {
      throw new Error('FirebaseAdapter requires RuntimePolicy');
    }
    assertAdapterAllowed(this.policy, 'firebase', action);
  }
}
