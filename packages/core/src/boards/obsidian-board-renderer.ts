import { createHash } from 'crypto';
import { ISSUE_STATUSES, type IssueStatus } from '@kanban-task-engine/schema';
import type { BoardEnrichment } from './board-enrichment';

export interface ObsidianBoardIssue {
  id: string;
  title: string;
  type: string;
  status: IssueStatus;
  project: string;
  updated: string;
  relativePath: string;
  epic?: string;
  priority?: string;
  /** read-only neurons enrichment overlay (휘발성, checksum/SoT 미포함) */
  enrichment?: BoardEnrichment;
}

export interface RenderObsidianBoardOptions {
  space: string;
  generatedAt: string;
  issues: ObsidianBoardIssue[];
}

const PRIORITY_RANK: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const DEFAULT_PRIORITY = 'P2';
const WARNING =
  '<!-- GENERATED PROJECTION by kanban-task-engine. issues/**/*.md are source of truth. Moving existing cards is a pending proposal until reconcile-board --apply. Do not create/delete cards or edit kanban-task-engine metadata. -->';
const METADATA_KEYS = ['status', 'priority', 'project', 'epic', 'updated'] as const;

export function renderObsidianBoardMarkdown(options: RenderObsidianBoardOptions): string {
  const issues = options.issues
    .filter(issue => issue.type !== 'epic')
    .sort(compareIssues);
  const lines: string[] = [
    '---',
    'kanban-plugin: board',
    'kanban-task-engine:',
    `  generatedAt: "${options.generatedAt}"`,
    `  space: ${options.space}`,
    '  source: issues',
    '---',
    '',
    WARNING,
    '',
  ];

  for (const status of ISSUE_STATUSES) {
    lines.push(`## ${status}`, '');
    for (const issue of issues.filter(item => item.status === status)) {
      lines.push(renderCard(issue, options.generatedAt));
    }
    lines.push('');
  }

  lines.push(renderKanbanSettingsFooter());
  return `${lines.join('\n').trimEnd()}\n`;
}

export function computeBoardProjectionChecksum(issue: ObsidianBoardIssue): string {
  const payload = stableStringify({
    epic: issue.epic ?? '',
    id: issue.id,
    priority: normalizePriority(issue.priority),
    project: issue.project,
    relativePath: issue.relativePath,
    status: issue.status,
    title: issue.title,
    type: issue.type,
    updated: issue.updated,
  });

  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function renderCard(issue: ObsidianBoardIssue, generatedAt: string): string {
  const linkTarget = stripMarkdownExtension(issue.relativePath);
  const alias = formatCardAlias(issue);
  const priority = normalizePriority(issue.priority);
  const checksum = computeBoardProjectionChecksum(issue);
  const badge = formatEnrichmentBadge(issue.enrichment);

  return `- [ ] [[${linkTarget}|${alias}]] \`${priority}\`${badge} <!-- kanban-task-engine:id=${issue.id} status=${issue.status} checksum=${checksum} source=${encodeURIComponent(issue.relativePath)} generatedAt=${generatedAt} -->`;
}

/**
 * read-only enrichment 뱃지 (neurons mirror). checksum 에 포함되지 않으므로 drift 를
 * 유발하지 않고, .md SoT 와 무관한 휘발 표시다. 카운트가 없으면 빈 문자열.
 */
function formatEnrichmentBadge(enrichment: BoardEnrichment | undefined): string {
  if (!enrichment) return '';
  const parts: string[] = [];
  if (enrichment.decisionCount) parts.push(`d${enrichment.decisionCount}`);
  if (enrichment.driftCount) parts.push(`drift${enrichment.driftCount}`);
  if (enrichment.incidentCount) parts.push(`inc${enrichment.incidentCount}`);
  if (enrichment.neighborCount) parts.push(`~${enrichment.neighborCount}`);
  return parts.length ? ` \`🧠 ${parts.join(' ')}\`` : '';
}

function formatCardAlias(issue: ObsidianBoardIssue): string {
  const title = issue.title
    .replace(/\s+/g, ' ')
    .replace(/\]\]/g, '] ]')
    .replace(/\|/g, '/')
    .trim();
  return `${issue.id} ${title}`.trim();
}

function renderKanbanSettingsFooter(): string {
  const metadataKeys = METADATA_KEYS.map(metadataKey => ({
    metadataKey,
    label: '',
    shouldHideLabel: false,
    containsMarkdown: false,
  }));

  return [
    '%% kanban:settings',
    '```',
    JSON.stringify({ 'kanban-plugin': 'board', 'metadata-keys': metadataKeys }),
    '```',
    '%%',
  ].join('\n');
}

function stripMarkdownExtension(relativePath: string): string {
  return relativePath.endsWith('.md') ? relativePath.slice(0, -3) : relativePath;
}

function normalizePriority(priority: string | undefined): string {
  return priority ?? DEFAULT_PRIORITY;
}

function compareIssues(a: ObsidianBoardIssue, b: ObsidianBoardIssue): number {
  return (
    priorityRank(a) - priorityRank(b) ||
    a.id.localeCompare(b.id)
  );
}

function priorityRank(issue: ObsidianBoardIssue): number {
  return PRIORITY_RANK[normalizePriority(issue.priority)] ?? Number.MAX_SAFE_INTEGER;
}

function stableStringify(input: unknown): string {
  if (input === null || input === undefined) return 'null';
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(stableStringify).join(',')}]`;

  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
