import fs from 'fs/promises';
import path from 'path';
import { redactSecrets } from './redaction.js';

export interface AcceptanceRatio {
  total: number;
  checked: number;
}

export interface RunMetadata {
  issueId: string;
  runNumber: number;
  startedAt: string;
  completedAt?: string;
  outcome: 'REVIEW' | 'FAILED';
  acceptanceRatio: AcceptanceRatio;
  baseCommit?: string;
  headCommit?: string;
  worktreePath?: string;
  logPath?: string;
  command?: string[];
  exitCode?: number;
  timedOut?: boolean;
  ndjsonPath?: string;
  lastMessagePath?: string;
}

export interface RunArtifactPaths {
  dir: string;
  ndjsonPath: string;
  logPath: string;
  lastMessagePath: string;
  metadataPath: string;
}

export function getRunArtifactPaths(vaultRoot: string, date: string, issueId: string, runNumber: number): RunArtifactPaths {
  const dir = path.join(vaultRoot, 'runs', date, issueId);
  return {
    dir,
    ndjsonPath: path.join(dir, `run-${runNumber}.ndjson`),
    logPath: path.join(dir, `run-${runNumber}.log`),
    lastMessagePath: path.join(dir, `run-${runNumber}.last-message.md`),
    metadataPath: path.join(dir, `run-${runNumber}.json`),
  };
}

export async function nextRunNumber(vaultRoot: string, date: string, issueId: string): Promise<number> {
  const dir = getRunArtifactPaths(vaultRoot, date, issueId, 1).dir;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return 1;
    throw error;
  }

  const max = entries.reduce((current, entry) => {
    const match = entry.match(/^run-(\d+)\.(?:ndjson|log|last-message\.md|json)$/);
    return match ? Math.max(current, Number.parseInt(match[1], 10)) : current;
  }, 0);
  return max + 1;
}

export async function writeRunLog(vaultRoot: string, date: string, metadata: RunMetadata, content: string): Promise<string> {
  const paths = getRunArtifactPaths(vaultRoot, date, metadata.issueId, metadata.runNumber);
  await fs.mkdir(paths.dir, { recursive: true });
  const redacted = redactSecrets(content);
  await fs.writeFile(paths.logPath, redacted.endsWith('\n') ? redacted : `${redacted}\n`, 'utf8');
  return paths.logPath;
}

export async function writeRunNdjson(vaultRoot: string, date: string, metadata: RunMetadata, content: string): Promise<string> {
  const paths = getRunArtifactPaths(vaultRoot, date, metadata.issueId, metadata.runNumber);
  await fs.mkdir(paths.dir, { recursive: true });
  const redacted = redactSecrets(content);
  await fs.writeFile(paths.ndjsonPath, redacted.endsWith('\n') ? redacted : `${redacted}\n`, 'utf8');
  return paths.ndjsonPath;
}

export async function writeRunLastMessage(vaultRoot: string, date: string, metadata: RunMetadata, content: string): Promise<string> {
  const paths = getRunArtifactPaths(vaultRoot, date, metadata.issueId, metadata.runNumber);
  await fs.mkdir(paths.dir, { recursive: true });
  const redacted = redactSecrets(content);
  await fs.writeFile(paths.lastMessagePath, redacted.endsWith('\n') ? redacted : `${redacted}\n`, 'utf8');
  return paths.lastMessagePath;
}

export async function writeRunMetadata(vaultRoot: string, date: string, metadata: RunMetadata): Promise<string> {
  const paths = getRunArtifactPaths(vaultRoot, date, metadata.issueId, metadata.runNumber);
  await fs.mkdir(paths.dir, { recursive: true });
  await fs.writeFile(paths.metadataPath, `${JSON.stringify(redactUnknown(metadata), null, 2)}\n`, 'utf8');
  return paths.metadataPath;
}

export async function appendRunEvent(vaultRoot: string, date: string, event: Record<string, unknown>): Promise<string> {
  const dir = path.join(vaultRoot, 'events');
  const eventPath = path.join(dir, `${date}.jsonl`);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(eventPath, `${JSON.stringify(redactUnknown(event))}\n`, 'utf8');
  return eventPath;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function redactUnknown<T>(input: T): T {
  if (typeof input === 'string') {
    return redactSecrets(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map(item => redactUnknown(item)) as T;
  }
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, redactUnknown(value)])
    ) as T;
  }
  return input;
}
