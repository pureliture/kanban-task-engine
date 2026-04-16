import { createHash } from 'crypto';
import { CanonicalTaskModel } from './types';
import { canonicalToYaml } from './store/mapper';

export function computeChecksum(task: CanonicalTaskModel): string {
  const data = canonicalToYaml(task);
  const content = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function hasChanged(task: CanonicalTaskModel): boolean {
  if (!task.sync.checksum) return true;
  return computeChecksum(task) !== task.sync.checksum;
}