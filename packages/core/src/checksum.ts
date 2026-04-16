import { createHash } from 'crypto';
import { CanonicalTaskModel } from './types';

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
}

export function computeChecksum(task: CanonicalTaskModel): string {
  // Exclude sync.checksum from the hash to avoid circular dependency
  const { sync, ...rest } = task;
  const { checksum: _cs, ...syncWithoutChecksum } = sync;
  const data = { ...rest, sync: syncWithoutChecksum };
  const content = stableStringify(data);
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function hasChanged(task: CanonicalTaskModel): boolean {
  if (!task.sync.checksum) return true;
  return computeChecksum(task) !== task.sync.checksum;
}