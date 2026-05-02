import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptClaudeRunnerToAgent } from '../../src/executor/agent-runner';
import { spawnAgentProcess } from '../../src/executor/agent-process';
import { GitRunner } from '../../src/executor/git';
import { readExecutionLock } from '../../src/executor/lock';
import { ClaudeRunner, createClaudeAgentRunner, createClaudeCliRunner, runIssueWithClaude } from '../../src/executor/claude-code-executor';

vi.mock('../../src/executor/agent-process', () => ({
  spawnAgentProcess: vi.fn(),
}));

function fakeGitRunner(): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  let revParseCount = 0;
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args[0] === 'rev-parse') {
        revParseCount += 1;
        return { stdout: `${revParseCount === 1 ? 'base123' : 'head456'}\n`, stderr: '' };
      }
      if (args[0] === 'status') {
        return { stdout: ' M src/index.ts\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
}

function fakeClaudeRunner(result = { exitCode: 0, stdout: 'done', stderr: '' }): ClaudeRunner & { calls: Array<{ promptPath: string; cwd: string }> } {
  const calls: Array<{ promptPath: string; cwd: string }> = [];
  return {
    calls,
    async run(promptPath, cwd) {
      calls.push({ promptPath, cwd });
      return result;
    },
  };
}

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kanban-run-'));
}

