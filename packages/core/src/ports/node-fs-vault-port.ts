import fs from 'node:fs/promises';
import path from 'node:path';
import { assertVaultRelativePath, type VaultPort } from './vault-port';
import { atomicWriteFile } from '../store/fs-utils';

export class NodeFsVaultPort implements VaultPort {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async read(relativePath: string): Promise<string> {
    return fs.readFile(await this.resolveExisting(relativePath), 'utf8');
  }

  async cachedRead(relativePath: string): Promise<string> {
    return this.read(relativePath);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(await this.resolveExisting(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async create(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.resolveLexical(relativePath);
    await fs.mkdir(this.root, { recursive: true });
    await this.assertNearestExistingPathInsideRoot(path.dirname(absolutePath), relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await this.assertExistingPathInsideRoot(path.dirname(absolutePath), relativePath);
    const handle = await fs.open(absolutePath, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
  }

  async process(relativePath: string, updater: (content: string) => string): Promise<string> {
    const absolutePath = await this.resolveExisting(relativePath);
    const current = await fs.readFile(absolutePath, 'utf8');
    const next = updater(current);
    await atomicWriteFile(absolutePath, next);
    return next;
  }

  async listMarkdownFiles(root = ''): Promise<string[]> {
    if (root !== '') assertVaultRelativePath(root);
    const start = root === '' ? this.root : this.resolveLexical(root);
    await this.assertExistingPathInsideRoot(start, root);
    const results: string[] = [];
    await this.walk(start, results);
    return results.sort();
  }

  private async walk(directory: string, results: string[]): Promise<void> {
    await this.assertExistingPathInsideRoot(directory, path.relative(this.root, directory));
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(this.root, absolutePath).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        await this.assertExistingPathInsideRoot(absolutePath, relativePath);
        continue;
      }
      if (entry.isDirectory()) {
        await this.walk(absolutePath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        await this.assertExistingPathInsideRoot(absolutePath, relativePath);
        results.push(relativePath);
      }
    }
  }

  private async resolveExisting(relativePath: string): Promise<string> {
    const absolutePath = this.resolveLexical(relativePath);
    await this.assertExistingPathInsideRoot(absolutePath, relativePath);
    return absolutePath;
  }

  private resolveLexical(relativePath: string): string {
    assertVaultRelativePath(relativePath);
    const absolutePath = path.resolve(this.root, relativePath);
    if (absolutePath !== this.root && !absolutePath.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Unsafe vault-relative path: ${relativePath}`);
    }
    return absolutePath;
  }

  private async assertNearestExistingPathInsideRoot(
    absolutePath: string,
    relativePath: string,
  ): Promise<void> {
    const nearestPath = await this.nearestExistingPath(absolutePath);
    await this.assertExistingPathInsideRoot(nearestPath, relativePath);
  }

  private async assertExistingPathInsideRoot(
    absolutePath: string,
    relativePath: string,
  ): Promise<void> {
    const realRoot = await fs.realpath(this.root);
    const realPath = await fs.realpath(absolutePath);
    if (!this.isInsideOrSame(realPath, realRoot)) {
      throw new Error(`Vault path escapes root: ${relativePath}`);
    }
  }

  private async nearestExistingPath(absolutePath: string): Promise<string> {
    let current = absolutePath;
    for (;;) {
      try {
        await fs.lstat(current);
        return current;
      } catch (error) {
        if (!this.isNodeError(error) || error.code !== 'ENOENT') {
          throw error;
        }
        const parent = path.dirname(current);
        if (parent === current) {
          throw error;
        }
        current = parent;
      }
    }
  }

  private isInsideOrSame(candidate: string, root: string): boolean {
    const relativePath = path.relative(root, candidate);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  }

  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error;
  }
}
