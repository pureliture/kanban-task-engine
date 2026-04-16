import {
  CanonicalTaskModel,
  NormalizedStatus,
  SyncEvent,
  WorkStateProvider,
  SyncTransport,
  TaskStore,
  Sync,
} from './types';
import { EventBus } from './event-bus';
import { StateMachine } from './state-machine';
import { PolicyEngine } from './policy-engine';
import { computeChecksum, hasChanged } from './checksum';
import { SYNC_EVENTS } from './events';

export type ConflictResolution = 'local-wins' | 'provider-wins' | 'newest-wins';

export class SyncCoordinator {
  private taskStore: TaskStore;
  private eventBus: EventBus;
  private stateMachine: StateMachine;
  private policyEngine: PolicyEngine;
  private providers: Map<string, WorkStateProvider> = new Map();
  private transports: Map<string, SyncTransport> = new Map();
  private conflictResolution: ConflictResolution;

  constructor(
    taskStore: TaskStore,
    eventBus: EventBus,
    stateMachine: StateMachine,
    policyEngine: PolicyEngine,
    conflictResolution: ConflictResolution = 'local-wins'
  ) {
    this.taskStore = taskStore;
    this.eventBus = eventBus;
    this.stateMachine = stateMachine;
    this.policyEngine = policyEngine;
    this.conflictResolution = conflictResolution;
  }

  registerProvider(name: string, provider: WorkStateProvider): void {
    this.providers.set(name, provider);
  }

  registerTransport(name: string, transport: SyncTransport): void {
    this.transports.set(name, transport);
  }

  async syncFromProvider(providerName: string, since?: string): Promise<number> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);

    const remoteTasks = await provider.fetchTasks(since);
    let syncCount = 0;

    for (const remoteTask of remoteTasks) {
      const localTask = await this.taskStore.findByExternalKey(
        remoteTask.task_ref.provider,
        remoteTask.task_ref.external_key
      );

      if (!localTask) {
        await this.taskStore.saveTask({
          ...remoteTask,
          sync: {
            ...remoteTask.sync,
            last_source: providerName as Sync['last_source'],
            checksum: computeChecksum(remoteTask),
          },
        });
        syncCount++;
        this.eventBus.emit(SYNC_EVENTS.TASK_ADDED, { providerName, taskRef: remoteTask.task_ref });
        continue;
      }

      // Check for changes
      const remoteChecksum = computeChecksum(remoteTask);
      if (!hasChanged(localTask) && localTask.sync.checksum === remoteChecksum) continue;

      // Conflict resolution
      const resolved = this.resolveConflict(localTask, remoteTask, providerName, remoteChecksum);
      await this.taskStore.updateTask(resolved);
      syncCount++;

      this.eventBus.emit(SYNC_EVENTS.TASK_UPDATED, { providerName, taskRef: resolved.task_ref });
    }

    this.eventBus.emit(SYNC_EVENTS.COMPLETED, { providerName, count: syncCount });
    return syncCount;
  }

  async pushToProvider(providerName: string, task: CanonicalTaskModel): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);

    await provider.pushStatus(task.task_ref.external_key, task.workflow.normalized_status);

    // Update local checksum
    await this.taskStore.updateTask({
      ...task,
      sync: {
        ...task.sync,
        last_synced_at: new Date().toISOString(),
        last_source: providerName as Sync['last_source'],
        checksum: computeChecksum(task),
      },
    });

    this.eventBus.emit(SYNC_EVENTS.PUSHED, { providerName, taskRef: task.task_ref });
  }

  handleRemoteEvent(event: SyncEvent): void {
    this.eventBus.emit(SYNC_EVENTS.REMOTE_EVENT, event);
    // Process the event through the policy engine if it involves a status change
    if (event.prev_status !== event.new_status) {
      this.eventBus.emit(SYNC_EVENTS.STATUS_CHANGE, event);
    }
  }

  private resolveConflict(
    localTask: CanonicalTaskModel,
    remoteTask: CanonicalTaskModel,
    providerName: string,
    remoteChecksum?: string
  ): CanonicalTaskModel {
    switch (this.conflictResolution) {
      case 'local-wins':
        return {
          ...localTask,
          sync: {
            ...localTask.sync,
            last_synced_at: new Date().toISOString(),
            last_source: providerName as Sync['last_source'],
            checksum: computeChecksum(localTask),
          },
        };
      case 'provider-wins':
        return {
          ...remoteTask,
          sync: {
            ...remoteTask.sync,
            last_synced_at: new Date().toISOString(),
            last_source: providerName as Sync['last_source'],
            checksum: remoteChecksum ?? computeChecksum(remoteTask),
          },
        };
      case 'newest-wins': {
        const localTs = localTask.updated ?? localTask.created;
        const remoteTs = remoteTask.updated ?? remoteTask.created;
        if (!localTs || !remoteTs) {
          // Cannot compare - fall back to local-wins
          return {
            ...localTask,
            sync: {
              ...localTask.sync,
              last_synced_at: new Date().toISOString(),
              last_source: providerName as Sync['last_source'],
              checksum: computeChecksum(localTask),
            },
          };
        }
        const localNewer = localTs > remoteTs;
        const winner = localNewer ? localTask : remoteTask;
        return {
          ...winner,
          sync: {
            ...winner.sync,
            last_synced_at: new Date().toISOString(),
            last_source: providerName as Sync['last_source'],
            checksum: localNewer ? computeChecksum(localTask) : (remoteChecksum ?? computeChecksum(remoteTask)),
          },
        };
      }
    }
  }
}