async function writeReadyIssue(dir: string, issueId = 'VC-001'): Promise<string> {
  const issuePath = path.join(dir, `${issueId}.md`);
  await fs.writeFile(issuePath, `---
id: ${issueId}
title: Execute this
type: task
status: READY
executor: claude-code
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

describe('runIssueWithClaude', () => {
  beforeEach(() => {
    vi.mocked(spawnAgentProcess).mockReset();
  });

  it('keeps the legacy ClaudeRunner two-argument run contract', async () => {
    const claude = fakeClaudeRunner({ exitCode: 0, stdout: 'legacy ok', stderr: '' });

    await expect(claude.run('/tmp/prompt.md', '/tmp/worktree')).resolves.toEqual({
      exitCode: 0,
      stdout: 'legacy ok',
      stderr: '',
    });
    expect(claude.calls).toEqual([{ promptPath: '/tmp/prompt.md', cwd: '/tmp/worktree' }]);
  });

  it('adapts a legacy Claude runner to AgentRunner without changing delegated arguments', async () => {
    const claude = fakeClaudeRunner({ exitCode: 0, stdout: 'agent ok', stderr: '' });
    const agent = adaptClaudeRunnerToAgent(claude);

    await expect(agent.run({
      promptPath: '/tmp/prompt.md',
      cwd: '/tmp/worktree',
      timeoutMs: 123,
    })).resolves.toEqual({
      exitCode: 0,
      stdout: 'agent ok',
      stderr: '',
    });
    expect(agent.backend).toBe('claude-code');
    expect(claude.calls).toEqual([{ promptPath: '/tmp/prompt.md', cwd: '/tmp/worktree' }]);
  });

  it('runs a READY issue to REVIEW, writes artifacts, and releases the lock', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const git = fakeGitRunner();
    const claude = fakeClaudeRunner({ exitCode: 0, stdout: 'implementation complete', stderr: '' });

    const result = await runIssueWithClaude({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git,
      claude,
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      issueId: 'VC-001',
      outcome: 'REVIEW',
      runNumber: 1,
      worktreePath: path.join(workingDir, '.worktrees', 'kanban', 'VC-001'),
    });
    expect(git.calls).toEqual([
      ['fetch', 'origin', '--prune'],
      ['worktree', 'add', '-b', 'kanban/VC-001', path.join(workingDir, '.worktrees', 'kanban', 'VC-001'), 'origin/main'],
      ['rev-parse', 'HEAD'],
      ['status', '--porcelain'],
      ['add', '-A'],
      [
        '-c',
        'user.name=Kanban Engine',
        '-c',
        'user.email=kanban-engine@example.invalid',
        'commit',
        '-m',
        'VC-001 checkpoint',
        '-m',
        'Created by kanban-task-engine run lifecycle.',
      ],
      ['rev-parse', 'HEAD'],
    ]);
    expect(claude.calls).toEqual([{
      promptPath: path.join(vaultRoot, 'runtime', 'prompts', '2026-04-24', 'VC-001-run-1.md'),
      cwd: path.join(workingDir, '.worktrees', 'kanban', 'VC-001'),
    }]);

    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    expect(updatedIssue).toContain('status: REVIEW');
    expect(updatedIssue).toContain('run_count: 1');
    expect(updatedIssue).toContain('run -> REVIEW');
    expect(updatedIssue).toContain('implementation complete');

    const metadata = JSON.parse(await fs.readFile(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.json'), 'utf8'));
    expect(metadata).toMatchObject({
      issueId: 'VC-001',
      outcome: 'REVIEW',
      acceptanceRatio: { total: 2, checked: 1 },
    });
    await expect(fs.readFile(path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.log'), 'utf8')).resolves.toContain('implementation complete');
    await expect(fs.readFile(path.join(vaultRoot, 'events', '2026-04-24.jsonl'), 'utf8')).resolves.toContain('"outcome":"REVIEW"');
    await expect(readExecutionLock(path.join(vaultRoot, 'runtime', 'current.lock'))).resolves.toBeNull();
  });

  it('marks the issue FAILED when Claude returns a non-zero exit code', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const result = await runIssueWithClaude({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      claude: fakeClaudeRunner({ exitCode: 1, stdout: '', stderr: 'boom' }),
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    expect(result.outcome).toBe('FAILED');
    await expect(fs.readFile(issuePath, 'utf8')).resolves.toContain('status: FAILED');
    await expect(fs.readFile(result.logPath, 'utf8')).resolves.toContain('boom');
  });

  it('redacts stdout secrets from issue markdown and run log on successful runs', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const secret = 'OPENAI_API_KEY=sk-proj-success123';
    const result = await runIssueWithClaude({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      claude: fakeClaudeRunner({ exitCode: 0, stdout: `${secret}\nimplementation complete`, stderr: '' }),
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    const runLog = await fs.readFile(result.logPath, 'utf8');
    expect(updatedIssue).toContain('[REDACTED]');
    expect(updatedIssue).not.toContain(secret);
    expect(runLog).toContain('[REDACTED]');
    expect(runLog).not.toContain(secret);
  });

  it('redacts stderr secrets from issue markdown and run log on failed runs', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz';
    const result = await runIssueWithClaude({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      claude: fakeClaudeRunner({ exitCode: 1, stdout: '', stderr: `token: ${secret}\nfailed` }),
      now: new Date('2026-04-24T00:00:00.000Z'),
    });

    const updatedIssue = await fs.readFile(issuePath, 'utf8');
    const runLog = await fs.readFile(result.logPath, 'utf8');
    expect(updatedIssue).toContain('[REDACTED]');
    expect(updatedIssue).not.toContain(secret);
    expect(runLog).toContain('[REDACTED]');
    expect(runLog).not.toContain(secret);
  });

  it('rejects non-READY issues without invoking Claude', async () => {
    const vaultRoot = await tmpDir();
    const workingDir = await tmpDir();
    const issuePath = await writeReadyIssue(vaultRoot);
    await fs.writeFile(issuePath, (await fs.readFile(issuePath, 'utf8')).replace('status: READY', 'status: TODO'));
    const claude = fakeClaudeRunner();

    await expect(runIssueWithClaude({
      vaultRoot,
      issuePath,
      issueId: 'VC-001',
      workingDir,
      git: fakeGitRunner(),
      claude,
      now: new Date('2026-04-24T00:00:00.000Z'),
    })).rejects.toThrow('only READY issues can be run');
    expect(claude.calls).toEqual([]);
    await expect(readExecutionLock(path.join(vaultRoot, 'runtime', 'current.lock'))).resolves.toBeNull();
  });

  it('real Claude CLI runner delegates to the safe agent process primitive', async () => {
    vi.mocked(spawnAgentProcess).mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      command: ['claude', '-p', '@/tmp/prompt.md'],
    });
    const runner = createClaudeCliRunner({ executable: 'claude-test', timeoutMs: 1234 });

    await expect(runner.run('/tmp/prompt.md', '/tmp/worktree')).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'ok',
    });
    expect(spawnAgentProcess).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'claude-test',
      args: ['-p', '@/tmp/prompt.md'],
      cwd: '/tmp/worktree',
      timeoutMs: 1234,
      env: process.env,
    }));
  });

  it('creates an AgentRunner facade that delegates Claude CLI execution through the safe process primitive', async () => {
    vi.mocked(spawnAgentProcess).mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'agent ok',
      stderr: '',
      command: ['claude-agent', '-p', '@/tmp/prompt.md'],
    });
    const runner = createClaudeAgentRunner({ executable: 'claude-agent', timeoutMs: 5678 });

    expect(runner.backend).toBe('claude-code');
    await expect(runner.run({
      promptPath: '/tmp/prompt.md',
      cwd: '/tmp/worktree',
      timeoutMs: 1234,
    })).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'agent ok',
    });
    expect(spawnAgentProcess).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'claude-agent',
      args: ['-p', '@/tmp/prompt.md'],
      cwd: '/tmp/worktree',
      timeoutMs: 1234,
      env: process.env,
    }));
  });
});
