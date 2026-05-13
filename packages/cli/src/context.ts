export interface CliContext {
  vaultRoot: string;
  vaultRootExplicit: boolean;
  recipePath?: string;
}

export function createCliContext(env: Record<string, string | undefined> = process.env): CliContext {
  const explicit = env.KANBAN_HOME !== undefined && env.KANBAN_HOME.trim() !== '';
  return {
    vaultRoot: explicit ? env.KANBAN_HOME as string : `${env.HOME ?? '~'}/.openclaw/workspace-kanban/kanban`,
    vaultRootExplicit: explicit,
    recipePath: env.KANBAN_RECIPE,
  };
}
