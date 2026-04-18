import path from 'path';
import os from 'os';

export const ALLOWED_BASE_PATHS: string[] = [
  path.resolve(process.env.ISSUES_BASE_PATH || path.join(os.homedir(), 'Projects', 'kanban-task-engine', 'issues'))
];

export function validatePath(requestedPath: string): string {
  const resolved = path.resolve(requestedPath);
  const isAllowed = ALLOWED_BASE_PATHS.some(base => {
    // Ensure base path ends with separator for proper prefix matching
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