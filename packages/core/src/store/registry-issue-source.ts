import type { Dirent } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import {
  validateIssueFrontmatterForRegistry,
  type IssueFrontmatter,
  type IssueStatus,
} from '@kanban-task-engine/schema';
import {
  getRegistrySpace,
  listRegistrySpaces,
  loadRegistry,
  type RegistrySpace,
} from '../store/registry';
import { resolveVaultPath } from '../store/vault-path';

export interface RegistryIssueRecord {
  id: string;
  status: IssueStatus;
  space: string;
  absolutePath: string;
  relativePath: string;
  markdown: string;
  body: string;
  frontmatter: IssueFrontmatter;
  projection: {
    id: string;
    title: string;
    type: IssueFrontmatter['type'];
    status: IssueStatus;
    priority?: IssueFrontmatter['priority'];
    project: string;
    epic?: string;
    updated: string;
    relativePath: string;
  };
}

export interface ListRegistryIssueRecordsOptions {
  vaultRoot: string;
  space?: string;
}

export interface FindRegistryIssueByIdOptions {
  vaultRoot: string;
  issueId: string;
  space?: string;
}

const TASK_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'];
const EPIC_SECTIONS = ['목표', '범위', '성공 지표', '하위 티켓', '로그'];

export async function listRegistryIssueRecords(
  options: ListRegistryIssueRecordsOptions,
): Promise<RegistryIssueRecord[]> {
  const vaultRoot = path.resolve(options.vaultRoot);
  const registry = await loadRegistry(await resolveVaultPath(vaultRoot, 'registry.yaml'));
  const spaceNames = options.space ? [options.space] : listRegistrySpaces(registry);
  const records: RegistryIssueRecord[] = [];

  for (const spaceName of spaceNames) {
    const space = getRegistrySpace(registry, spaceName);
    const roots = [...issueRootRelatives(space), space.epics];
    for (const filePath of await listIssueFiles(vaultRoot, roots)) {
      const markdown = await fs.readFile(filePath, 'utf8');
      const relativePath = toVaultRelativePath(vaultRoot, filePath);
      const { frontmatter, body } = parseIssueForRegistry(markdown, space, relativePath);
      records.push({
        id: frontmatter.id,
        status: frontmatter.status,
        space: spaceName,
        absolutePath: filePath,
        relativePath,
        markdown,
        body,
        frontmatter,
        projection: {
          id: frontmatter.id,
          title: frontmatter.title,
          type: frontmatter.type,
          status: frontmatter.status,
          priority: frontmatter.priority,
          project: frontmatter.project,
          epic: frontmatter.epic,
          updated: frontmatter.updated,
          relativePath,
        },
      });
    }
  }

  return records.sort((a, b) => a.id.localeCompare(b.id) || a.relativePath.localeCompare(b.relativePath));
}

export async function findRegistryIssueById(
  options: FindRegistryIssueByIdOptions,
): Promise<RegistryIssueRecord> {
  const records = (await listRegistryIssueRecords({ vaultRoot: options.vaultRoot, space: options.space }))
    .filter(record => record.id === options.issueId);

  if (records.length === 0) {
    throw new Error(`Unknown issue id: ${options.issueId}`);
  }
  if (records.length > 1) {
    throw new Error(`Duplicate issue id: ${options.issueId}`);
  }
  return records[0];
}

function issueRootRelatives(space: RegistrySpace): string[] {
  if (space.type === 'container') {
    const projectRoots = Object.values(space.projects ?? {}).map(project => project.path);
    return projectRoots.length > 0 ? projectRoots : [space.issues];
  }
  return [space.issues];
}

async function listIssueFiles(vaultRoot: string, relativeRoots: string[]): Promise<string[]> {
  const roots = await dedupeRoots(vaultRoot, relativeRoots);
  const files: string[] = [];
  for (const root of roots) {
    files.push(...await listMarkdownFiles(root, vaultRoot));
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function dedupeRoots(vaultRoot: string, relativeRoots: string[]): Promise<string[]> {
  const entries = await Promise.all(relativeRoots.map(async (relativeRoot, index) => {
    const rootPath = await resolveRegistryVaultPath(vaultRoot, relativeRoot, `scanRoot[${index}]`);
    let realPath: string;
    try {
      realPath = await fs.realpath(rootPath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') realPath = rootPath;
      else throw error;
    }
    return { rootPath, realPath };
  }));

  entries.sort((a, b) => a.realPath.length - b.realPath.length);
  const selected: typeof entries = [];
  for (const entry of entries) {
    if (selected.some(parent => isInsideOrSame(entry.realPath, parent.realPath))) continue;
    selected.push(entry);
  }
  return selected.map(entry => entry.rootPath);
}

async function listMarkdownFiles(dir: string, vaultRoot: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const entryPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Vault path escapes root: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath, vaultRoot));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const realVaultRoot = await fs.realpath(vaultRoot);
      const realFile = await fs.realpath(entryPath);
      if (!isInsideOrSame(realFile, realVaultRoot)) {
        throw new Error(`Vault path escapes root: ${entryPath}`);
      }
      files.push(entryPath);
    }
  }
  return files;
}

function parseIssueForRegistry(
  markdown: string,
  space: RegistrySpace,
  relativePath: string,
): { frontmatter: IssueFrontmatter; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) throw new Error('Invalid issue markdown: Missing YAML frontmatter');

  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    throw new Error(`Invalid issue markdown: Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = validateIssueFrontmatterForRegistry(frontmatter, {
    idPrefix: space.idPrefix,
    spaceType: space.type,
  });
  const errors: string[] = [];
  if (!result.ok) {
    errors.push(...result.errors);
  }
  const validatedFrontmatter = result.ok ? result.value : undefined;
  const body = normalized.slice(frontmatterMatch[0].length);
  const sections = extractSections(body);
  const issueType = isRecord(frontmatter) ? String(frontmatter.type ?? '') : '';
  const requiredSections = issueType === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS;

  for (const section of requiredSections) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) throw new Error(`Invalid issue markdown in ${relativePath}: ${errors.join('; ')}`);
  if (!validatedFrontmatter) throw new Error(`Invalid issue markdown in ${relativePath}: Missing validated frontmatter`);
  return { frontmatter: validatedFrontmatter, body };
}

async function resolveRegistryVaultPath(vaultRoot: string, relativePath: string, field: string): Promise<string> {
  assertSafeRegistryPath(relativePath, field);
  return resolveVaultPath(vaultRoot, ...relativePath.split('/'));
}

function assertSafeRegistryPath(value: string, field: string): void {
  if (
    value.trim() === '' ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.includes('//') ||
    path.isAbsolute(value) ||
    value.split('/').includes('..')
  ) {
    throw new Error(`Unsafe registry ${field} path: ${value}`);
  }
}

function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split('\n');
  let current: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = match[1].trim();
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): string {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join('/');
}

function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
