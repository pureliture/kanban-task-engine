import { CanonicalTaskModel, NormalizedStatus, StateTransition, TaskFilter, TaskStore } from '../types';
import { canonicalToYaml, markdownIssueToCanonical, rawStatusToNormalized } from './mapper';
import { extractBody, serializeWithFrontmatter } from './frontmatter-utils';
import { atomicWriteFile } from './fs-utils';
import { resolveVaultPath } from './vault-path';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { validateIssueIdSegment } from '@kanban-task-engine/schema';

function deepMerge<T>(target: T, patch: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(patch as object)) {
    const patchVal = (patch as any)[key];
    const targetVal = (target as any)[key];
    if (
      patchVal !== null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      (result as any)[key] = deepMerge(targetVal, patchVal);
    } else {
      (result as any)[key] = patchVal;
    }
  }
  return result;
}

export interface MarkdownStoreOptions {
  basePath: string | string[];
  policyEngine?: {
    onTransition(task: CanonicalTaskModel, transition: StateTransition): Promise<void>;
    onParseError?(error: Error, filePath: string): void;
  };
}

export class MarkdownStore implements TaskStore {
  private workspacePaths: string[];
  private policyEngine?: MarkdownStoreOptions['policyEngine'];
  private stateCache: Map<string, CanonicalTaskModel> = new Map();
  private checksumCache: Map<string, string> = new Map();

  constructor(basePath: string | string[], options?: MarkdownStoreOptions) {
    this.workspacePaths = Array.isArray(basePath) ? basePath : [basePath];
    this.policyEngine = options?.policyEngine;
  }

  async findByExternalKey(provider: string, externalKey: string): Promise<CanonicalTaskModel | null> {
    const filePath = await this.findIssueFile(externalKey);
    if (!filePath) return null;

    try {
      return await this.readIssueFile(filePath);
    } catch (err) {
      this.policyEngine?.onParseError?.(err as Error, filePath);
      return null;
    }
  }

  async saveTask(task: CanonicalTaskModel): Promise<void> {
    const filePath = await this.resolveIssueWritePath(task);
    const yamlData = canonicalToYaml(task);

    let body: string;
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      body = extractBody(existing);
    } catch {
      body = `# ${yamlData.summary ?? ''}`;
    }

    const content = serializeWithFrontmatter(yamlData, body);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await atomicWriteFile(filePath, content);

    const checksum = await this.computeChecksum(filePath);
    this.syncCache(filePath, task, checksum);
  }

  async updateTask(task: CanonicalTaskModel): Promise<void> {
    await this.saveTask(task);
  }

  /**
   * Sync caches after programmatic task updates.
   * Call this after saveTask/updateTask to prevent false transitions.
   */
  syncCache(filePath: string, task: CanonicalTaskModel, checksum: string): void {
    this.stateCache.set(filePath, task);
    this.checksumCache.set(filePath, checksum);
  }

  /**
   * Invalidate cache for a task.
   * Call this before programmatic updates to force re-evaluation.
   */
  invalidateCache(filePath: string): void {
    this.stateCache.delete(filePath);
    this.checksumCache.delete(filePath);
  }

  async writeBack(task: CanonicalTaskModel, patch: Partial<CanonicalTaskModel>): Promise<void> {
    const existing = await this.findByExternalKey(task.task_ref.provider, task.task_ref.external_key);
    if (!existing) throw new Error(`Task not found: ${task.task_ref.external_id}`);

    const merged = deepMerge(existing, patch);
    await this.saveTask(merged);
  }

  async listTasks(filter?: TaskFilter): Promise<CanonicalTaskModel[]> {
    const allFiles = await this.getAllIssueFiles();
    const tasks: CanonicalTaskModel[] = [];

    for (const filePath of allFiles) {
      try {
        const task = await this.readIssueFile(filePath);
        if (this.matchesFilter(task, filter)) {
          tasks.push(task);
        }
      } catch (err) {
        this.policyEngine?.onParseError?.(err as Error, filePath);
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

  private async findIssueFile(issueId: string): Promise<string | null> {
    const files = await this.getAllIssueFiles();
    return files.find(filePath => {
      const basename = path.basename(filePath);
      return basename === `${issueId}.md` || basename.startsWith(`${issueId}-`);
    }) ?? null;
  }

  private async getAllIssueFiles(): Promise<string[]> {
    const files: string[] = [];
    for (const wsPath of this.workspacePaths) {
      const issuesDir = path.join(wsPath, 'issues');
      try {
        files.push(...await this.collectIssueFiles(issuesDir));
      } catch { continue; }
    }
    return files;
  }

  private getIssueFilePath(task: CanonicalTaskModel): string {
    const workspaceDir = this.workspacePaths[0] ?? 'workspace';
    const issuesDir = path.join(workspaceDir, 'issues');
    const fileName = this.getIssueFileName(task);
    return path.join(issuesDir, fileName);
  }

  private async resolveIssueWritePath(task: CanonicalTaskModel): Promise<string> {
    const workspaceDir = this.workspacePaths[0] ?? 'workspace';
    return resolveVaultPath(workspaceDir, 'issues', this.getIssueFileName(task));
  }

  private getIssueFileName(task: CanonicalTaskModel): string {
    const idErrors = validateIssueIdSegment(task.task_ref.external_id);
    if (idErrors.length > 0) {
      throw new Error(idErrors.join('; '));
    }
    return `${task.task_ref.external_id}-${this.slugify(task.summary)}.md`;
  }

  private async collectIssueFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries as Array<string | { name: string; isDirectory(): boolean; isFile(): boolean }>) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (name.startsWith('.')) continue;

      const entryPath = path.join(dirPath, name);
      if (typeof entry !== 'string' && entry.isDirectory()) {
        files.push(...await this.collectIssueFiles(entryPath));
        continue;
      }

      if (typeof entry !== 'string' && !entry.isFile()) {
        continue;
      }

      if (name.endsWith('.md')) {
        files.push(entryPath);
      }
    }

    return files;
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

  async computeChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex').slice(0, 12);
  }

  async loadFromFile(filePath: string): Promise<CanonicalTaskModel | null> {
    try {
      const task = await this.readIssueFile(filePath);

      // Update caches when loading
      const checksum = await this.computeChecksum(filePath);
      this.checksumCache.set(filePath, checksum);
      this.stateCache.set(filePath, task);

      return task;
    } catch (err) {
      this.policyEngine?.onParseError?.(err as Error, filePath);
      return null;
    }
  }

  private async readIssueFile(filePath: string): Promise<CanonicalTaskModel> {
    const content = await fs.readFile(filePath, 'utf-8');
    return markdownIssueToCanonical(content, filePath);
  }

  async onFileChange(filePath: string): Promise<void> {
    const checksum = await this.computeChecksum(filePath);

    // Skip if checksum hasn't changed (duplicate event)
    const cachedChecksum = this.checksumCache.get(filePath);
    if (cachedChecksum === checksum) {
      return;
    }
    this.checksumCache.set(filePath, checksum);

    const newTask = await this.loadFromFile(filePath);
    if (!newTask) return;

    const oldTask = this.stateCache.get(filePath);

    // Detect status change and notify policy engine
    if (oldTask && oldTask.workflow.normalized_status !== newTask.workflow.normalized_status) {
      const transition: StateTransition = {
        from: rawStatusToNormalized(oldTask.workflow.raw_status),
        to: rawStatusToNormalized(newTask.workflow.raw_status),
      };
      await this.policyEngine?.onTransition(newTask, transition);
    }

    this.stateCache.set(filePath, newTask);
  }
}
