import path from 'path';
import { getAllowedIssueBasePath } from '../config/kanban-home';

export function getAllowedBasePaths(): string[] {
  return [path.resolve(getAllowedIssueBasePath())];
}

export function validatePath(requestedPath: string): string {
  const resolved = path.resolve(requestedPath);
  const isAllowed = getAllowedBasePaths().some(base => {
    const normalizedBase = base.endsWith(path.sep) ? base : base + path.sep;
    return resolved.startsWith(normalizedBase);
  });

  if (!isAllowed) {
    throw new Error(`Path traversal blocked: ${requestedPath}`);
  }

  return resolved;
}

export function isPathWithinAllowed(requestedPath: string): boolean {
  try {
    validatePath(requestedPath);
    return true;
  } catch {
    return false;
  }
}
