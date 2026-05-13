import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import {
  isIssueStatus,
  validateIssueFrontmatterForRegistry,
  type IssueStatus,
  type IssueType,
  type Priority,
} from '@kanban-task-engine/schema';
import { atomicWriteFile } from '../store/fs-utils';
import { loadRegistry, getRegistrySpace, type VaultRegistry, type RegistrySpace } from '../store/registry';
import { allocateNextIssueId } from '../store/sequence';
import {
  normalizeExecutionReadiness,
  type IssueExecutor,
} from './issue-factory';
import {
  resolveRegistryPath,
  scanIssueIds,
  validateMergeIntoValue,
  withAuthoringLock,
  writeNewIssueFileInVault,
} from './issue-writer';

export interface NormalizeIssueInput {
  vaultRoot: string;
  sourcePath: string;
  space?: string;
  project?: string;
  write: boolean;
  now?: Date;
}

export interface NormalizeIssueResult {
  id: string;
  sourcePath: string;
  targetPath: string;
  markdown: string;
  wrote: boolean;
  inPlace: boolean;
  warnings: string[];
  hasPlaceholders: boolean;
  executionReady: boolean;
}

interface ParsedRoughNote {
  frontmatter: Record<string, unknown>;
  body: string;
  rawFrontmatterHasId: boolean;
}

interface RegistryRootMatch {
  spaceName: string;
  space: RegistrySpace;
  rootKind: 'issue' | 'epic';
  project?: string;
  rootPath: string;
  realRoot: string;
}

const ISSUE_TYPES = new Set<IssueType>(['epic', 'task', 'bug', 'chore', 'docs']);
const PRIORITIES = new Set<Priority>(['P0', 'P1', 'P2', 'P3']);
const EXECUTORS = new Set<IssueExecutor>(['human', 'codex', 'claude-code']);
const TASK_SECTIONS = ['목적', '컨텍스트', 'Acceptance Criteria', '실행 힌트', '로그'];
const EPIC_SECTIONS = ['목표', '범위', '성공 지표', '하위 티켓', '로그'];
const PLACEHOLDER = '<!-- kanban:placeholder reason="missing-section-content" -->\n- 작성 필요';

export async function normalizeIssue(input: NormalizeIssueInput): Promise<NormalizeIssueResult> {
  const vaultRoot = path.resolve(input.vaultRoot);
  if (!input.write) return prepareAndNormalizeIssue(input, vaultRoot);

  const sourcePath = await resolveSourcePath(vaultRoot, input.sourcePath);
  const registry = await loadRegistry(await resolveRegistryPath(vaultRoot, 'registry.yaml'));
  const preliminaryMatch = selectMostSpecificMatch(await classifySource(vaultRoot, registry, sourcePath));
  if (input.space && preliminaryMatch && input.space !== preliminaryMatch.spaceName) {
    throw new Error('Space does not match source registry root');
  }
  const lockSpace = preliminaryMatch?.spaceName ?? input.space;
  if (!lockSpace) throw new Error('Space is required for canonical target');
  return withAuthoringLock(vaultRoot, lockSpace, () => prepareAndNormalizeIssue(input, vaultRoot));
}

async function prepareAndNormalizeIssue(input: NormalizeIssueInput, vaultRoot: string): Promise<NormalizeIssueResult> {
  const sourcePath = await resolveSourcePath(vaultRoot, input.sourcePath);
  const registry = await loadRegistry(await resolveRegistryPath(vaultRoot, 'registry.yaml'));
  const raw = await fs.readFile(sourcePath, 'utf8');
  const parsed = parseRoughNote(raw);
  const matches = await classifySource(vaultRoot, registry, sourcePath);
  const match = selectMostSpecificMatch(matches);
  if (matches.length > 1) throw new Error('Source path matches multiple registry roots');

  return normalizeIssuePrepared({
    input,
    vaultRoot,
    sourcePath,
    registry,
    match,
    parsed,
  });
}

