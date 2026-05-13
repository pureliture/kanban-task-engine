import type { Dirent } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import {
  validateIssueFrontmatterForRegistry,
  type IssueFrontmatter,
} from '@kanban-task-engine/schema';
import {
  getRegistrySpace,
  listRegistrySpaces,
  loadRegistry,
  type RegistrySpace,
} from '../store/registry';
import { atomicWriteFile } from '../store/fs-utils';
import { resolveVaultPath } from '../store/vault-path';
import { renderDataviewIndexMarkdown } from './dataview-index-renderer';
import {
  renderObsidianBoardMarkdown,
  type ObsidianBoardIssue,
} from './obsidian-board-renderer';

export interface CollectBoardProjectionOptions {
  vaultRoot: string;
  space: string;
  generatedAt?: string;
}

export interface WriteBoardProjectionOptions extends CollectBoardProjectionOptions {}

export interface WriteBoardProjectionsOptions {
  vaultRoot: string;
  all: true;
  generatedAt?: string;
}

export interface BoardProjection {
  space: string;
  boardPath: string;
  indexPath: string;
  boardRelativePath: string;
  indexRelativePath: string;
  issueCount: number;
  boardMarkdown: string;
  indexMarkdown: string;
}

export type BoardProjectionWriteResult = Omit<BoardProjection, 'boardMarkdown' | 'indexMarkdown'>;

export type BoardProjectionTargetKind = 'board' | 'index';

export interface BoardProjectionWriteTarget {
  space: string;
  kind: BoardProjectionTargetKind;
  path: string;
  relativePath: string;
}

export interface BoardProjectionFailedWriteTarget extends BoardProjectionWriteTarget {
  error: string;
}

export class BoardProjectionWriteError extends Error {
  override name = 'BoardProjectionWriteError';

  constructor(
    message: string,
    readonly succeeded: BoardProjectionWriteTarget[],
    readonly failed: BoardProjectionFailedWriteTarget[],
  ) {
    super(message);
  }
}

type ProjectionIssue = ObsidianBoardIssue;

const TASK_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'];
const EPIC_SECTIONS = ['목표', '범위', '성공 지표', '하위 티켓', '로그'];

export async function collectBoardProjection(options: CollectBoardProjectionOptions): Promise<BoardProjection> {
  const vaultRoot = path.resolve(options.vaultRoot);
  const registry = await loadRegistry(path.join(vaultRoot, 'registry.yaml'));
  const space = getRegistrySpace(registry, options.space);
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const boardRelativePath = space.board;
  const indexRelativePath = space.epicBoard;
  const boardPath = await resolveRegistryVaultPath(vaultRoot, boardRelativePath, `${options.space}.board`);
  const indexPath = await resolveRegistryVaultPath(vaultRoot, indexRelativePath, `${options.space}.epicBoard`);
  const issueRoot = space.issues;
  const epicRoot = space.epics;

  await resolveRegistryVaultPath(vaultRoot, issueRoot, `${options.space}.issues`);
  await resolveRegistryVaultPath(vaultRoot, epicRoot, `${options.space}.epics`);

  const issueRoots = issueRootRelatives(space);
  for (const [index, root] of issueRoots.entries()) {
    await resolveRegistryVaultPath(vaultRoot, root, `${options.space}.issueRoots[${index}]`);
  }

  const issues = await collectIssues(vaultRoot, space, [...issueRoots, epicRoot]);
  const boardMarkdown = renderObsidianBoardMarkdown({
    space: options.space,
    generatedAt,
    issues,
  });
  const indexMarkdown = renderDataviewIndexMarkdown({
    space: options.space,
    generatedAt,
    issueRoot,
    epicRoot,
  });

  validateRenderedProjection(boardMarkdown, indexMarkdown);

  return {
    space: options.space,
    boardPath,
    indexPath,
    boardRelativePath,
    indexRelativePath,
    issueCount: issues.filter(issue => issue.type !== 'epic').length,
    boardMarkdown,
    indexMarkdown,
  };
}

export async function writeBoardProjection(options: WriteBoardProjectionOptions): Promise<BoardProjectionWriteResult> {
  const projection = await collectBoardProjection(options);
  await writeProjectionTargets([projection]);
  return toWriteResult(projection);
}

