import fs from 'fs/promises';
import path from 'path';
import { AutomationModule } from '../runtime/module';

class AsyncQueue {
  private queue: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(() => task().then(resolve).catch(reject));
    });
  }
}

const writeQueue = new AsyncQueue();

export function createAuditLogModule(filePath: string): AutomationModule {
  return {
    name: 'audit-log',
    sideEffects: ['writeEvent'],
    async run(context) {
      const event = context.values.event;
      if (!event) return context;
      
      await writeQueue.enqueue(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify({ ...(event as object), at: new Date().toISOString() })}\n`);
      });
      
      return context;
    },
  };
}