async function normalizeIssuePrepared(args: {
  input: NormalizeIssueInput;
  vaultRoot: string;
  sourcePath: string;
  registry: VaultRegistry;
  match?: RegistryRootMatch;
  parsed: ParsedRoughNote;
}): Promise<NormalizeIssueResult> {
  const normalized = await buildNormalizedIssue({
    input: args.input,
    vaultRoot: args.vaultRoot,
    sourcePath: args.sourcePath,
    registry: args.registry,
    match: args.match,
    parsed: args.parsed,
  });

  if (!args.input.write) {
    return { ...normalized, wrote: false };
  }

  const scanSpace = normalized.spaceName;
  const scan = await scanIssueIds(args.vaultRoot, scanSpace);
  appendWarnings(normalized.warnings, scan.warnings);
  if (scan.fatalErrors.length > 0) {
    throw new Error(`Cannot allocate issue id while scan has fatal errors: ${scan.fatalErrors.join('; ')}`);
  }
  if (scan.duplicateErrors.length > 0) {
    throw new Error(`Duplicate issue ids: ${scan.duplicateErrors.join('; ')}`);
  }

  if (normalized.inPlace) {
    const owners = scan.owners.get(normalized.id) ?? [];
    const owner = owners[0];
    const ownerPath = owners.length === 1 ? await fs.realpath(owners[0].filePath) : undefined;
    const sourcePath = await fs.realpath(args.sourcePath);
    if (owners.length !== 1 || ownerPath !== sourcePath || owner.source !== 'frontmatter') {
      throw new Error('Duplicate issue ids');
    }
    await atomicWriteFile(owner.filePath, normalized.markdown);
    return { ...normalized, sourcePath: owner.filePath, targetPath: owner.filePath, wrote: true };
  }

  await writeNewIssueFileInVault(args.vaultRoot, toVaultRelativePath(args.vaultRoot, normalized.targetPath), normalized.markdown);
  return { ...normalized, wrote: true };
}

async function buildNormalizedIssue(args: {
  input: NormalizeIssueInput;
  vaultRoot: string;
  sourcePath: string;
  registry: VaultRegistry;
  match?: RegistryRootMatch;
  parsed: ParsedRoughNote;
}): Promise<Omit<NormalizeIssueResult, 'wrote'> & { spaceName: string }> {
  const warnings: string[] = [];
  const frontmatter = args.parsed.frontmatter;
  const title = normalizeString(frontmatter.title) ?? headingTitle(args.parsed.body) ?? titleFromFilename(args.sourcePath);
  const type = normalizeType(frontmatter.type, warnings);
  const priority = normalizePriority(frontmatter.priority, warnings);
  const executor = normalizeExecutor(frontmatter.executor);
  const sections = extractSections(args.parsed.body);
  const bodyWithoutTitle = stripTopHeading(args.parsed.body).trim();

  if (args.match && args.parsed.rawFrontmatterHasId) {
    return buildInPlaceIssue({
      ...args,
      match: args.match,
      warnings,
      title,
      type,
      priority,
      executor,
      sections,
      bodyWithoutTitle,
    });
  }

  return buildCanonicalIssue({
    ...args,
    warnings,
    title,
    type,
    priority,
    executor,
    sections,
    bodyWithoutTitle,
  });
}

async function buildInPlaceIssue(args: {
  input: NormalizeIssueInput;
  vaultRoot: string;
  sourcePath: string;
  registry: VaultRegistry;
  match: RegistryRootMatch;
  parsed: ParsedRoughNote;
  warnings: string[];
  title: string;
  type: IssueType;
  priority: Priority;
  executor: IssueExecutor;
  sections: Record<string, string>;
  bodyWithoutTitle: string;
}): Promise<Omit<NormalizeIssueResult, 'wrote'> & { spaceName: string }> {
  const id = String(args.parsed.frontmatter.id);
  if (!id.startsWith(`${args.match.space.idPrefix}-`)) {
    throw new Error('Issue id prefix does not match registry space');
  }
  if (args.match.rootKind === 'issue') {
    if (args.type === 'epic') throw new Error('Epic frontmatter does not match registry root');
    const expectedProject = args.match.project ?? '';
    if (String(args.parsed.frontmatter.project ?? '') !== expectedProject) {
      throw new Error('Project does not match registry root');
    }
  }
  if (args.match.rootKind === 'epic') {
    if (args.type !== 'epic' || args.executor !== 'human' || String(args.parsed.frontmatter.project ?? '') !== '') {
      throw new Error('Epic frontmatter does not match registry root');
    }
  }

  const markdown = buildFormalMarkdown({
    id,
    title: args.title,
    type: args.type,
    priority: args.priority,
    executor: args.executor,
    project: args.match.rootKind === 'epic' ? '' : args.match.project ?? '',
    created: normalizeString(args.parsed.frontmatter.created) ?? nowIso(args.input.now),
    updated: nowIso(args.input.now),
    rawFrontmatter: args.parsed.frontmatter,
    sections: args.sections,
    bodyWithoutTitle: args.bodyWithoutTitle,
    warnings: args.warnings,
    space: args.match.space,
  });
  const final = finalizeMarkdown(markdown, args.match.space, args.warnings);
  return {
    id,
    sourcePath: args.sourcePath,
    targetPath: args.sourcePath,
    markdown: final.markdown,
    inPlace: true,
    warnings: final.warnings,
    hasPlaceholders: final.hasPlaceholders,
    executionReady: final.executionReady,
    spaceName: args.match.spaceName,
  };
}

