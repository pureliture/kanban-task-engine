import YAML from 'yaml';
import { isIssueStatus, IssueStatus } from './status';

export interface IssueFrontmatter {
  id: string;
  title: string;
  issueType: string;
  project: string;
  status: IssueStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  parent?: string;
  labels?: string[];
  executor?: string;
  syncTarget?: string;
  jiraProject?: string;
  jiraKey?: string;
  automation?: Record<string, unknown>;
}

export interface ParsedIssueMarkdown {
  frontmatter: IssueFrontmatter;
  sections: Record<string, string>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const REQUIRED_FIELDS = ['id', 'title', 'issueType', 'project', 'status', 'priority', 'createdAt', 'updatedAt'] as const;
const REQUIRED_SECTIONS = ['Goal', 'Acceptance Criteria', 'Implementation Tasks', 'Notes'] as const;

export function validateIssueFrontmatter(input: Record<string, unknown>): ValidationResult<IssueFrontmatter> {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (input.status !== undefined && !isIssueStatus(input.status)) {
    errors.push(`Invalid status: ${String(input.status)}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as IssueFrontmatter };
}

export function parseIssueMarkdown(content: string): ValidationResult<ParsedIssueMarkdown> {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return { ok: false, errors: ['Missing YAML frontmatter'] };

  const parsed = YAML.parse(frontmatterMatch[1]) as Record<string, unknown>;
  const frontmatterResult = validateIssueFrontmatter(parsed);
  const errors: string[] = frontmatterResult.ok ? [] : [...frontmatterResult.errors];

  const body = content.slice(frontmatterMatch[0].length);
  const sections = extractSections(body); 

  for (const section of REQUIRED_SECTIONS) {
    if (!sections[section] || sections[section].trim() === '') {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!frontmatterResult.ok) return { ok: false, errors: frontmatterResult.errors };

  return { ok: true, value: { frontmatter: frontmatterResult.value, sections } };
}

function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let currentSection: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = match[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  return sections;
}
