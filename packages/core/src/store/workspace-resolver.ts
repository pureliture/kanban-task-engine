import path from 'path';

export type WorkspaceType = 'single' | 'container';

export interface WorkspaceConfig {
  type: WorkspaceType;
  path: string;
  projects?: string[];
}

export interface ParsedTicketPath {
  workspace: string;
  project?: string;
  ticketId: string;
}

export class WorkspaceResolver {
  private config: Record<string, WorkspaceConfig>;

  constructor(config: Record<string, WorkspaceConfig>) {
    this.config = config;
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

    return path.join(wsConfig.path, project, `${ticketId}.md`);
  }

  parseTicketPath(filePath: string): ParsedTicketPath | null {
    for (const [workspace, wsConfig] of Object.entries(this.config)) {
      const wsPath = path.resolve(wsConfig.path);

      if (!filePath.startsWith(wsPath)) continue;

      const relative = path.relative(wsPath, filePath);

      if (wsConfig.type === 'single') {
        const match = relative.match(/^([A-Z]+-\d+)\.md$/);
        if (match) {
          return { workspace, ticketId: match[1] };
        }
      } else {
        const match = relative.match(/^([^/]+)\/([A-Z]+-\d+)\.md$/);
        if (match) {
          const [, project, ticketId] = match;
          if (wsConfig.projects?.includes(project)) {
            return { workspace, project, ticketId };
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
