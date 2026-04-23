import { AutomationModule } from '../runtime/module';

export function createManualCommandTrigger(): AutomationModule {
  return {
    name: 'manual-command-trigger',
    sideEffects: [],
    async run(context) {
      const command = String(context.values.command ?? '');
      const match = command.match(/^run\s+(.+)$/i);
      if (!match) return context;
      return {
        ...context,
        values: {
          ...context.values,
          requestedIssueId: match[1],
          requestedStatus: 'RUNNING',
        },
      };
    },
  };
}
