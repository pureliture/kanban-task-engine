import { TaskRef, CanonicalTaskModel } from './types';

export class IdResolver {
  private cache: Map<string, TaskRef> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  resolveRef(ref: TaskRef): string {
    return `${ref.provider}:${ref.external_key}:${ref.external_id}`;
  }

  parseRef(refString: string): TaskRef {
    const parts = refString.split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid task reference format: ${refString}`);
    }
    const provider = parts[0];
    const validProviders = ['local', 'github', 'firebase', 'jira'];
    if (!validProviders.includes(provider)) {
      throw new Error(`Invalid provider '${provider}' in reference: ${refString}. Valid: ${validProviders.join(', ')}`);
    }
    return {
      provider: provider as TaskRef['provider'],
      external_key: parts[1],
      external_id: parts.slice(2).join(':'),
    };
  }

  register(task: CanonicalTaskModel): void {
    const key = this.resolveRef(task.task_ref);
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, task.task_ref);
  }

  lookup(provider: string, externalKey: string, externalId: string): TaskRef | undefined {
    return this.cache.get(`${provider}:${externalKey}:${externalId}`);
  }

  clear(): void {
    this.cache.clear();
  }
}