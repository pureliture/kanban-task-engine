import fs from 'fs/promises';
import path from 'path';
import type { CanonicalTaskModel } from '@kanban-task-engine/core';
import type { QueueStats, QueuedTask } from './types';

export interface RateLimitQueueOptions {
  maxSize: number;
}

export interface TaskLike {
  id: string;
  [key: string]: unknown;
}

export class PersistentRateLimitQueue {
  private queue: QueuedTask[] = [];
  private backupPath: string;
  private maxSize: number;
  private processing: Set<string> = new Set();
  private loaded: boolean = false;

  constructor(backupPath: string, options: RateLimitQueueOptions = { maxSize: 100 }) {
    this.backupPath = backupPath;
    this.maxSize = options.maxSize;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.backupPath, 'utf-8');
      this.queue = JSON.parse(data);
    } catch {
      this.queue = [];
    }
    this.loaded = true;
  }

  async enqueue(task: TaskLike, priority: number = 0): Promise<void> {
    await this.ensureLoaded();

    if (this.queue.length >= this.maxSize) {
      throw new Error('Queue full: maximum queue size reached');
    }

    this.queue.push({
      task: task as unknown as CanonicalTaskModel,
      priority,
      enqueuedAt: Date.now(),
      attempts: 0
    });

    this.queue.sort((a, b) => b.priority - a.priority);
    await this.persist();
  }

  async dequeue(): Promise<TaskLike | null> {
    await this.ensureLoaded();

    const entry = this.queue.shift();
    if (!entry) return null;

    this.processing.add(entry.task.id as string);
    await this.persist();

    return entry.task as TaskLike;
  }

  peek(): TaskLike | null {
    return this.queue[0]?.task as TaskLike ?? null;
  }

  size(): number {
    return this.queue.length;
  }

  async clear(): Promise<void> {
    this.queue = [];
    this.processing.clear();
    this.loaded = true;
    await this.persist();
  }

  setPriority(taskId: string, priority: number): void {
    const entry = this.queue.find(e => e.task.id === taskId);
    if (entry) {
      entry.priority = priority;
      this.queue.sort((a, b) => b.priority - a.priority);
    }
  }

  async getQueueStats(): Promise<QueueStats> {
    await this.ensureLoaded();

    const byPriority = new Map<number, number>();
    for (const entry of this.queue) {
      const count = byPriority.get(entry.priority) ?? 0;
      byPriority.set(entry.priority, count + 1);
    }

    return {
      total: this.queue.length,
      pending: this.queue.length - this.processing.size,
      processing: this.processing.size,
      byPriority
    };
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.backupPath), { recursive: true });
    await fs.writeFile(this.backupPath, JSON.stringify(this.queue, null, 2));
  }

  async restore(): Promise<void> {
    try {
      const data = await fs.readFile(this.backupPath, 'utf-8');
      this.queue = JSON.parse(data);
    } catch {
      this.queue = [];
    }
    this.loaded = true;
  }
}

// Alias for backward compatibility
export const RateLimitQueue = PersistentRateLimitQueue;