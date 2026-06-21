import fs from 'node:fs/promises';
import path from 'node:path';
import { getRegistrySpace, listRegistrySpaces, type RegistrySpace } from '../store/registry';
import { assertVaultRelativePath, type VaultPort } from '../ports/vault-port';
import { assertVaultPathInsideRoot } from '../ports/vault-path-security';
import { NodeFsVaultPort } from '../ports/node-fs-vault-port';
import {
  listVaultRegistryIssueRecords,
  loadVaultRegistry,
} from '../store/vault-record-loader';
import { renderDataviewIndexMarkdown } from './dataview-index-renderer';
import { renderObsidianBoardMarkdown, type ObsidianBoardIssue } from './obsidian-board-renderer';
import type { BoardEnrichmentProvider } from './board-enrichment';

export interface CollectBoardProjectionOptions {
  vault?: VaultPort;
  vaultRoot: string;
  space: string;
  generatedAt?: string;
  /** 선택: neurons enrichment provider (read-only, fail-soft). 미주입 시 enrichment 없는 board */
  enrichmentProvider?: BoardEnrichmentProvider;
}

export interface WriteBoardProjectionOptions extends CollectBoardProjectionOptions {}

export interface WriteBoardProjectionsOptions {
  vault?: VaultPort;
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
  await assertVaultPathInsideRoot(vault.root, boardRelativePath);
  await assertVaultPathInsideRoot(vault.root, indexRelativePath);

  const boardPath = path.resolve(vault.root, boardRelativePath);
  const indexPath = path.resolve(vault.root, indexRelativePath);

  const issueRecords = await listVaultRegistryIssueRecords({ vault, space: options.space });
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
      enrichmentProvider: options.enrichmentProvider,
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

function validateRenderedProjection(boardMarkdown: string, indexMarkdown: string): void {
  if (!boardMarkdown.includes('kanban-plugin: board')) {
    throw new Error('Rendered board projection is missing kanban-plugin frontmatter');
  }
  if (indexMarkdown.includes('kanban-plugin: board') || indexMarkdown.includes('%% kanban:settings')) {
    throw new Error('Rendered Dataview index must be plain Markdown');
  }
}
