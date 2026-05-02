import fs from 'fs/promises';
import path from 'path';

export async function resolveVaultPath(vaultRoot: string, ...segments: string[]): Promise<string> {
  for (const segment of segments) {
    assertSafeVaultSegment(segment);
  }

  const resolvedRoot = path.resolve(vaultRoot);
  const candidate = path.resolve(resolvedRoot, ...segments);
  const parentToCheck = await nearestExistingPath(candidate);
  const realRoot = await fs.realpath(resolvedRoot);
  const realParent = await fs.realpath(parentToCheck);

  if (!isInsideOrSame(realParent, realRoot)) {
    throw new Error(`Vault path escapes root: ${candidate}`);
  }

  return candidate;
}

export function assertSafeVaultSegment(segment: string): void {
  if (
    segment.trim() === '' ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('\0') ||
    path.isAbsolute(segment) ||
    segment.includes('/') ||
    segment.includes('\\')
  ) {
    throw new Error(`Unsafe vault path segment: ${segment}`);
  }
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
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

function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
