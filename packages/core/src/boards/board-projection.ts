import fs from 'node:fs/promises';
import path from 'node:path';
import { getRegistrySpace, listRegistrySpaces } from '../store/registry';
import { assertVaultRelativePath, type VaultPort } from '../ports/vault-port';
import { NodeFsVaultPort } from '../ports/node-fs-vault-port';
import {
  listVaultRegistryIssueRecords,
  loadVaultRegistry,
} from '../store/vault-record-loader';
import { renderDataviewIndexMarkdown } from './dataview-index-renderer';
import { renderObsidianBoardMarkdown } from './obsidian-board-renderer';

export interface CollectBoardProjectionOptions {
  vault?: VaultPort;
  vaultRoot: string;
  space: string;
  generatedAt?: string;
}

export interface WriteBoardProjectionOptions extends CollectBoardProjectionOptions {}

export interface WriteBoardProjectionsOptions {
  vault?: VaultPort;
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

export async function collectBoardProjection(options: CollectBoardProjectionOptions): Promise<BoardProjection> {
  const vault = options.vault ?? new NodeFsVaultPort(options.vaultRoot);
  const registry = await loadVaultRegistry(vault);
  const space = getRegistrySpace(registry, options.space);
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const boardRelativePath = space.board;
  const indexRelativePath = space.epicBoard;
  const issueRoot = space.issues;
  const epicRoot = space.epics;

  // Lexical safety checks
  assertVaultRelativePath(boardRelativePath);
  assertVaultRelativePath(indexRelativePath);
  assertVaultRelativePath(issueRoot);
  assertVaultRelativePath(epicRoot);
  if (space.type === 'container') {
    for (const project of Object.values(space.projects ?? {})) {
      assertVaultRelativePath(project.path);
    }
  }

  // Symlink containment checks
  await assertVaultPathInsideRoot(vault, boardRelativePath);
  await assertVaultPathInsideRoot(vault, indexRelativePath);

  const boardPath = path.resolve(vault.root, boardRelativePath);
  const indexPath = path.resolve(vault.root, indexRelativePath);

  const issueRecords = await listVaultRegistryIssueRecords({ vault, space: options.space });
  const issues = issueRecords.map(record => record.projection);
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
  const vault = options.vault ?? new NodeFsVaultPort(options.vaultRoot);
  const projection = await collectBoardProjection({ ...options, vault });
  await writeProjectionTargets(vault, [projection]);
  return toWriteResult(projection);
}

export async function writeBoardProjections(options: WriteBoardProjectionsOptions): Promise<BoardProjectionWriteResult[]> {
  const vault = options.vault ?? new NodeFsVaultPort(options.vaultRoot);
  const registry = await loadVaultRegistry(vault);
  const spaces = listRegistrySpaces(registry);
  const projections: BoardProjection[] = [];

  for (const space of spaces) {
    projections.push(await collectBoardProjection({
      vault,
      vaultRoot: options.vaultRoot,
      space,
      generatedAt: options.generatedAt,
    }));
  }

  await writeProjectionTargets(vault, projections);

  return projections.map(toWriteResult);
}

async function writeProjectionTargets(vault: VaultPort, projections: BoardProjection[]): Promise<void> {
  const succeeded: BoardProjectionWriteTarget[] = [];
  for (const projection of projections) {
    for (const target of projectionWriteTargets(projection)) {
      try {
        if (await vault.exists(target.relativePath)) {
          await vault.process(target.relativePath, () => target.content);
        } else {
          await vault.create(target.relativePath, target.content);
        }
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

function validateRenderedProjection(boardMarkdown: string, indexMarkdown: string): void {
  if (!boardMarkdown.includes('kanban-plugin: board')) {
    throw new Error('Rendered board projection is missing kanban-plugin frontmatter');
  }
  if (indexMarkdown.includes('kanban-plugin: board') || indexMarkdown.includes('%% kanban:settings')) {
    throw new Error('Rendered Dataview index must be plain Markdown');
  }
}

async function assertVaultPathInsideRoot(vault: VaultPort, relativePath: string): Promise<void> {
  assertVaultRelativePath(relativePath);
  const absolutePath = path.resolve(vault.root, relativePath);
  let realRoot: string;
  let realPath: string;
  try {
    realRoot = await fs.realpath(vault.root);
  } catch {
    realRoot = vault.root;
  }
  try {
    realPath = await fs.realpath(absolutePath);
  } catch {
    const nearest = await nearestExistingPath(absolutePath);
    try {
      realPath = await fs.realpath(nearest);
    } catch {
      realPath = absolutePath;
    }
  }

  if (!isInsideOrSame(realPath, realRoot)) {
    throw new Error(`Vault path escapes root: ${relativePath}`);
  }
}

async function nearestExistingPath(absolutePath: string): Promise<string> {
  let current = absolutePath;
  for (;;) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      current = parent;
    }
  }
}

function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
