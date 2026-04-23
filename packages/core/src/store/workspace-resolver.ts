import path from 'path';

export type WorkspaceType = 'single' | 'container';

export interface WorkspaceConfig {
  type: WorkspaceType;
  path: string;
  projects?: string[];
  projectPaths?: Record<string, string>;
}

export interface ParsedTicketPath {
  workspace: string;
  project?: string;
  ticketId: string;
}

export interface VaultRegistry {
  spaces: Record<string, {
    type: WorkspaceType;
    issues: string;
    board: string;
    projects?: Record<string, { path: string }>;
  }>;
}

export class WorkspaceResolver {
  private config: Record<string, WorkspaceConfig>;

  constructor(config: Record<string, WorkspaceConfig>) {
    this.config = config;
  }

  static fromRegistry(registry: VaultRegistry, vaultRoot: string): WorkspaceResolver {
    const config: Record<string, WorkspaceConfig> = {};
    for (const [space, entry] of Object.entries(registry.spaces)) {
      config[space] = {
        type: entry.type,
        path: path.join(vaultRoot, entry.issues),
        projects: entry.projects ? Object.keys(entry.projects) : undefined,
        projectPaths: entry.projects
          ? Object.fromEntries(
              Object.entries(entry.projects).map(([project, projectEntry]) => [
                project,
                path.join(vaultRoot, projectEntry.path),
              ])
            )
          : undefined,
      };
    }
    return new WorkspaceResolver(config);
  }

  getTicketPath(workspace: string, ticketIdOrProject: string, ticketId?: string): string {
    const wsConfig = this.config[workspace];
    if (!wsConfig) {
      throw new Error(`Unknown workspace: ${workspace}`);
    }

    if (wsConfig.type === 'single') {
      if (ticketId !== undefined) {
        throw new Error(`Workspace '${workspace}' is single-ticket and does not support projects`);
      }
      const ticketIdVal = ticketIdOrProject;
      return path.join(wsConfig.path, `${ticketIdVal}.md`);
    }

    // Container workspace
    if (ticketId === undefined) {
      throw new Error(`Workspace '${workspace}' is a container and requires a project name`);
    }

    const project = ticketIdOrProject;
    if (!wsConfig.projects?.includes(project)) {
      throw new Error(`Unknown project '${project}' in workspace '${workspace}'`);
    }

    const projectPath = wsConfig.projectPaths?.[project] ?? path.join(wsConfig.path, project);
    return path.join(projectPath, `${ticketId}.md`);
  }

  parseTicketPath(filePath: string): ParsedTicketPath | null {
    const resolvedFilePath = path.resolve(filePath);
    for (const [workspace, wsConfig] of Object.entries(this.config)) {
      const wsPath = path.resolve(wsConfig.path);

      if (!isWithinBase(resolvedFilePath, wsPath)) continue;

      const relative = path.relative(wsPath, resolvedFilePath);

      if (wsConfig.type === 'single') {
        if (path.dirname(relative) === '.' && relative.endsWith('.md')) {
          return { workspace, ticketId: path.basename(relative, '.md') };
        }
      } else {
        for (const project of wsConfig.projects ?? []) {
          const projectPath = path.resolve(wsConfig.projectPaths?.[project] ?? path.join(wsPath, project));
          if (!isWithinBase(resolvedFilePath, projectPath)) continue;

          const projectRelative = path.relative(projectPath, resolvedFilePath);
          if (path.dirname(projectRelative) === '.' && projectRelative.endsWith('.md')) {
            return { workspace, project, ticketId: path.basename(projectRelative, '.md') };
          }
        }
      }
    }

    return null;
  }

  listProjects(workspace: string): string[] {
    const wsConfig = this.config[workspace];
    if (!wsConfig) {
      throw new Error(`Unknown workspace: ${workspace}`);
    }
    return wsConfig.projects || [];
  }

  getWorkspaceType(workspace: string): WorkspaceType {
    const wsConfig = this.config[workspace];
    if (!wsConfig) {
      throw new Error(`Unknown workspace: ${workspace}`);
    }
    return wsConfig.type;
  }
}

function isWithinBase(filePath: string, basePath: string): boolean {
  const relative = path.relative(basePath, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
