import YAML from 'yaml';

export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return null;
  try {
    return YAML.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractBody(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

export function serializeWithFrontmatter(yamlData: Record<string, unknown>, body: string): string {
  const frontmatter = YAML.stringify(yamlData, { lineWidth: 0 });
  return `---\n${frontmatter}---\n\n${body}\n`;
}