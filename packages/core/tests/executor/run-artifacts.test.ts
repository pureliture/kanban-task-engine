import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  appendRunEvent,
  getRunArtifactPaths,
  nextRunNumber,
  RunMetadata,
  writeRunLastMessage,
  writeRunLog,
  writeRunMetadata,
  writeRunNdjson,
} from '../../src/executor/run-artifacts';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kanban-runs-'));
}

const metadata: RunMetadata = {
  issueId: 'VC-001',
  runNumber: 1,
  startedAt: '2026-04-24T00:00:00.000Z',
  completedAt: '2026-04-24T00:01:00.000Z',
  outcome: 'REVIEW',
  acceptanceRatio: { total: 3, checked: 2 },
  baseCommit: 'base',
  headCommit: 'head',
};

describe('run artifacts', () => {
  it('starts run numbering at one', async () => {
    await expect(nextRunNumber(await tmpDir(), '2026-04-24', 'VC-001')).resolves.toBe(1);
  });

  it('writes log and metadata files', async () => {
    const vaultRoot = await tmpDir();
    const logPath = await writeRunLog(vaultRoot, '2026-04-24', metadata, 'hello');
    const metadataPath = await writeRunMetadata(vaultRoot, '2026-04-24', metadata);

    expect(logPath).toBe(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.log'));
    expect(await fs.readFile(logPath, 'utf8')).toBe('hello\n');
    expect(JSON.parse(await fs.readFile(metadataPath, 'utf8'))).toMatchObject({
      issueId: 'VC-001',
      acceptanceRatio: { total: 3, checked: 2 },
    });
  });

  it('returns ndjson, log, last-message, and metadata artifact paths', () => {
    const vaultRoot = '/vault';
    const paths = getRunArtifactPaths(vaultRoot, '2026-04-24', 'VC-001', 1);

    expect(paths.ndjsonPath).toBe(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.ndjson'));
    expect(paths.logPath).toBe(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.log'));
    expect(paths.lastMessagePath).toBe(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.last-message.md'));
    expect(paths.metadataPath).toBe(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.json'));
  });

  it('increments after existing run artifacts', async () => {
    const vaultRoot = await tmpDir();
    await writeRunLog(vaultRoot, '2026-04-24', metadata, 'first');
    await writeRunMetadata(vaultRoot, '2026-04-24', { ...metadata, runNumber: 2 });

    await expect(nextRunNumber(vaultRoot, '2026-04-24', 'VC-001')).resolves.toBe(3);
  });

  it('increments after existing ndjson and last-message artifacts', async () => {
    const vaultRoot = await tmpDir();
    const run1Paths = getRunArtifactPaths(vaultRoot, '2026-04-24', 'VC-001', 1);
    const run2Paths = getRunArtifactPaths(vaultRoot, '2026-04-24', 'VC-001', 2);
    await fs.mkdir(run1Paths.dir, { recursive: true });
    await fs.writeFile(run1Paths.ndjsonPath, '{"type":"raw"}\n', 'utf8');
    await fs.writeFile(run2Paths.lastMessagePath, 'last message\n', 'utf8');

    await expect(nextRunNumber(vaultRoot, '2026-04-24', 'VC-001')).resolves.toBe(3);
  });

  it('redacts secrets from log, last-message, metadata, and ndjson artifacts', async () => {
    const vaultRoot = await tmpDir();
    const secret = 'sk-proj-secret123';
    const githubSecret = 'ghp_abcdefghijklmnopqrstuvwxyz';
    const secretMetadata = {
      ...metadata,
      backend: 'codex',
      baseCommit: 'base',
      headCommit: 'head',
      command: ['codex', 'exec', `--api-key=${secret}`],
      env: {
        OPENAI_API_KEY: secret,
        nested: {
          token: `token: ${githubSecret}`,
        },
      },
    } satisfies RunMetadata & {
      backend: string;
      command: string[];
      env: Record<string, unknown>;
    };

    const logPath = await writeRunLog(vaultRoot, '2026-04-24', secretMetadata, `stdout ${secret}`);
    const lastMessagePath = await writeRunLastMessage(vaultRoot, '2026-04-24', secretMetadata, `stderr token: ${githubSecret}`);
    const metadataPath = await writeRunMetadata(vaultRoot, '2026-04-24', secretMetadata);
    const ndjsonPath = await writeRunNdjson(vaultRoot, '2026-04-24', secretMetadata, `{"token":"${secret}"}\n`);

    expect(await fs.readFile(logPath, 'utf8')).not.toContain(secret);
    expect(await fs.readFile(lastMessagePath, 'utf8')).not.toContain(githubSecret);
    const metadataJson = await fs.readFile(metadataPath, 'utf8');
    expect(metadataJson).not.toContain(secret);
    expect(metadataJson).not.toContain(githubSecret);
    expect(metadataJson).toContain('[REDACTED]');
    const ndjson = await fs.readFile(ndjsonPath, 'utf8');
    expect(ndjson).not.toContain(secret);
    expect(ndjson).toContain('[REDACTED]');
  });

  it('appends JSONL events', async () => {
    const vaultRoot = await tmpDir();
    const eventPath = await appendRunEvent(vaultRoot, '2026-04-24', { issueId: 'VC-001', outcome: 'REVIEW' });

    expect(await fs.readFile(eventPath, 'utf8')).toBe('{"issueId":"VC-001","outcome":"REVIEW"}\n');
  });

  it('redacts secrets from JSONL events', async () => {
    const vaultRoot = await tmpDir();
    const secret = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
    const eventPath = await appendRunEvent(vaultRoot, '2026-04-24', {
      issueId: 'VC-001',
      stderr: secret,
      nested: {
        token: 'CI_TOKEN=secret-token',
      },
    });

    const event = await fs.readFile(eventPath, 'utf8');
    expect(event).toContain('[REDACTED]');
    expect(event).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(event).not.toContain('secret-token');
  });
});
