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

  async syncFromProvider(providerName: string): Promise<number> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);

    const remoteTasks = await provider.fetchTasks();
    let syncCount = 0;

    for (const remoteTask of remoteTasks) {
      const localTask = await this.taskStore.findByExternalKey(
        remoteTask.task_ref.provider,
        remoteTask.task_ref.external_key
      );

      if (!localTask) {
        // New task from remote - save locally
        await this.taskStore.saveTask({
          ...remoteTask,
          sync: {
            ...remoteTask.sync,
            last_source: providerName as Sync['last_source'],
            checksum: computeChecksum(remoteTask),
          },
        });
        syncCount++;
        this.eventBus.emit('sync:task-added', { providerName, taskRef: remoteTask.task_ref });
        continue;
      }

      // Check for changes
      if (!hasChanged(localTask) && !hasChanged(remoteTask)) continue;
      if (localTask.sync.checksum === computeChecksum(remoteTask)) continue;

      // Conflict resolution
      const resolved = this.resolveConflict(localTask, remoteTask, providerName);
      await this.taskStore.updateTask(resolved);
      syncCount++;

      this.eventBus.emit('sync:task-updated', { providerName, taskRef: resolved.task_ref });
    }

    this.eventBus.emit('sync:completed', { providerName, count: syncCount });
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

    this.eventBus.emit('sync:pushed', { providerName, taskRef: task.task_ref });
  }

  handleRemoteEvent(event: SyncEvent): void {
    this.eventBus.emit('sync:remote-event', event);
    // Process the event through the policy engine if it involves a status change
    if (event.prev_status !== event.new_status) {
      this.eventBus.emit('sync:status-change', event);
    }
  }

  private resolveConflict(
    localTask: CanonicalTaskModel,
    remoteTask: CanonicalTaskModel,
    providerName: string
  ): CanonicalTaskModel {
    switch (this.conflictResolution) {
      case 'local-wins':
        return {
          ...remoteTask,
          workflow: localTask.workflow,
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
            checksum: computeChecksum(remoteTask),
          },
        };
      case 'newest-wins': {
        const localNewer = (localTask.updated ?? localTask.created ?? '') > (remoteTask.updated ?? remoteTask.created ?? '');
        const winner = localNewer ? localTask : remoteTask;
        return {
          ...winner,
          sync: {
            ...winner.sync,
            last_synced_at: new Date().toISOString(),
            last_source: providerName as Sync['last_source'],
            checksum: computeChecksum(winner),
          },
        };
      }
    }
  }
}