import { TFile, type Vault } from 'obsidian';
import { assertVaultRelativePath, type VaultPort } from '@kanban-task-engine/core/ports/vault-port';

export class ObsidianVaultPort implements VaultPort {
  readonly root: string;

  constructor(private readonly vault: Vault, root = deriveDesktopVaultRoot(vault)) {
    this.root = root;
  }

  async read(relativePath: string): Promise<string> {
    return this.vault.read(this.file(relativePath, { allowRegistryYaml: true }));
  }

  async cachedRead(relativePath: string): Promise<string> {
    return this.vault.cachedRead(this.file(relativePath, { allowRegistryYaml: true }));
  }

  async exists(relativePath: string): Promise<boolean> {
    this.validatePath(relativePath);
    if (!isMarkdownPath(relativePath)) return false;
    const file = this.vault.getAbstractFileByPath(relativePath);
    return file instanceof TFile && isMarkdownFile(file);
  }

  async create(relativePath: string, content: string): Promise<void> {
    this.validateMarkdownPath(relativePath);
    await this.ensureParentFolders(relativePath);
    await this.vault.create(relativePath, content);
  }

  async process(relativePath: string, updater: (content: string) => string): Promise<string> {
    return this.vault.process(this.file(relativePath), updater);
  }

  async listMarkdownFiles(root = ''): Promise<string[]> {
    if (root !== '') this.validatePath(root);
    return this.vault
      .getMarkdownFiles()
      .map(file => file.path)
      .filter(filePath => root === '' || filePath === root || filePath.startsWith(`${root}/`))
      .sort();
  }

  private file(
    relativePath: string,
    options: { allowRegistryYaml?: boolean } = {},
  ): TFile {
    this.validatePath(relativePath);
    if (!options.allowRegistryYaml || relativePath !== 'registry.yaml') {
      this.validateMarkdownPath(relativePath);
    }
    const file = this.vault.getAbstractFileByPath(relativePath);
    if (file === null) {
      throw vaultFileNotFound(relativePath);
    }
    if (!(file instanceof TFile)) {
      throw new Error(`Vault path is not a markdown file: ${relativePath}`);
    }
    if (relativePath !== 'registry.yaml' && !isMarkdownFile(file)) {
      throw new Error(`Vault path is not a markdown file: ${relativePath}`);
    }
    return file;
  }

  private validatePath(relativePath: string): void {
    assertVaultRelativePath(relativePath);
  }

  private validateMarkdownPath(relativePath: string): void {
    this.validatePath(relativePath);
    if (!isMarkdownPath(relativePath)) {
      throw new Error(`Vault path is not a markdown file: ${relativePath}`);
    }
  }

  private async ensureParentFolders(relativePath: string): Promise<void> {
    const segments = relativePath.split('/').slice(0, -1);
    let current = '';
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`;
      if (this.vault.getFolderByPath?.(current)) continue;
      try {
        await this.vault.createFolder(current);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
      }
    }
  }
}

export function deriveDesktopVaultRoot(vault: Vault): string {
  const adapter = vault.adapter as { getBasePath?: () => string };
  if (typeof adapter.getBasePath !== 'function') {
    throw new Error('Obsidian desktop filesystem adapter is required to derive vault root');
  }
  return adapter.getBasePath();
}

function isMarkdownPath(relativePath: string): boolean {
  return relativePath.endsWith('.md');
}

function isMarkdownFile(file: TFile): boolean {
  return file.extension === 'md' && isMarkdownPath(file.path);
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

function vaultFileNotFound(relativePath: string): Error & { code: 'ENOENT' } {
  return Object.assign(new Error(`Vault file not found: ${relativePath}`), { code: 'ENOENT' as const });
}
