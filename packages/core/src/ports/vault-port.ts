export interface VaultPort {
  read(relativePath: string): Promise<string>;
  cachedRead?(relativePath: string): Promise<string>;
  exists(relativePath: string): Promise<boolean>;
  create(relativePath: string, content: string): Promise<void>;
  process(relativePath: string, updater: (content: string) => string): Promise<string>;
  listMarkdownFiles(root?: string): Promise<string[]>;
}

export function assertVaultRelativePath(relativePath: string): void {
  const segments = relativePath.split('/');
  if (
    relativePath.trim() === '' ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    relativePath.includes('//') ||
    relativePath.startsWith('/') ||
    segments.includes('..')
  ) {
    throw new Error(`Unsafe vault-relative path: ${relativePath}`);
  }
}
