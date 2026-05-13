import type { Dirent } from 'fs';
import type { FileHandle } from 'fs/promises';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { validateIssueIdSegment, type IssueType, type Priority } from '@kanban-task-engine/schema';
import { loadRegistry, getRegistrySpace, type RegistrySpace } from '../store/registry';
import { resolveVaultPath } from '../store/vault-path';
import { allocateNextIssueId } from '../store/sequence';
import { createIssueDraft, type IssueExecutor } from './issue-factory';

export interface ScanIssueIdsResult {
  ids: string[];
  reservedIds: Set<string>;
  owners: Map<string, IssueIdOwner[]>;
  warnings: string[];
  duplicateErrors: string[];
  fatalErrors: string[];
}

export interface IssueIdOwner {
  id: string;
  filePath: string;
  relativePath: string;
  source: 'frontmatter' | 'filename';
}

export interface CreateIssueInput {
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  type?: IssueType;
  priority?: Priority;
  executor?: IssueExecutor;
  labels?: string[];
  assignee?: string;
  epic?: string;
  workingDir?: string;
  mergeInto?: string;
  now?: Date;
  dryRun?: boolean;
}

export interface CreateIssueResult {
  id: string;
  relativePath: string;
  absolutePath: string;
  markdown: string;
  created: boolean;
  warnings: string[];
}

const ISSUE_TYPES = new Set<string>(['epic', 'task', 'bug', 'chore', 'docs']);
const PRIORITIES = new Set<string>(['P0', 'P1', 'P2', 'P3']);
const EXECUTORS = new Set<string>(['human', 'codex', 'claude-code']);

export function splitSafeRelativePath(relativePath: string): string[] {
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.includes('\0')) {
    throw new Error(`Unsafe registry path: ${relativePath}`);
  }

  const parts = relativePath.split('/');
  if (parts.length === 0 || parts.some(part => part.trim() === '' || part === '.' || part === '..')) {
    throw new Error(`Unsafe registry path: ${relativePath}`);
  }

  return parts;
}

export async function resolveRegistryPath(vaultRoot: string, relativePath: string): Promise<string> {
  return resolveVaultPath(vaultRoot, ...splitSafeRelativePath(relativePath));
}

