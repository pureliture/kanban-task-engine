export interface CliContext {
  vaultRoot: string;
  recipePath?: string;
}

export function createCliContext(env: Record<string, string | undefined> = process.env): CliContext {
  return {
    vaultRoot: env.KANBAN_HOME ?? `${env.HOME ?? '~'}/.openclaw/workspace-kanban/kanban`,
    recipePath: env.KANBAN_RECIPE,
  };
}
