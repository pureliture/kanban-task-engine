import path from 'node:path';
import YAML from 'yaml';
import {
  validateIssueFrontmatterForRegistry,
  type IssueFrontmatter,
} from '@kanban-task-engine/schema';
import { renderDataviewIndexMarkdown } from '../boards/dataview-index-renderer';
import type { BoardProjection } from '../boards/board-projection';
import { renderObsidianBoardMarkdown } from '../boards/obsidian-board-renderer';
import type { VaultPort } from '../ports/vault-port';
import {
  getRegistrySpace,
  listRegistrySpaces,
  parseRegistryYaml,
  type RegistrySpace,
  type VaultRegistry,
} from '../store/registry';
import type { RegistryIssueRecord } from '../store/registry-issue-source';

export interface ListVaultRegistryIssueRecordsInput {
  vault: VaultPort;
  space?: string;
}

export interface CollectVaultBoardProjectionInput {
  vault: VaultPort;
  space: string;
  generatedAt?: string;
}

const TASK_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'];
const EPIC_SECTIONS = ['목표', '범위', '성공 지표', '하위 티켓', '로그'];

export async function loadVaultRegistry(vault: VaultPort): Promise<VaultRegistry> {
  return parseRegistryYaml(await vault.read('registry.yaml'));
}

export async function listVaultRegistryIssueRecords(
  input: ListVaultRegistryIssueRecordsInput,
): Promise<RegistryIssueRecord[]> {
  const registry = await loadVaultRegistry(input.vault);
  const spaceNames = input.space ? [input.space] : listRegistrySpaces(registry);
  const records: RegistryIssueRecord[] = [];

  for (const spaceName of spaceNames) {
    const space = getRegistrySpace(registry, spaceName);
    for (const relativePath of await listIssueFiles(input.vault, [...issueRootRelatives(space), space.epics])) {
      const markdown = await input.vault.read(relativePath);
      records.push(parseVaultIssueRecord({
        markdown,
        relativePath,
        space,
        spaceName,
        vaultRoot: input.vault.root,
      }));
    }
  }

  return records.sort((a, b) => a.id.localeCompare(b.id) || a.relativePath.localeCompare(b.relativePath));
}

export async function collectVaultBoardProjection(
  input: CollectVaultBoardProjectionInput,
): Promise<BoardProjection> {
  const registry = await loadVaultRegistry(input.vault);
  const space = getRegistrySpace(registry, input.space);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const issueRecords = await listVaultRegistryIssueRecords({
    vault: input.vault,
    space: input.space,
  });
  const issues = issueRecords.map(record => record.projection);
  const boardMarkdown = renderObsidianBoardMarkdown({
    space: input.space,
    generatedAt,
    issues,
  });
  const indexMarkdown = renderDataviewIndexMarkdown({
    space: input.space,
    generatedAt,
    issueRoot: space.issues,
    epicRoot: space.epics,
  });

  validateRenderedProjection(boardMarkdown, indexMarkdown);

  return {
    space: input.space,
    boardPath: path.resolve(input.vault.root, space.board),
    indexPath: path.resolve(input.vault.root, space.epicBoard),
    boardRelativePath: space.board,
    indexRelativePath: space.epicBoard,
    issueCount: issues.filter(issue => issue.type !== 'epic').length,
    boardMarkdown,
    indexMarkdown,
  };
}

export function parseVaultIssueRecord(input: {
  markdown: string;
  relativePath: string;
  space: RegistrySpace;
  spaceName: string;
  vaultRoot: string;
}): RegistryIssueRecord {
  const { frontmatter, body } = parseIssueForRegistry(input.markdown, input.space, input.relativePath);
  return {
    id: frontmatter.id,
    status: frontmatter.status,
    space: input.spaceName,
    absolutePath: path.resolve(input.vaultRoot, input.relativePath),
    relativePath: input.relativePath,
    markdown: input.markdown,
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
      relativePath: input.relativePath,
    },
  };
}

function issueRootRelatives(space: RegistrySpace): string[] {
  if (space.type === 'container') {
    const projectRoots = Object.values(space.projects ?? {}).map(project => project.path);
    return projectRoots.length > 0 ? projectRoots : [space.issues];
  }
  return [space.issues];
}

async function listIssueFiles(vault: VaultPort, roots: string[]): Promise<string[]> {
  const files = new Set<string>();
  for (const root of roots) {
    let markdownFiles: string[];
    try {
      markdownFiles = await vault.listMarkdownFiles(root);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const file of markdownFiles) {
      files.add(file);
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
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
  if (!result.ok) errors.push(...result.errors);

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

function validateRenderedProjection(boardMarkdown: string, indexMarkdown: string): void {
  if (!boardMarkdown.includes('kanban-plugin: board')) {
    throw new Error('Rendered board projection is missing kanban-plugin frontmatter');
  }
  if (indexMarkdown.includes('kanban-plugin: board') || indexMarkdown.includes('%% kanban:settings')) {
    throw new Error('Rendered Dataview index must be plain Markdown');
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