export async function writeBoardProjections(options: WriteBoardProjectionsOptions): Promise<BoardProjectionWriteResult[]> {
  const vaultRoot = path.resolve(options.vaultRoot);
  const registry = await loadRegistry(path.join(vaultRoot, 'registry.yaml'));
  const spaces = listRegistrySpaces(registry);
  const projections: BoardProjection[] = [];

  for (const space of spaces) {
    projections.push(await collectBoardProjection({
      vaultRoot,
      space,
      generatedAt: options.generatedAt,
    }));
  }

  await writeProjectionTargets(projections);

  return projections.map(toWriteResult);
}

function issueRootRelatives(space: RegistrySpace): string[] {
  if (space.type === 'container') {
    const projectRoots = Object.values(space.projects ?? {}).map(project => project.path);
    return projectRoots.length > 0 ? projectRoots : [space.issues];
  }
  return [space.issues];
}

async function collectIssues(vaultRoot: string, space: RegistrySpace, relativeRoots: string[]): Promise<ProjectionIssue[]> {
  const files = await listIssueFiles(vaultRoot, relativeRoots);
  const issues: ProjectionIssue[] = [];

  for (const filePath of files) {
    const markdown = await fs.readFile(filePath, 'utf8');
    const relativePath = toVaultRelativePath(vaultRoot, filePath);
    const frontmatter = parseIssueForRegistry(markdown, space, relativePath);
    issues.push({
      id: frontmatter.id,
      title: frontmatter.title,
      type: frontmatter.type,
      status: frontmatter.status,
      priority: frontmatter.priority,
      project: frontmatter.project,
      epic: frontmatter.epic,
      updated: frontmatter.updated,
      relativePath,
    });
  }

  return issues.sort((a, b) => a.id.localeCompare(b.id));
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

function parseIssueForRegistry(markdown: string, space: RegistrySpace, relativePath: string): IssueFrontmatter {
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
  const sections = extractSections(normalized.slice(frontmatterMatch[0].length));
  const issueType = isRecord(frontmatter) ? String(frontmatter.type ?? '') : '';
  const requiredSections = issueType === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS;

  for (const section of requiredSections) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) throw new Error(`Invalid issue markdown in ${relativePath}: ${errors.join('; ')}`);
  if (!result.ok) throw new Error(`Invalid issue markdown in ${relativePath}: ${result.errors.join('; ')}`);
  return result.value;
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

async function writeProjectionTargets(projections: BoardProjection[]): Promise<void> {
  const succeeded: BoardProjectionWriteTarget[] = [];
  for (const projection of projections) {
    for (const target of projectionWriteTargets(projection)) {
      try {
        await fs.mkdir(path.dirname(target.path), { recursive: true });
        await atomicWriteFile(target.path, target.content);
        succeeded.push(toPublicTarget(target));
      } catch (error) {
        throw new BoardProjectionWriteError(
          'board projection write failed',
          succeeded,
          [{ ...toPublicTarget(target), error: error instanceof Error ? error.message : String(error) }],
        );
      }
    }
  }
}

function projectionWriteTargets(projection: BoardProjection): Array<BoardProjectionWriteTarget & { content: string }> {
  return [
    {
      space: projection.space,
      kind: 'board',
      path: projection.boardPath,
      relativePath: projection.boardRelativePath,
      content: projection.boardMarkdown,
    },
    {
      space: projection.space,
      kind: 'index',
      path: projection.indexPath,
      relativePath: projection.indexRelativePath,
      content: projection.indexMarkdown,
    },
  ];
}

function toPublicTarget(
  target: BoardProjectionWriteTarget & { content: string },
): BoardProjectionWriteTarget {
  const { content: _content, ...publicTarget } = target;
  return publicTarget;
}

function toWriteResult(projection: BoardProjection): BoardProjectionWriteResult {
  const { boardMarkdown: _boardMarkdown, indexMarkdown: _indexMarkdown, ...result } = projection;
  return result;
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

function validateRenderedProjection(boardMarkdown: string, indexMarkdown: string): void {
  if (!boardMarkdown.includes('kanban-plugin: board')) {
    throw new Error('Rendered board projection is missing kanban-plugin frontmatter');
  }
  if (indexMarkdown.includes('kanban-plugin: board') || indexMarkdown.includes('%% kanban:settings')) {
    throw new Error('Rendered Dataview index must be plain Markdown');
  }
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
