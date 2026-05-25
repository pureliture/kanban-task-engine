import path from 'node:path';
import type { CreateIssueInput } from '../authoring';
import { createIssueDraft, withAuthoringLock } from '../authoring';
import type { VaultPort } from '../ports/vault-port';
import { getRegistrySpace, type RegistrySpace } from '../store/registry';
import { allocateNextIssueId } from '../store/sequence';
import { assertMatchingVaultRoot, writeObsidianBoardForSpace } from './obsidian-board-sync';
import { listVaultRegistryIssueRecords, loadVaultRegistry } from '../store/vault-record-loader';

const PRIORITIES = new Set<string>(['P0', 'P1', 'P2', 'P3']);
const EXECUTORS = new Set<string>(['human', 'codex', 'claude-code']);

export interface CreateObsidianTaskInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  project?: string;
  title: string;
  priority?: CreateIssueInput['priority'];
  executor?: CreateIssueInput['executor'];
  now?: Date;
  syncBoard?: boolean;
}

export interface CreateObsidianTaskResult {
  issueId: string;
  issuePath: string;
  boardPath?: string;
  warnings: string[];
}

export interface PreviewNextObsidianIssueIdInput {
  vault: VaultPort;
  space: string;
  title?: string;
}

export interface PreviewNextObsidianIssueIdResult {
  issueId: string;
  duplicateTitleWarnings: string[];
}

export interface ObsidianTaskBoardSyncErrorInput {
  issueId: string;
  issuePath: string;
  warnings: string[];
  cause: unknown;
}

export class ObsidianTaskBoardSyncError extends Error {
  override name = 'ObsidianTaskBoardSyncError';
  override cause: unknown;
  readonly issueId: string;
  readonly issuePath: string;
  readonly warnings: string[];

  constructor(input: ObsidianTaskBoardSyncErrorInput) {
    super(`Board sync failed after creating issue ${input.issueId}: ${formatCause(input.cause)}`);
    this.issueId = input.issueId;
    this.issuePath = input.issuePath;
    this.warnings = input.warnings;
    this.cause = input.cause;
  }
}

export async function createObsidianTask(input: CreateObsidianTaskInput): Promise<CreateObsidianTaskResult> {
  await assertMatchingVaultRoot({
    vault: input.vault,
    vaultRoot: input.vaultRoot,
  });

  const created = await createIssueThroughVaultPort(input);

  let boardPath: string | undefined;
  if (input.syncBoard ?? true) {
    try {
      const synced = await writeObsidianBoardForSpace({
        vault: input.vault,
        vaultRoot: input.vaultRoot,
        space: input.space,
        generatedAt: input.now?.toISOString(),
      });
      boardPath = synced.boardPath;
    } catch (error) {
      throw new ObsidianTaskBoardSyncError({
        issueId: created.id,
        issuePath: created.relativePath,
        warnings: created.warnings,
        cause: error,
      });
    }
  }

  return {
    issueId: created.id,
    issuePath: created.relativePath,
    boardPath,
    warnings: created.warnings,
  };
}

export async function previewNextObsidianIssueId(
  input: PreviewNextObsidianIssueIdInput,
): Promise<PreviewNextObsidianIssueIdResult> {
  const registry = await loadVaultRegistry(input.vault);
  const space = getRegistrySpace(registry, input.space);
  const records = await listVaultRegistryIssueRecords({
    vault: input.vault,
    space: input.space,
  });
  const duplicateErrors = duplicateIssueIdErrors(records);
  if (duplicateErrors.length > 0) {
    throw new Error(`Duplicate issue ids: ${duplicateErrors.join('; ')}`);
  }

  const normalizedTitle = normalizeComparableTitle(input.title ?? '');
  const duplicateTitleWarnings = normalizedTitle === ''
    ? []
    : records
      .filter(record => normalizeComparableTitle(record.frontmatter.title) === normalizedTitle)
      .map(record => `Similar canonical issue title: ${record.id} ${record.relativePath}`);

  return {
    issueId: allocateNextIssueId(new Set(records.map(record => record.id)), space.idPrefix),
    duplicateTitleWarnings,
  };
}

async function createIssueThroughVaultPort(input: CreateObsidianTaskInput) {
  const title = input.title.trim();
  if (title === '') throw new Error('Title is required');
  validateAuthoringOption('priority', input.priority, PRIORITIES);
  validateAuthoringOption('executor', input.executor, EXECUTORS);

  return withAuthoringLock(input.vault.root, input.space, async () => {
    const registry = await loadVaultRegistry(input.vault);
    const space = getRegistrySpace(registry, input.space);
    const targetRootRelative = selectIssueRoot(space, input);
    const records = await listVaultRegistryIssueRecords({
      vault: input.vault,
      space: input.space,
    });
    const duplicateErrors = duplicateIssueIdErrors(records);
    if (duplicateErrors.length > 0) {
      throw new Error(`Duplicate issue ids: ${duplicateErrors.join('; ')}`);
    }
    const id = allocateNextIssueId(new Set(records.map(record => record.id)), space.idPrefix);
    const relativePath = `${targetRootRelative}/${id}-${slugifyTitle(title)}.md`;
    if (await input.vault.exists(relativePath)) {
      throw new Error(`Issue file already exists: ${relativePath}`);
    }

    const draft = createIssueDraft({
      id,
      title,
      project: input.project ?? '',
      priority: input.priority,
      executor: input.executor,
      now: input.now,
    });
    await input.vault.create(relativePath, draft.markdown);

    return {
      id,
      relativePath,
      absolutePath: path.resolve(input.vault.root, relativePath),
      markdown: draft.markdown,
      created: true,
      warnings: [],
    };
  });
}

function duplicateIssueIdErrors(records: Array<{ id: string; relativePath: string }>): string[] {
  const byId = new Map<string, string[]>();
  for (const record of records) {
    const paths = byId.get(record.id) ?? [];
    paths.push(record.relativePath);
    byId.set(record.id, paths);
  }
  return [...byId.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => `${id}: ${paths.join(', ')}`)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeComparableTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateAuthoringOption(
  field: 'priority' | 'executor',
  value: string | undefined,
  allowed: Set<string>,
): void {
  if (value !== undefined && !allowed.has(value)) throw new Error(`Invalid ${field}: ${value}`);
}

function selectIssueRoot(space: RegistrySpace, input: CreateObsidianTaskInput): string {
  if (space.type === 'container') {
    if (!input.project) throw new Error('Project is required for container space issues');
    const project = space.projects?.[input.project];
    if (!project) throw new Error(`Unknown registry project: ${input.project}`);
    return project.path;
  }
  if (input.project) throw new Error('Project is not allowed for single space issues');
  return space.issues;
}

function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.normalize('NFC') || 'issue';
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