async function buildCanonicalIssue(args: {
  input: NormalizeIssueInput;
  vaultRoot: string;
  sourcePath: string;
  registry: VaultRegistry;
  match?: RegistryRootMatch;
  parsed: ParsedRoughNote;
  warnings: string[];
  title: string;
  type: IssueType;
  priority: Priority;
  executor: IssueExecutor;
  sections: Record<string, string>;
  bodyWithoutTitle: string;
}): Promise<Omit<NormalizeIssueResult, 'wrote'> & { spaceName: string }> {
  if (!args.input.space) throw new Error('Space is required for canonical target');
  const space = getRegistrySpace(args.registry, args.input.space);
  if (args.type === 'epic' && args.input.project) throw new Error('Project is not allowed for epic issues');
  const project = args.type === 'epic' ? '' : args.input.project;
  if (space.type === 'container' && args.type !== 'epic' && !project) {
    throw new Error('Project is required for canonical target');
  }
  if (space.type === 'container' && project && !space.projects?.[project]) {
    throw new Error(`Unknown registry project: ${project}`);
  }

  const scan = await scanIssueIds(args.vaultRoot, args.input.space);
  appendWarnings(args.warnings, scan.warnings);
  if (args.input.write && scan.fatalErrors.length > 0) {
    throw new Error(`Cannot allocate issue id while scan has fatal errors: ${scan.fatalErrors.join('; ')}`);
  }
  if (args.input.write && scan.duplicateErrors.length > 0) {
    throw new Error(`Duplicate issue ids: ${scan.duplicateErrors.join('; ')}`);
  }

  const rawId = normalizeString(args.parsed.frontmatter.id);
  if (args.input.write && rawId) {
    const owners = scan.owners.get(rawId) ?? [];
    if (owners.length > 0) {
      throw new Error(`Duplicate issue ids: ${rawId}: ${owners.map(owner => owner.relativePath).join(', ')}`);
    }
  }
  const id = rawId ?? allocateNextIssueId(scan.reservedIds, space.idPrefix);
  const root = args.type === 'epic'
    ? space.epics
    : space.type === 'container'
      ? space.projects?.[project ?? '']?.path
      : space.issues;
  if (!root) throw new Error('Cannot resolve canonical target root');
  const relativePath = `${root}/${id}-${slugifyTitle(args.title)}.md`;
  const targetPath = await resolveRegistryPath(args.vaultRoot, relativePath);
  const markdown = buildFormalMarkdown({
    id,
    title: args.title,
    type: args.type,
    priority: args.priority,
    executor: args.type === 'epic' ? 'human' : args.executor,
    project: args.type === 'epic' ? '' : project ?? '',
    created: normalizeString(args.parsed.frontmatter.created) ?? nowIso(args.input.now),
    updated: nowIso(args.input.now),
    rawFrontmatter: args.parsed.frontmatter,
    sections: args.sections,
    bodyWithoutTitle: args.bodyWithoutTitle,
    warnings: args.warnings,
    space,
  });
  const final = finalizeMarkdown(markdown, space, args.warnings);
  return {
    id,
    sourcePath: args.sourcePath,
    targetPath,
    markdown: final.markdown,
    inPlace: false,
    warnings: final.warnings,
    hasPlaceholders: final.hasPlaceholders,
    executionReady: final.executionReady,
    spaceName: args.input.space,
  };
}