export async function writeNewIssueFile(filePath: string, content: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'wx');
    await handle.writeFile(content, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      throw new Error(`Issue file already exists: ${filePath}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function writeNewIssueFileInVault(vaultRoot: string, relativePath: string, content: string): Promise<void> {
  const filePath = await resolveRegistryPath(vaultRoot, relativePath);
  await writeNewIssueFile(filePath, content);
}

export async function createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
  return withAuthoringLock(input.vaultRoot, input.space, () => createIssueUnlocked(input));
}

export function validateMergeIntoValue(value: string): string[] {
  const errors: string[] = [];
  if (value.trim() === '' || /[\0\r\n]/.test(value)) {
    errors.push('Invalid mergeInto');
  }
  const branch = value.trim().replace(/^origin\//, '');
  if (
    branch === '' ||
    branch.startsWith('-') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock') ||
    /[\s~^:?*[\\]/.test(branch)
  ) {
    errors.push('Invalid mergeInto');
  }
  return [...new Set(errors)];
}

async function createIssueUnlocked(input: CreateIssueInput): Promise<CreateIssueResult> {
  const normalized = validateCreateIssueInput(input);
  const registry = await loadRegistry(path.join(normalized.vaultRoot, 'registry.yaml'));
  const space = getRegistrySpace(registry, normalized.space);
  const targetRootRelative = selectIssueRoot(space, normalized);
  const targetRoot = await resolveRegistryPath(normalized.vaultRoot, targetRootRelative);
  const scan = await scanIssueIds(normalized.vaultRoot, normalized.space);
  if (scan.fatalErrors.length > 0) {
    throw new Error(`Cannot allocate issue id while scan has fatal errors: ${scan.fatalErrors.join('; ')}`);
  }
  if (scan.duplicateErrors.length > 0) {
    throw new Error(`Duplicate issue ids: ${scan.duplicateErrors.join('; ')}`);
  }

  const first = buildCreateIssueCandidate(normalized, space.idPrefix, scan.reservedIds, targetRoot);
  if (normalized.dryRun) return { ...first, created: false, warnings: scan.warnings };

  try {
    await writeNewIssueFileInVault(normalized.vaultRoot, first.relativePath, first.markdown);
    return { ...first, created: true, warnings: scan.warnings };
  } catch (error) {
    if (!isExistingIssueFileError(error)) throw error;
  }

  const retryScan = await scanIssueIds(normalized.vaultRoot, normalized.space);
  if (retryScan.fatalErrors.length > 0) {
    throw new Error(`Cannot allocate issue id while scan has fatal errors: ${retryScan.fatalErrors.join('; ')}`);
  }
  if (retryScan.duplicateErrors.length > 0) {
    throw new Error(`Duplicate issue ids: ${retryScan.duplicateErrors.join('; ')}`);
  }
  const retry = buildCreateIssueCandidate(normalized, space.idPrefix, retryScan.reservedIds, targetRoot);
  await writeNewIssueFileInVault(normalized.vaultRoot, retry.relativePath, retry.markdown);
  return { ...retry, created: true, warnings: [...scan.warnings, ...retryScan.warnings] };
}

export async function scanIssueIds(vaultRoot: string, spaceName: string): Promise<ScanIssueIdsResult> {
  const registry = await loadRegistry(path.join(vaultRoot, 'registry.yaml'));
  const space = getRegistrySpace(registry, spaceName);
  const roots = [space.epics];
  if (space.type === 'container') {
    roots.push(...Object.values(space.projects ?? {}).map(project => project.path));
  } else {
    roots.push(space.issues);
  }

  const owners = new Map<string, IssueIdOwner[]>();
  const warnings: string[] = [];
  const duplicateErrors: string[] = [];
  const fatalErrors: string[] = [];

  for (const rootPath of await dedupeScanRoots(vaultRoot, roots)) {
    const files = await listMarkdownFiles(rootPath, vaultRoot, fatalErrors);
    for (const file of files) {
      const basename = path.basename(file);
      try {
        const raw = await fs.readFile(file, 'utf8');
        const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match) {
          const fallback = filenameIssueId(basename, space.idPrefix);
          if (fallback) {
            warnings.push(`${path.relative(vaultRoot, file)}: missing frontmatter; reserved filename id`);
            addOwner(owners, fallback, file, vaultRoot, 'filename');
          } else {
            fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
          }
          continue;
        }

        const parsed = YAML.parse(match[1]);
        if (isRecord(parsed) && typeof parsed.id === 'string') {
          const idErrors = validateScannedIssueId(parsed.id, space.idPrefix);
          if (idErrors.length > 0) {
            fatalErrors.push(`${path.relative(vaultRoot, file)}: ${idErrors.join('; ')}`);
            continue;
          }
          addOwner(owners, parsed.id, file, vaultRoot, 'frontmatter');
          continue;
        }

        const fallback = filenameIssueId(basename, space.idPrefix);
        if (fallback) {
          warnings.push(`${path.relative(vaultRoot, file)}: missing frontmatter id; reserved filename id`);
          addOwner(owners, fallback, file, vaultRoot, 'filename');
        } else {
          fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
        }
      } catch (error) {
        warnings.push(`${path.relative(vaultRoot, file)}: ${error instanceof Error ? error.message : String(error)}`);
        const fallback = filenameIssueId(basename, space.idPrefix);
        if (fallback) {
          addOwner(owners, fallback, file, vaultRoot, 'filename');
        } else {
          fatalErrors.push(`${path.relative(vaultRoot, file)}: cannot determine issue id`);
        }
      }
    }
  }

  for (const [id, idOwners] of owners) {
    if (idOwners.length > 1) {
      duplicateErrors.push(`${id}: ${idOwners.map(owner => owner.relativePath).join(', ')}`);
    }
  }

  const ids = [...owners.keys()].sort();
  return { ids, reservedIds: new Set(ids), owners, warnings, duplicateErrors, fatalErrors };
}

async function dedupeScanRoots(vaultRoot: string, roots: string[]): Promise<string[]> {
  const entries = await Promise.all(roots.map(async root => {
    const rootPath = await resolveRegistryPath(vaultRoot, root);
    return { rootPath, realPath: await fs.realpath(rootPath) };
  }));
  entries.sort((a, b) => a.realPath.length - b.realPath.length);

  const selected: typeof entries = [];
  for (const entry of entries) {
    if (selected.some(parent => isInsideOrSame(entry.realPath, parent.realPath))) continue;
    selected.push(entry);
  }
  return selected.map(entry => entry.rootPath);
}

function validateCreateIssueInput(input: CreateIssueInput): CreateIssueInput {
  const title = input.title.trim();
  if (title === '') throw new Error('Title is required');
  if (input.type !== undefined && !ISSUE_TYPES.has(input.type)) throw new Error(`Invalid type: ${input.type}`);
  if (input.priority !== undefined && !PRIORITIES.has(input.priority)) throw new Error(`Invalid priority: ${input.priority}`);
  if (input.executor !== undefined && !EXECUTORS.has(input.executor)) throw new Error(`Invalid executor: ${input.executor}`);
  if (input.type === 'epic' && input.project) throw new Error('Project is not allowed for epic issues');
  if (input.epic) {
    const errors = validateIssueIdSegment(input.epic);
    if (errors.length > 0) throw new Error(`Invalid epic: ${errors.join('; ')}`);
  }
  if (input.workingDir && /[\0\r\n]/.test(input.workingDir)) throw new Error('Invalid workingDir');
  if (
    input.mergeInto !== undefined &&
    validateMergeIntoValue(input.mergeInto).length > 0
  ) {
    throw new Error('Invalid mergeInto');
  }

  return {
    ...input,
    title,
    labels: input.labels?.map(label => label.trim()).filter(Boolean),
  };
}

function selectIssueRoot(space: RegistrySpace, input: CreateIssueInput): string {
  if (input.type === 'epic') return space.epics;
  if (space.type === 'container') {
    if (!input.project) throw new Error('Project is required for container space issues');
    const project = space.projects?.[input.project];
    if (!project) throw new Error(`Unknown registry project: ${input.project}`);
    return project.path;
  }
  if (input.project) throw new Error('Project is not allowed for single space issues');
  return space.issues;
}

function buildCreateIssueCandidate(
  input: CreateIssueInput,
  idPrefix: string,
  reservedIds: Set<string>,
  targetRoot: string,
): Omit<CreateIssueResult, 'created' | 'warnings'> {
  const id = allocateNextIssueId(reservedIds, idPrefix);
  const filename = `${id}-${slugifyTitle(input.title)}.md`;
  const absolutePath = path.join(targetRoot, filename);
  const relativePath = toVaultRelativePath(input.vaultRoot, absolutePath);
  const draft = createIssueDraft({
    id,
    title: input.title,
    type: input.type,
    project: input.project ?? '',
    priority: input.priority,
    executor: input.executor,
    labels: input.labels,
    assignee: input.assignee,
    epic: input.epic,
    workingDir: input.workingDir,
    mergeInto: input.mergeInto,
    now: input.now,
  });
  return { id, relativePath, absolutePath, markdown: draft.markdown };
}

function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'issue';
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): string {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join('/');
}

function isExistingIssueFileError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Issue file already exists');
}

export async function withAuthoringLock<T>(vaultRoot: string, space: string, work: () => Promise<T>): Promise<T> {
  const lockDir = await authoringLockDir(vaultRoot, space);
  await acquireLock(lockDir);
  try {
    return await work();
  } finally {
    await fs.rm(lockDir, { recursive: true, force: true });
  }
}

async function authoringLockDir(vaultRoot: string, space: string): Promise<string> {
  const realVaultRoot = await fs.realpath(vaultRoot);
  const lockRoot = path.join(os.tmpdir(), 'kanban-task-engine-authoring-locks');
  await fs.mkdir(lockRoot, { recursive: true });
  const digest = crypto.createHash('sha256').update(`${realVaultRoot}\0${space}`).digest('hex');
  return path.join(lockRoot, digest);
}

async function acquireLock(lockDir: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await fs.mkdir(lockDir);
      return;
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
      if (Date.now() - started > 10_000) {
        throw new Error(`Timed out waiting for authoring lock: ${lockDir}`);
      }
      await sleep(25);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function listMarkdownFiles(dir: string, vaultRoot: string, fatalErrors: string[]): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) {
      fatalErrors.push(`${path.relative(vaultRoot, entryPath)}: symlink entries are not allowed in issue scan scope`);
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath, vaultRoot, fatalErrors));
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

function filenameIssueId(filename: string, idPrefix: string): string | null {
  const match = filename.match(new RegExp(`^${escapeRegExp(idPrefix)}-(\\d+)(?:-|\\.md$)`));
  return match ? `${idPrefix}-${match[1]}` : null;
}

function validateScannedIssueId(id: string, idPrefix: string): string[] {
  const errors = validateIssueIdSegment(id);
  if (!id.startsWith(`${idPrefix}-`)) errors.push(`Invalid issue id: expected prefix ${idPrefix}`);
  return errors;
}

function addOwner(
  owners: Map<string, IssueIdOwner[]>,
  id: string,
  filePath: string,
  vaultRoot: string,
  source: IssueIdOwner['source'],
): void {
  const relativePath = path.relative(vaultRoot, filePath);
  const list = owners.get(id) ?? [];
  list.push({ id, filePath, relativePath, source });
  owners.set(id, list);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
