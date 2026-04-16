import fs from 'fs/promises';
import YAML from 'yaml';
import { CanonicalTaskModel, NormalizedStatus } from '../types';
import { canonicalToYaml, normalizedToRawStatus } from './mapper';

export class WriteBack {
  async updateStatus(filePath: string, newStatus: NormalizedStatus, task: CanonicalTaskModel): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const body = this.extractBody(content);
    const yamlData = canonicalToYaml(task);
    yamlData.status = normalizedToRawStatus(newStatus);

    const newContent = this.serializeWithFrontmatter(yamlData, body);

    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, newContent, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  async updateField(filePath: string, fieldName: string, value: unknown): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);
    if (!frontmatter) throw new Error(`Cannot parse frontmatter: ${filePath}`);

    frontmatter[fieldName] = value;
    const body = this.extractBody(content);
    const newContent = this.serializeWithFrontmatter(frontmatter, body);

    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, newContent, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) return null;
    try {
      return YAML.parse(match[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private extractBody(content: string): string {
    const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
    return match ? content.slice(match[0].length).trim() : content.trim();
  }

  private serializeWithFrontmatter(yamlData: Record<string, unknown>, body: string): string {
    const frontmatter = YAML.stringify(yamlData, { lineWidth: 0 });
    return `---\n${frontmatter}---\n\n${body}\n`;
  }

}