function buildFormalMarkdown(input: {
  id: string;
  title: string;
  type: IssueType;
  priority: Priority;
  executor: IssueExecutor;
  project: string;
  created: string;
  updated: string;
  rawFrontmatter: Record<string, unknown>;
  sections: Record<string, string>;
  bodyWithoutTitle: string;
  warnings: string[];
  space: RegistrySpace;
}): string {
  validateExecutionMetadata(input.rawFrontmatter);
  const sectionNames = input.type === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS;
  const renderedSections = renderSections(sectionNames, input.sections, input.bodyWithoutTitle, input.warnings);
  const hasPlaceholders = renderedSections.includes('kanban:placeholder');
  const requestedStatus = normalizeStatus(input.rawFrontmatter.status, input.warnings);
  const readiness = normalizeExecutionReadiness({
    status: requestedStatus,
    type: input.type,
    executor: input.executor,
    hasPlaceholders,
  });
  input.warnings.push(...readiness.warnings);
  const frontmatter: Record<string, unknown> = {
    ...input.rawFrontmatter,
    id: input.id,
    title: input.title,
    type: input.type,
    status: readiness.status,
    priority: input.priority,
    executor: input.type === 'epic' ? 'human' : input.executor,
    project: input.type === 'epic' ? '' : input.project,
    created: input.created,
    updated: input.updated,
    assignee: normalizeString(input.rawFrontmatter.assignee) ?? '',
    labels: Array.isArray(input.rawFrontmatter.labels) ? input.rawFrontmatter.labels : [],
    depends_on: Array.isArray(input.rawFrontmatter.depends_on) ? input.rawFrontmatter.depends_on : [],
  };
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n# ${input.title}\n\n${renderedSections}\n`;
}

function finalizeMarkdown(markdown: string, space: RegistrySpace, warnings: string[]): {
  markdown: string;
  warnings: string[];
  hasPlaceholders: boolean;
  executionReady: boolean;
} {
  const frontmatter = parseNormalizedMarkdown(markdown, space);
  const hasPlaceholders = markdown.includes('kanban:placeholder');
  const readiness = normalizeExecutionReadiness({
    status: frontmatter.status as IssueStatus,
    type: frontmatter.type as IssueType,
    executor: frontmatter.executor as IssueExecutor,
    hasPlaceholders,
  });
  return {
    markdown,
    warnings,
    hasPlaceholders,
    executionReady: readiness.executionReady,
  };
}

