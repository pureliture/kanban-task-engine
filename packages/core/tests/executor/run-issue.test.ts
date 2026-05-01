import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunner } from '../../src/executor/agent-runner';
import { GitRunner } from '../../src/executor/git';
import { readExecutionLock } from '../../src/executor/lock';
import { runIssueWithAgent } from '../../src/executor/run-issue';

interface FakeGitOptions {
  baseCommit?: string;
  headCommit?: string;
  statusPorcelain?: string;
  commitFails?: boolean;
}

function fakeGitRunner(options: FakeGitOptions = {}): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  let revParseCount = 0;
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args[0] === 'rev-parse') {
        revParseCount += 1;
        return {
          stdout: `${revParseCount === 1 ? options.baseCommit ?? 'base123' : options.headCommit ?? 'head456'}\n`,
          stderr: '',
        };
      }
      if (args[0] === 'status') {
        return { stdout: options.statusPorcelain ?? ' M src/index.ts\n', stderr: '' };
      }
      if (args[0] === '-c' && args.includes('commit') && options.commitFails) {
        throw new Error('commit failed');
      }
      return { stdout: '', stderr: '' };
    },
  };
}

type FakeAgentResultFactory = (input: { ndjsonPath?: string; lastMessagePath?: string }) => Awaited<ReturnType<AgentRunner['run']>>;

function fakeAgent(
  result: Awaited<ReturnType<AgentRunner['run']>> | FakeAgentResultFactory = {
    exitCode: 0,
    stdout: 'implementation complete',
    stderr: '',
    command: ['codex', 'exec'],
  },
): AgentRunner & { calls: Array<{ promptPath: string; cwd: string; ndjsonPath?: string; lastMessagePath?: string }> } {
  const calls: Array<{ promptPath: string; cwd: string; ndjsonPath?: string; lastMessagePath?: string }> = [];
  return {
    backend: 'codex',
    calls,
    async run(input) {
      calls.push({
        promptPath: input.promptPath,
        cwd: input.cwd,
        ndjsonPath: input.ndjsonPath,
        lastMessagePath: input.lastMessagePath,
      });
      return typeof result === 'function' ? result(input) : result;
    },
  };
}

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kanban-run-issue-'));
}

async function writeReadyIssue(dir: string, issueId = 'VC-001'): Promise<string> {
  const issuePath = path.join(dir, `${issueId}.md`);
  await fs.writeFile(issuePath, `---
id: ${issueId}
title: Execute this
type: task
status: READY
executor: codex
project: kanban-task-engine
priority: P1
created: 2026-04-24
updated: 2026-04-24
labels: []
depends_on: []
run_count: 0
---

## 목적

Run it.

## 컨텍스트

Context.

## Acceptance Criteria

- [x] Existing setup
- [ ] New implementation

## 실행 힌트

Use tests.

## 로그

`, 'utf8');
  return issuePath;
}

