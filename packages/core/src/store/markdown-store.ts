import { CanonicalTaskModel, TaskFilter } from '../types';
import { yamlToCanonical, canonicalToYaml } from './mapper';
import YAML from 'yaml';
import fs from 'fs/promises';
import path from 'path';

export class MarkdownStore {
  private workspacePaths: string[];

  constructor(workspacePaths: string[]) {
    this.workspacePaths = workspacePaths;
  }

  async findByExternalKey(provider: string, externalKey: string): Promise<CanonicalTaskModel | null> {
    const filePath = await this.findIssueFile(externalKey);
    if (!filePath) return null;

    const content = await fs.readFile(filePath, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);
    if (!frontmatter) return null;

    return yamlToCanonical(frontmatter, filePath);
  }

  async saveTask(task: CanonicalTaskModel): Promise<void> {
    const filePath = this.getIssueFilePath(task);
    const yamlData = canonicalToYaml(task);
    const content = this.serializeWithFrontmatter(yamlData, task.description_ref);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async updateTask(task: CanonicalTaskModel): Promise<void> {
    await this.saveTask(task);
  }

  async writeBack(task: CanonicalTaskModel, patch: Partial<CanonicalTaskModel>): Promise<void> {
    const existing = await this.findByExternalKey(task.task_ref.provider, task.task_ref.external_key);
    if (!existing) throw new Error(`Task not found: ${task.task_ref.external_id}`);

    const merged = { ...existing, ...patch, ...patch.workflow ? { workflow: { ...existing.workflow, ...patch.workflow } } : {} };
    await this.saveTask(merged);
  }

  async listTasks(filter?: TaskFilter): Promise<CanonicalTaskModel[]> {
    const allFiles = await this.getAllIssueFiles();
    const tasks: CanonicalTaskModel[] = [];

    for (const filePath of allFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) continue;

      const task = yamlToCanonical(frontmatter, filePath);
      if (this.matchesFilter(task, filter)) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  async deleteTask(taskRef: { provider: string; external_key: string; external_id: string }): Promise<void> {
    const filePath = await this.findIssueFile(taskRef.external_id);
    if (filePath) {
      await fs.unlink(filePath);
    }
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) return null;
    try {
      return YAML.parse(match[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private serializeWithFrontmatter(yamlData: Record<string, unknown>, descriptionRef?: string): string {
    const frontmatter = YAML.stringify(yamlData, { lineWidth: 0 });
    const body = descriptionRef ? `\n# ${yamlData.summary ?? ''}\n` : '';
    return `---\n${frontmatter}---\n${body}`;
  }

  private async findIssueFile(issueId: string): Promise<string | null> {
    for (const wsPath of this.workspacePaths) {
      const issuesDir = path.join(wsPath, 'issues');
      try {
        const files = await fs.readdir(issuesDir);
        const match = files.find(f => f.startsWith(issueId) && f.endsWith('.md'));
        if (match) return path.join(issuesDir, match);
      } catch { continue; }
    }
    return null;
  }

  private async getAllIssueFiles(): Promise<string[]> {
    const files: string[] = [];
    for (const wsPath of this.workspacePaths) {
      const issuesDir = path.join(wsPath, 'issues');
      try {
        const entries = await fs.readdir(issuesDir);
        for (const entry of entries) {
          if (entry.endsWith('.md') && !entry.startsWith('.')) {
            files.push(path.join(issuesDir, entry));
          }
        }
      } catch { continue; }
    }
    return files;
  }

  private getIssueFilePath(task: CanonicalTaskModel): string {
    const workspaceDir = task.automation.workspace ?? 'workspace';
    const issuesDir = path.join(workspaceDir, 'issues');
    const fileName = `${task.task_ref.external_id}-${this.slugify(task.summary)}.md`;
    return path.join(issuesDir, fileName);
  }

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private matchesFilter(task: CanonicalTaskModel, filter?: TaskFilter): boolean {
    if (!filter) return true;
    if (filter.status && !filter.status.includes(task.workflow.normalized_status)) return false;
    if (filter.provider && !filter.provider.includes(task.task_ref.provider)) return false;
    if (filter.assignee && !filter.assignee.includes(task.ownership.assignee)) return false;
    if (filter.workspace && !filter.workspace.includes(task.automation.workspace ?? '')) return false;
    return true;
  }
}