function parseNormalizedMarkdown(markdown: string, space: RegistrySpace): Record<string, unknown> {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) throw new Error('Normalized issue is invalid: Missing YAML frontmatter');

  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(frontmatterMatch[1]);
  } catch (error) {
    throw new Error(`Normalized issue is invalid: Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }
  const registryValidation = validateIssueFrontmatterForRegistry(frontmatter, {
    idPrefix: space.idPrefix,
    spaceType: space.type,
  });

  const errors = registryValidation.ok ? [] : [...registryValidation.errors];
  const sections = extractSections(normalized.slice(frontmatterMatch[0].length));
  const issueType = isRecord(frontmatter) ? String(frontmatter.type ?? '') : '';
  const requiredSections = issueType === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS;
  for (const section of requiredSections) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) throw new Error(`Normalized issue is invalid: ${errors.join('; ')}`);
  if (!registryValidation.ok) throw new Error(`Normalized issue is invalid: ${registryValidation.errors.join('; ')}`);
  return registryValidation.value as unknown as Record<string, unknown>;
}

async function resolveSourcePath(vaultRoot: string, sourcePath: string): Promise<string> {
  const candidate = path.isAbsolute(sourcePath)
    ? path.resolve(sourcePath)
    : await resolveRegistryPath(vaultRoot, sourcePath);
  if (path.extname(candidate).toLowerCase() !== '.md') {
    throw new Error('Source file is not Markdown');
  }
  const realVaultRoot = await fs.realpath(vaultRoot);
  const realSource = await fs.realpath(candidate);
  if (!isInsideOrSame(realSource, realVaultRoot)) {
    throw new Error('Source path is outside vault');
  }
  if (path.extname(realSource).toLowerCase() !== '.md') {
    throw new Error('Source file is not Markdown');
  }
  return candidate;
}

async function classifySource(vaultRoot: string, registry: VaultRegistry, sourcePath: string): Promise<RegistryRootMatch[]> {
  const realSource = await fs.realpath(sourcePath);
  const matches: RegistryRootMatch[] = [];
  for (const [spaceName, space] of Object.entries(registry.spaces)) {
    await pushRootMatch(matches, vaultRoot, realSource, spaceName, space, space.epics, 'epic');
    if (space.type === 'container') {
      for (const [project, entry] of Object.entries(space.projects ?? {})) {
        await pushRootMatch(matches, vaultRoot, realSource, spaceName, space, entry.path, 'issue', project);
      }
    } else {
      await pushRootMatch(matches, vaultRoot, realSource, spaceName, space, space.issues, 'issue');
    }
  }
  return matches;
}

async function pushRootMatch(
  matches: RegistryRootMatch[],
  vaultRoot: string,
  realSource: string,
  spaceName: string,
  space: RegistrySpace,
  root: string,
  rootKind: RegistryRootMatch['rootKind'],
  project?: string,
): Promise<void> {
  const rootPath = await resolveRegistryPath(vaultRoot, root);
  const realRoot = await fs.realpath(rootPath);
  if (isInsideOrSame(realSource, realRoot)) {
    matches.push({ spaceName, space, rootKind, project, rootPath, realRoot });
  }
}

function selectMostSpecificMatch(matches: RegistryRootMatch[]): RegistryRootMatch | undefined {
  if (matches.length <= 1) return matches[0];
  const sorted = [...matches].sort((a, b) => b.realRoot.length - a.realRoot.length);
  const [best, second] = sorted;
  if (best && second && isInsideOrSame(best.realRoot, second.realRoot)) {
    matches.splice(0, matches.length, best);
    return best;
  }
  return matches[0];
}

function parseRoughNote(content: string): ParsedRoughNote {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { frontmatter: {}, body: normalized, rawFrontmatterHasId: false };
  const parsed = YAML.parse(match[1]);
  if (!isRecord(parsed)) throw new Error('Frontmatter must be an object');
  return {
    frontmatter: parsed,
    body: normalized.slice(match[0].length),
    rawFrontmatterHasId: typeof parsed.id === 'string' && parsed.id.trim() !== '',
  };
}

function renderSections(
  sectionNames: string[],
  existing: Record<string, string>,
  bodyWithoutTitle: string,
  warnings: string[],
): string {
  return sectionNames.map(section => {
    const exact = existing[section]?.trim();
    if (exact) return `## ${section}\n\n${exact}`;
    if (section === '컨텍스트' && bodyWithoutTitle) return `## ${section}\n\n${bodyWithoutTitle}`;
    warnings.push(`Missing section content: ${section}`);
    return `## ${section}\n\n${PLACEHOLDER}`;
  }).join('\n\n');
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

function headingTitle(body: string): string | undefined {
  return body.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || undefined;
}

function stripTopHeading(body: string): string {
  return body.replace(/^# .*(?:\n+|$)/, '').trim();
}

function titleFromFilename(filePath: string): string {
  return path.basename(filePath, '.md').replace(/[-_]+/g, ' ');
}

function normalizeType(value: unknown, warnings: string[]): IssueType {
  if (typeof value === 'string' && ISSUE_TYPES.has(value as IssueType)) return value as IssueType;
  if (value !== undefined) warnings.push(`Invalid type ${String(value)}; defaulted to task`);
  return 'task';
}

function normalizeStatus(value: unknown, warnings: string[]): IssueStatus {
  if (isIssueStatus(value)) return value;
  if (value !== undefined) warnings.push(`Invalid status ${String(value)}; defaulted to TODO`);
  return 'TODO';
}

function normalizePriority(value: unknown, warnings: string[]): Priority {
  if (typeof value === 'string' && PRIORITIES.has(value as Priority)) return value as Priority;
  if (value !== undefined) warnings.push(`Invalid priority ${String(value)}; defaulted to P2`);
  return 'P2';
}

function normalizeExecutor(value: unknown): IssueExecutor {
  if (typeof value === 'string' && EXECUTORS.has(value as IssueExecutor)) return value as IssueExecutor;
  return 'human';
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function validateExecutionMetadata(frontmatter: Record<string, unknown>): void {
  const workingDir = frontmatter.working_dir;
  if (typeof workingDir === 'string' && /[\0\r\n]/.test(workingDir)) {
    throw new Error('Invalid working_dir');
  }

  const mergeInto = frontmatter.merge_into;
  if (
    typeof mergeInto === 'string' &&
    validateMergeIntoValue(mergeInto).length > 0
  ) {
    throw new Error('Invalid merge_into');
  }
}

function appendWarnings(target: string[], warnings: string[]): void {
  for (const warning of warnings) {
    if (!target.includes(warning)) target.push(warning);
  }
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

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
