import fs from 'fs/promises';
import { CanonicalTaskModel, NormalizedStatus } from '../types';
import { canonicalToYaml, normalizedToRawStatus } from './mapper';
import { parseFrontmatter, extractBody, serializeWithFrontmatter } from './frontmatter-utils';
import { atomicWriteFile } from './fs-utils';

export class WriteBack {
  async updateStatus(filePath: string, newStatus: NormalizedStatus, task: CanonicalTaskModel): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const body = extractBody(content);
    const yamlData = canonicalToYaml(task);
    yamlData.status = normalizedToRawStatus(newStatus);

    const newContent = serializeWithFrontmatter(yamlData, body);
    await atomicWriteFile(filePath, newContent);
  }

  async updateField(filePath: string, fieldName: string, value: unknown): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) throw new Error(`Cannot parse frontmatter: ${filePath}`);

    frontmatter[fieldName] = value;
    const body = extractBody(content);
    const newContent = serializeWithFrontmatter(frontmatter, body);
    await atomicWriteFile(filePath, newContent);
  }
}