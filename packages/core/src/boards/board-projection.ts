import fs from 'fs/promises';
import path from 'path';
import {
  getRegistrySpace,
  listRegistrySpaces,
  loadRegistry,
} from '../store/registry';
import { atomicWriteFile } from '../store/fs-utils';
import { resolveVaultPath } from '../store/vault-path';
import { listRegistryIssueRecords } from '../store/registry-issue-source';
import { renderDataviewIndexMarkdown } from './dataview-index-renderer';
import { renderObsidianBoardMarkdown, type ObsidianBoardIssue } from './obsidian-board-renderer';
import type { BoardEnrichmentProvider } from './board-enrichment';
import type { RegistrySpace } from '../store/registry';

export interface CollectBoardProjectionOptions {
  vaultRoot: string;
  space: string;
  generatedAt?: string;
  /** 선택: neurons enrichment provider (read-only, fail-soft). 미주입 시 enrichment 없는 board */
  enrichmentProvider?: BoardEnrichmentProvider;
}

export interface WriteBoardProjectionOptions extends CollectBoardProjectionOptions {}

export interface WriteBoardProjectionsOptions {
  vaultRoot: string;
  all: true;
  generatedAt?: string;
  enrichmentProvider?: BoardEnrichmentProvider;
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
  const vaultRoot = path.resolve(options.vaultRoot);
  const registry = await loadRegistry(await resolveVaultPath(vaultRoot, 'registry.yaml'));
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

  const issueRecords = await listRegistryIssueRecords({ vaultRoot, space: options.space });
  const issues = issueRecords.map(record => record.projection);
  await applyBoardEnrichment(issues, space, options.enrichmentProvider);
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
  const registry = await loadRegistry(await resolveVaultPath(vaultRoot, 'registry.yaml'));
  const spaces = listRegistrySpaces(registry);
  const projections: BoardProjection[] = [];

  for (const space of spaces) {
    projections.push(await collectBoardProjection({
      vaultRoot,
      space,
      generatedAt: options.generatedAt,
      enrichmentProvider: options.enrichmentProvider,
    }));
  }

  await writeProjectionTargets(projections);

  return projections.map(toWriteResult);
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

/**
 * board issue 들에 neurons enrichment 를 batch 주입한다 (read-only, fail-soft).
 * provider 미주입 또는 space.external.brain_id 미설정이면 no-op.
 * neurons 미가용/오류 시 throw 를 삼키고 enrichment 없는 board 로 진행 (D3 fail-soft).
 */
async function applyBoardEnrichment(
  issues: ObsidianBoardIssue[],
  space: RegistrySpace,
  provider?: BoardEnrichmentProvider,
): Promise<void> {
  const brainId = space.external?.brain_id;
  if (!provider || !brainId) return;
  const brainSlug = brainId.replace(/^\/project\//, '');
  try {
    const map = await provider.fetchForBoard({ brainSlug, issueIds: issues.map(issue => issue.id) });
    for (const issue of issues) {
      const enrichment = map.get(issue.id);
      if (enrichment) issue.enrichment = enrichment;
    }
  } catch {
    // fail-soft: enrichment 는 부가기능. neurons 미가용 시 board lifecycle 영향 0.
  }
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