describe('runIssueWithAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves READY to REVIEW when agent changes files and checkpoint commit succeeds', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const git = fakeGitRunner();
    const agent = fakeAgent();

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git,
      agent,
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      issueId: 'VC-001',
      outcome: 'REVIEW',
      runNumber: 1,
      worktreePath: path.join(workingDir, '.worktrees', 'kanban', 'VC-001'),
    });
    expect(git.calls).toContainEqual(['rev-parse', 'HEAD']);
    expect(git.calls).toContainEqual(['status', '--porcelain']);
    expect(git.calls).toContainEqual(['add', '-A']);
    expect(git.calls).toContainEqual([
      '-c',
      'user.name=Kanban Engine',
      '-c',
      'user.email=kanban-engine@example.invalid',
      'commit',
      '-m',
      'VC-001 checkpoint',
      '-m',
      'Created by kanban-task-engine run lifecycle.',
    ]);
    expect(agent.calls).toEqual([{
      promptPath: path.join(vaultRoot, 'runtime', 'prompts', '2026-04-24', 'VC-001-run-1.md'),
      cwd: path.join(workingDir, '.worktrees', 'kanban', 'VC-001'),
      ndjsonPath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.ndjson'),
      lastMessagePath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.last-message.md'),
    }]);

    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: REVIEW');
    expect(updatedIssue).toContain('run_count: 1');
    expect(updatedIssue).toContain('run -> REVIEW');
    const event = JSON.parse(await fs.readFile(path.join(vaultRoot, 'events', '2026-04-24.jsonl'), 'utf8'));
    expect(event).toMatchObject({
      type: 'issue.run',
      issueId: 'VC-001',
      backend: 'codex',
      outcome: 'REVIEW',
    });
    await expect(readExecutionLock(path.join(vaultRoot, 'runtime', 'current.lock'))).resolves.toBeNull();
  });

  it('moves READY to FAILED when agent exits zero but produces no changes', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const git = fakeGitRunner({ statusPorcelain: '' });

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git,
      agent: fakeAgent({ exitCode: 0, stdout: 'nothing to do', stderr: '' }),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result.outcome).toBe('FAILED');
    expect(git.calls).not.toContainEqual(['add', '-A']);
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('status: FAILED');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('produced no file changes');
  });

  it('moves RUNNING to FAILED when agent exits non-zero', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      agent: fakeAgent({ exitCode: 2, stdout: '', stderr: 'agent failed' }),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result.outcome).toBe('FAILED');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('status: FAILED');
    await expect(fs.readFile(result.logPath, 'utf8')).resolves.toContain('agent failed');
  });

  it('moves RUNNING to FAILED when checkpoint commit fails', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner({ commitFails: true }),
      agent: fakeAgent({ exitCode: 0, stdout: 'implementation complete', stderr: '' }),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result.outcome).toBe('FAILED');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('status: FAILED');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('Checkpoint commit failed');
  });

  it('moves RUNNING to FAILED when artifact writing fails after preserving issue log', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    // Covers exception after RUNNING: artifact writing fails after the issue has already entered RUNNING.
    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
      artifacts: {
        async writeRunLog() {
          throw new Error('disk full');
        },
      },
    });

    expect(result.outcome).toBe('FAILED');
    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: FAILED');
    expect(updatedIssue).toContain('run -> FAILED');
    expect(updatedIssue).toContain('Artifact writing failed: disk full');
  });

  it('rewrites metadata to FAILED when event writing fails after metadata was written', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
      artifacts: {
        async appendRunEvent() {
          throw new Error('event sink unavailable');
        },
      },
    });

    expect(result).toMatchObject({
      outcome: 'FAILED',
      logPath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.log'),
      metadataPath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.json'),
    });
    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: FAILED');
    expect(updatedIssue).toContain('Artifact writing failed: event sink unavailable');
    const metadata = JSON.parse(await fs.readFile(result.metadataPath, 'utf8'));
    expect(metadata).toMatchObject({
      outcome: 'FAILED',
      baseCommit: 'base123',
      headCommit: 'head456',
      logPath: result.logPath,
    });
  });

  it('does not append a REVIEW event when the final issue write fails', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const appendRunEvent = vi.fn(async () => path.join(vaultRoot, 'events', '2026-04-24.jsonl'));
    const originalWriteFile = fs.writeFile;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data, options) => {
      if (filePath === issuePath && String(data).includes('status: REVIEW')) {
        throw new Error('issue write failed');
      }
      return originalWriteFile(filePath, data, options);
    });

    await expect(runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
      artifacts: {
        appendRunEvent,
      },
    })).rejects.toThrow('issue write failed');

    expect(appendRunEvent).not.toHaveBeenCalled();
    await expect(readExecutionLock(path.join(vaultRoot, 'runtime', 'current.lock'))).resolves.toBeNull();
  });

  it('moves RUNNING to FAILED when metadata writing fails while returning expected metadata path', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
      artifacts: {
        async writeRunMetadata() {
          throw new Error('metadata volume readonly');
        },
      },
    });

    expect(result).toMatchObject({
      outcome: 'FAILED',
      metadataPath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.json'),
    });
    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: FAILED');
    expect(updatedIssue).toContain('Artifact writing failed: metadata volume readonly');
    await expect(fs.access(result.metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('moves RUNNING to FAILED when checkpoint commit does not advance HEAD', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);

    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner({ baseCommit: 'same123', headCommit: 'same123' }),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result.outcome).toBe('FAILED');
    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: FAILED');
    expect(updatedIssue).toContain('Checkpoint commit did not advance HEAD');
  });

  it('records baseCommit and headCommit in metadata without advertising missing artifacts', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner({ baseCommit: 'abc123', headCommit: 'def456' }),
      agent: fakeAgent(),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    const metadata = JSON.parse(await fs.readFile(result.metadataPath, 'utf8'));
    expect(metadata).toMatchObject({
      backend: 'codex',
      baseCommit: 'abc123',
      headCommit: 'def456',
      command: ['codex', 'exec'],
      exitCode: 0,
      timedOut: false,
      worktreePath: path.join(workingDir, '.worktrees', 'kanban', 'VC-001'),
      logPath: result.logPath,
    });
    expect(metadata).not.toHaveProperty('ndjsonPath');
    expect(metadata).not.toHaveProperty('lastMessagePath');
  });

  it('records artifact paths in metadata when the agent returns created artifacts', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const result = await runIssueWithAgent({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner({ baseCommit: 'abc123', headCommit: 'def456' }),
      agent: fakeAgent(input => ({
        exitCode: 0,
        stdout: 'implementation complete',
        stderr: '',
        command: ['codex', 'exec'],
        ndjsonPath: input.ndjsonPath,
        lastMessagePath: input.lastMessagePath,
      })),
      fetch: false,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    const metadata = JSON.parse(await fs.readFile(result.metadataPath, 'utf8'));
    expect(metadata).toMatchObject({
      ndjsonPath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.ndjson'),
      lastMessagePath: path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.last-message.md'),
    });
  });
});
