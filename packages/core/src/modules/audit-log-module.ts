import fs from 'fs/promises';
import path from 'path';
import { AutomationModule } from '../runtime/module';

export function createAuditLogModule(filePath: string): AutomationModule {
  return {
    name: 'audit-log',
    sideEffects: ['writeEvent'],
    async run(context) {
      const event = context.values.event;
      if (!event) return context;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify({ ...(event as object), at: new Date().toISOString() })}\n`);
      return context;
    },
  };
}
