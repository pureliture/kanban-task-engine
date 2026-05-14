import path from 'path';
import { resolveVaultPath } from './vault-path';

export interface RegistryPathOptions {
  field?: string;
}

export function splitSafeRelativePath(relativePath: string, options: RegistryPathOptions = {}): string[] {
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.includes('\0')) {
    throwUnsafeRegistryPath(relativePath, options.field);
  }

  const parts = relativePath.split('/');
  if (parts.length === 0 || parts.some(part => part.trim() === '' || part === '.' || part === '..')) {
    throwUnsafeRegistryPath(relativePath, options.field);
  }

  return parts;
}

export async function resolveRegistryPath(
  vaultRoot: string,
  relativePath: string,
  options: RegistryPathOptions = {},
): Promise<string> {
  return resolveVaultPath(vaultRoot, ...splitSafeRelativePath(relativePath, options));
}

function throwUnsafeRegistryPath(relativePath: string, field: string | undefined): never {
  const label = field ? ` ${field}` : '';
  throw new Error(`Unsafe registry${label} path: ${relativePath}`);
}
