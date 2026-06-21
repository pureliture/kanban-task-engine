import fs from 'node:fs/promises';
import path from 'node:path';
import { assertVaultRelativePath } from './vault-port';

export async function assertVaultPathInsideRoot(root: string, relativePath: string): Promise<void> {
  assertVaultRelativePath(relativePath);
  const absolutePath = path.resolve(root, relativePath);
  let realRoot: string;
  let realPath: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    realRoot = path.resolve(root);
  }
  try {
    realPath = await fs.realpath(absolutePath);
  } catch {
    const nearest = await nearestExistingPath(absolutePath);
    try {
      realPath = await fs.realpath(nearest);
    } catch {
      realPath = absolutePath;
    }
  }

  if (!isInsideOrSame(realPath, realRoot)) {
    throw new Error(`Vault path escapes root: ${relativePath}`);
  }
}

export async function assertExistingPathInsideRoot(
  root: string,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  const realRoot = await fs.realpath(root);
  const realPath = await fs.realpath(absolutePath);
  if (!isInsideOrSame(realPath, realRoot)) {
    throw new Error(`Vault path escapes root: ${relativePath}`);
  }
}

export async function assertNearestExistingPathInsideRoot(
  root: string,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  const nearestPath = await nearestExistingPath(absolutePath);
  await assertExistingPathInsideRoot(root, nearestPath, relativePath);
}

export async function nearestExistingPath(absolutePath: string): Promise<string> {
  let current = absolutePath;
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

export function isInsideOrSame(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
