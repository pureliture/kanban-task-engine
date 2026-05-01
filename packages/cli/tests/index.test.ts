import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

const run = promisify(execFile);

const context = createCliContext({
  KANBAN_HOME: '/vault',
  HOME: '/home/user',
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createVault(options: { workingDir?: string; mergeInto?: string; executor?: string } = {}): Promise<string> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-'));
  await fs.mkdir(path.join(vaultRoot, 'issues', 'vibe-coding', 'kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, 'issues', 'openclaw'), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, 'registry.yaml'), `
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
`);
  await writeIssue(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-002.md', {
    id: 'VC-002',
    title: 'Lower priority ready',
    status: 'READY',
    priority: 'P2',
    project: 'kanban-task-engine',
    working_dir: options.workingDir ?? '/repo',
  });
  await writeIssue(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001.md', {
    id: 'VC-001',
    title: 'Top priority ready',
    status: 'READY',
    priority: 'P0',
    project: 'kanban-task-engine',
    working_dir: options.workingDir ?? '/repo',
    executor: options.executor ?? 'claude-code',
    merge_into: options.mergeInto ?? 'main',
  });
  await writeIssue(vaultRoot, 'issues/openclaw/OC-001.md', {
    id: 'OC-001',
    title: 'Done issue',
    status: 'DONE',
    priority: 'P3',
    project: '',
  });
  return vaultRoot;
}

async function writeIssue(vaultRoot: string, relativePath: string, frontmatter: Record<string, string>): Promise<void> {
  const lines = Object.entries({
    type: 'task',
    executor: 'claude-code',
    created: '2026-04-24',
    updated: '2026-04-24',
    labels: '[]',
    depends_on: '[]',
    run_count: '0',
    ...frontmatter,
  }).map(([key, value]) => `${key}: ${value}`);
  await fs.writeFile(path.join(vaultRoot, relativePath), `---\n${lines.join('\n')}\n---\n\n## 목적\nx\n`);
}

async function setIssueStatus(vaultRoot: string, issueId: string, status: string): Promise<string> {
  const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine', `${issueId}.md`);
  const content = await fs.readFile(issuePath, 'utf8');
  await fs.writeFile(issuePath, content.replace(/status: \w+/, `status: ${status}`));
  return issuePath;
}

async function removeIssueField(vaultRoot: string, issueId: string, field: string): Promise<string> {
  const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine', `${issueId}.md`);
  const content = await fs.readFile(issuePath, 'utf8');
  await fs.writeFile(issuePath, content.replace(new RegExp(`^${field}: .+\\n`, 'm'), ''));
  return issuePath;
}

async function createGitFixture(issueId: string, options: { commitOnKanbanBranch?: boolean } = {}): Promise<{
  originPath: string;
  repoPath: string;
  worktreePath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-git-'));
  const originPath = path.join(root, 'origin.git');
  const repoPath = path.join(root, 'repo');
  await run('git', ['init', '--bare', '--initial-branch=main', originPath]);
  await run('git', ['clone', originPath, repoPath]);
  await run('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com']);
  await run('git', ['-C', repoPath, 'config', 'user.name', 'Kanban Test']);
  await run('git', ['-C', repoPath, 'checkout', '-b', 'main']);
  await fs.writeFile(path.join(repoPath, 'README.md'), '# repo\n');
  await run('git', ['-C', repoPath, 'add', 'README.md']);
  await run('git', ['-C', repoPath, 'commit', '-m', 'initial']);
  await run('git', ['-C', repoPath, 'push', '-u', 'origin', 'main']);

  const worktreePath = path.join(repoPath, '.worktrees', 'kanban', issueId);
  await run('git', ['-C', repoPath, 'worktree', 'add', '-b', `kanban/${issueId}`, worktreePath, 'origin/main']);
  if (options.commitOnKanbanBranch) {
    await fs.writeFile(path.join(worktreePath, `${issueId}.txt`), `${issueId}\n`);
    await run('git', ['-C', worktreePath, 'add', `${issueId}.txt`]);
    await run('git', ['-C', worktreePath, 'commit', '-m', `${issueId} work`]);
  }

  return { originPath, repoPath, worktreePath };
}

async function pushOriginAheadCommit(originPath: string): Promise<void> {
  const updaterPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-origin-update-')), 'repo');
  await run('git', ['clone', originPath, updaterPath]);
  await run('git', ['-C', updaterPath, 'config', 'user.email', 'test@example.com']);
  await run('git', ['-C', updaterPath, 'config', 'user.name', 'Kanban Test']);
  await fs.writeFile(path.join(updaterPath, 'origin-ahead.txt'), 'origin ahead\n');
  await run('git', ['-C', updaterPath, 'add', 'origin-ahead.txt']);
  await run('git', ['-C', updaterPath, 'commit', '-m', 'origin ahead']);
  await run('git', ['-C', updaterPath, 'push', 'origin', 'main']);
}

async function createKanbanWorktreeFrom(
  repoPath: string,
  issueId: string,
  baseRef: string,
  options: { commitOnKanbanBranch?: boolean } = {},
): Promise<string> {
  const worktreePath = path.join(repoPath, '.worktrees', 'kanban', issueId);
  await run('git', ['-C', repoPath, 'worktree', 'add', '-b', `kanban/${issueId}`, worktreePath, baseRef]);
  if (options.commitOnKanbanBranch) {
    await fs.writeFile(path.join(worktreePath, `${issueId}.txt`), `${issueId}\n`);
    await run('git', ['-C', worktreePath, 'add', `${issueId}.txt`]);
    await run('git', ['-C', worktreePath, 'commit', '-m', `${issueId} work`]);
  }
  return worktreePath;
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await run('git', ['-C', cwd, ...args]);
  return result.stdout.trim();
}

describe('cli', () => {
  it('prints help', async () => {
    const result = await runCli(['--help'], context);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('run <issue-id>');
    expect(result.stdout).toContain('recover-run <issue-id>');
    expect(result.stdout).toContain('board');
  });

  it('rejects unknown commands', async () => {
    const result = await runCli(['wat'], context);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command: wat');
  });

  it('validates commands that require issue ids', async () => {
    const result = await runCli(['run'], context);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Usage: kanban run <issue-id>');
  });

  it('dispatches run with issue details from the vault', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['run', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('issue: VC-001');
    expect(result.stdout).toContain('working_dir: /repo');
    expect(result.stdout).toContain('merge_into: main');
  });

  it('runs the mock executor and updates issue state plus artifacts', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['run', 'VC-001', '--mock-executor'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: REVIEW');
    expect(await fs.readFile(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001.md'), 'utf8')).toContain('status: REVIEW');
    const runDate = new Date().toISOString().slice(0, 10);
    await expect(fs.readFile(path.join(vaultRoot, 'runs', runDate, 'VC-001', 'run-1.log'), 'utf8')).resolves.toContain('mock claude completed');
    await expect(fs.readFile(path.join(vaultRoot, 'runs', runDate, 'VC-001', 'run-1.json'), 'utf8')
      .then(JSON.parse)).resolves.toMatchObject({
        baseCommit: 'mock-base',
        headCommit: 'mock-head',
      });
  });

  it('runs mock executor for issue without merge_into using repository default branch', async () => {
    const vaultRoot = await createVault();
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-002.md');
    const result = await runCli(['run', 'VC-002', '--mock-executor'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: REVIEW');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: REVIEW');
  });

  it('records FAILED when the mock executor fails', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['run', 'VC-001', '--mock-executor', '--mock-fail'], createCliContext({ KANBAN_HOME: vaultRoot }));
    const issuePath = path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine/VC-001.md');
    const runDate = new Date().toISOString().slice(0, 10);
    const logPath = path.join(vaultRoot, 'runs', runDate, 'VC-001', 'run-1.log');
    const worktreePath = path.join('/repo', '.worktrees', 'kanban', 'VC-001');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: FAILED');
    expect(result.stdout).toContain(`worktreePath: ${worktreePath}`);
    expect(result.stdout).toContain('branchName: kanban/VC-001');
    expect(result.stdout).toContain(`artifactPath: ${logPath}`);
    expect(result.stdout).toContain('cleanupOwner: retry|abort');
    expect(result.stdout).toContain('kanban retry VC-001');
    expect(result.stdout).toContain('kanban abort VC-001 --discard');
    const issueLog = await fs.readFile(issuePath, 'utf8');
    expect(issueLog).toContain('status: FAILED');
    expect(issueLog).toContain(`worktreePath: ${worktreePath}`);
    expect(issueLog).toContain('branchName: kanban/VC-001');
    expect(issueLog).toContain(`artifactPath: ${logPath}`);
    expect(issueLog).toContain('cleanupOwner: retry|abort');
  });

  it('rejects run for non-ready issues', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['run', 'OC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('only READY issues can be run');
  });

  it('returns failure when execute issue is missing working_dir', async () => {
    const vaultRoot = await createVault();
    const issuePath = await removeIssueField(vaultRoot, 'VC-002', 'working_dir');

    const result = await runCli(['run', 'VC-002', '--execute'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Issue VC-002 does not define working_dir');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('approves a REVIEW issue to DONE with mock git', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');
    const result = await runCli(['approve', 'VC-001', '--mock-git'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: DONE');
    const updated = await fs.readFile(issuePath, 'utf8');
    expect(updated).toContain('status: DONE');
    expect(updated).toContain('completed:');
    expect(updated).toContain('Approved with mock git merge');
  });

  it('rejects approve unknown options before mutating the issue', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');

    const result = await runCli(['approve', 'VC-001', '--mock-gti'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option: --mock-gti');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: REVIEW');
  });

  it('approves a REVIEW issue with real git by ff-only merging and cleaning worktree', async () => {
    const { repoPath, worktreePath } = await createGitFixture('VC-001', { commitOnKanbanBranch: true });
    const vaultRoot = await createVault({ workingDir: repoPath });
    await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');
    const result = await runCli(['approve', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: DONE');
    await expect(fs.access(worktreePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(gitOutput(repoPath, ['branch', '--list', 'kanban/VC-001'])).resolves.toBe('');
    await expect(fs.readFile(path.join(repoPath, 'VC-001.txt'), 'utf8')).resolves.toBe('VC-001\n');
  });

  it('approves with fast-forward target update when local main is behind origin', async () => {
    const { originPath, repoPath } = await createGitFixture('VC-001');
    await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', path.join(repoPath, '.worktrees', 'kanban', 'VC-001')]);
    await run('git', ['-C', repoPath, 'branch', '-D', 'kanban/VC-001']);
    await pushOriginAheadCommit(originPath);
    await run('git', ['-C', repoPath, 'fetch', 'origin']);
    const worktreePath = await createKanbanWorktreeFrom(repoPath, 'VC-001', 'origin/main', { commitOnKanbanBranch: true });
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');

    const result = await runCli(['approve', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: DONE');
    await expect(fs.readFile(path.join(repoPath, 'origin-ahead.txt'), 'utf8')).resolves.toBe('origin ahead\n');
    await expect(fs.readFile(path.join(repoPath, 'VC-001.txt'), 'utf8')).resolves.toBe('VC-001\n');
    await expect(fs.access(worktreePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(gitOutput(repoPath, ['branch', '--list', 'kanban/VC-001'])).resolves.toBe('');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: DONE');
  });

  it('rejects approve stale-target branch when origin/main is ahead of the kanban base', async () => {
    const { originPath, repoPath } = await createGitFixture('VC-001');
    await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', path.join(repoPath, '.worktrees', 'kanban', 'VC-001')]);
    await run('git', ['-C', repoPath, 'branch', '-D', 'kanban/VC-001']);
    const worktreePath = await createKanbanWorktreeFrom(repoPath, 'VC-001', 'main', { commitOnKanbanBranch: true });
    await pushOriginAheadCommit(originPath);
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');

    const result = await runCli(['approve', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('approve failed');
    expect(result.stderr).toContain(`working_dir: ${repoPath}`);
    expect(result.stderr).toContain('merge_into: main');
    expect(result.stderr).toContain('base_ref: origin/main');
    expect(result.stderr).toContain('kanban_branch: kanban/VC-001');
    expect(result.stderr).toContain(`worktree_path: ${worktreePath}`);
    expect(result.stderr).toContain(`git -C ${repoPath} fetch origin --prune`);
    expect(result.stderr).toContain(`git -C ${repoPath} log --oneline --graph --decorate --max-count=20 main origin/main kanban/VC-001`);
    expect(result.stderr).toContain(`kanban/VC-001 is checked out in worktree: ${worktreePath}`);
    expect(result.stderr).toContain(`git -C ${worktreePath} rebase origin/main`);
    expect(result.stderr).not.toContain(`git -C ${repoPath} checkout kanban/VC-001`);
    expect(result.stderr).not.toContain(`git -C ${repoPath} rebase origin/main`);
    expect(result.stderr).toContain('kanban approve VC-001');
    expect(result.stderr).toContain('engine did not run rebase automatically');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: REVIEW');
    await expect(fs.access(worktreePath)).resolves.toBeUndefined();
  });

  it('rejects approve when local main diverges from origin/main and issue remains REVIEW', async () => {
    const { originPath, repoPath } = await createGitFixture('VC-001');
    await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', path.join(repoPath, '.worktrees', 'kanban', 'VC-001')]);
    await run('git', ['-C', repoPath, 'branch', '-D', 'kanban/VC-001']);
    await pushOriginAheadCommit(originPath);
    await fs.writeFile(path.join(repoPath, 'local-only.txt'), 'local only\n');
    await run('git', ['-C', repoPath, 'add', 'local-only.txt']);
    await run('git', ['-C', repoPath, 'commit', '-m', 'local diverged']);
    await run('git', ['-C', repoPath, 'fetch', 'origin']);
    const worktreePath = await createKanbanWorktreeFrom(repoPath, 'VC-001', 'origin/main', { commitOnKanbanBranch: true });
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');

    const result = await runCli(['approve', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('approve failed');
    expect(result.stderr).toContain(`working_dir: ${repoPath}`);
    expect(result.stderr).toContain('merge_into: main');
    expect(result.stderr).toContain('base_ref: origin/main');
    expect(result.stderr).toContain('kanban_branch: kanban/VC-001');
    expect(result.stderr).toContain(`worktree_path: ${worktreePath}`);
    expect(result.stderr).toContain('local target branch diverged from origin/main');
    expect(result.stderr).toContain('engine did not resolve local target divergence');
    expect(result.stderr).toContain(`git -C ${repoPath} fetch origin --prune`);
    expect(result.stderr).toContain(`git -C ${repoPath} log --oneline --graph --decorate --max-count=20 main origin/main kanban/VC-001`);
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: REVIEW');
  });

  it('aborts REVIEW and FAILED issues back to READY', async () => {
    const vaultRoot = await createVault();
    const reviewPath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');
    const failedPath = await setIssueStatus(vaultRoot, 'VC-002', 'FAILED');

    await expect(runCli(['abort', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }))).resolves.toMatchObject({ exitCode: 0 });
    await expect(runCli(['abort', 'VC-002', '--discard', '--mock-git'], createCliContext({ KANBAN_HOME: vaultRoot }))).resolves.toMatchObject({ exitCode: 0 });

    expect(await fs.readFile(reviewPath, 'utf8')).toContain('status: READY');
    expect(await fs.readFile(failedPath, 'utf8')).toContain('status: READY');
  });

  it('rejects abort unknown options before mutating the issue', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');

    const result = await runCli(['abort', 'VC-001', '--discard', '--unknown'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option: --unknown');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: FAILED');
  });

  it('aborts with real git discard when the kanban branch is already in origin target', async () => {
    const { repoPath, worktreePath } = await createGitFixture('VC-001');
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'REVIEW');

    const result = await runCli(['abort', 'VC-001', '--discard'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('discard: true');
    await expect(fs.access(worktreePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('aborts with real git discard even when the worktree is already gone', async () => {
    const { repoPath, worktreePath } = await createGitFixture('VC-001');
    await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath]);
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');

    const result = await runCli(['abort', 'VC-001', '--discard'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('discard: true');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('retries FAILED issues back to READY with mock git cleanup', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');
    const result = await runCli(['retry', 'VC-001', '--mock-git'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cleanup: forced');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('rejects retry unknown options before mutating the issue', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');

    const result = await runCli(['retry', 'VC-001', '--mock-gti'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option: --mock-gti');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: FAILED');
  });

  it('retries by force removing the worktree and branch with real git cleanup', async () => {
    const { repoPath, worktreePath } = await createGitFixture('VC-001', { commitOnKanbanBranch: true });
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');

    const result = await runCli(['retry', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cleanup: forced');
    await expect(fs.access(worktreePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(gitOutput(repoPath, ['branch', '--list', 'kanban/VC-001'])).resolves.toBe('');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('retries to READY even when the worktree and branch are already gone', async () => {
    const { repoPath, worktreePath } = await createGitFixture('VC-001');
    await run('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath]);
    await run('git', ['-C', repoPath, 'branch', '-D', 'kanban/VC-001']);
    const vaultRoot = await createVault({ workingDir: repoPath });
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'FAILED');

    const result = await runCli(['retry', 'VC-001'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cleanup: forced');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: READY');
  });

  it('recover-run moves stale RUNNING with missing lock to FAILED and logs reason', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale RUNNING after process crash',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('outcome: FAILED');
    expect(result.stdout).toContain('preserve_worktree: true');
    expect(result.stdout).toContain('worktreePath: /repo/.worktrees/kanban/VC-001');
    expect(result.stdout).toContain('branchName: kanban/VC-001');
    expect(result.stdout).toContain(`artifactPath: ${issuePath}`);
    expect(result.stdout).toContain('cleanupOwner: retry|abort');
    expect(result.stdout).toContain('kanban retry VC-001');
    expect(result.stdout).toContain('kanban abort VC-001 --discard');
    const updated = await fs.readFile(issuePath, 'utf8');
    expect(updated).toContain('status: FAILED');
    expect(updated).toContain('stale RUNNING after process crash');
    expect(updated).toContain('worktreePath: /repo/.worktrees/kanban/VC-001');
    expect(updated).toContain('branchName: kanban/VC-001');
    expect(updated).toContain(`artifactPath: ${issuePath}`);
    expect(updated).toContain('cleanupOwner: retry|abort');
  });

  it('recover-run releases stale RUNNING lock and preserves the worktree by default', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');
    const lockPath = path.join(vaultRoot, 'runtime', 'current.lock');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({
      issueId: 'VC-001',
      acquiredAt: '2000-01-01T00:00:00.000Z',
      pid: 123,
    }), 'utf8');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale RUNNING after process crash',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('preserve_worktree: true');
    await expect(fs.access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: FAILED');
  });

  it('recover-run releases a recent lock when the recorded pid is dead', async () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === 999_999 && signal === 0) {
        const error = new Error('No such process') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    });
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');
    const lockPath = path.join(vaultRoot, 'runtime', 'current.lock');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({
      issueId: 'VC-001',
      acquiredAt: new Date().toISOString(),
      pid: 999_999,
    }), 'utf8');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'process crashed but lock is recent',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(0);
    expect(processKill).toHaveBeenCalledWith(999_999, 0);
    await expect(fs.access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: FAILED');
  });

  it('recover-run rejects a stale lock when the recorded pid is still alive', async () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');
    const lockPath = path.join(vaultRoot, 'runtime', 'current.lock');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({
      issueId: 'VC-001',
      acquiredAt: '2000-01-01T00:00:00.000Z',
      pid: 999_998,
    }), 'utf8');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale timestamp but process alive',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('active execution lock');
    expect(processKill).toHaveBeenCalledWith(999_998, 0);
    await expect(fs.access(lockPath)).resolves.toBeUndefined();
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: RUNNING');
  });

  it('recover-run fails on active lock and keeps issue RUNNING', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');
    const lockPath = path.join(vaultRoot, 'runtime', 'current.lock');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({
      issueId: 'VC-001',
      acquiredAt: new Date().toISOString(),
      pid: process.pid,
    }), 'utf8');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale RUNNING after process crash',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('active execution lock');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: RUNNING');
    await expect(fs.access(lockPath)).resolves.toBeUndefined();
  });

  it('recover-run rejects stale lock owned by another issue and preserves lock', async () => {
    const vaultRoot = await createVault();
    const issuePath = await setIssueStatus(vaultRoot, 'VC-001', 'RUNNING');
    const lockPath = path.join(vaultRoot, 'runtime', 'current.lock');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({
      issueId: 'VC-002',
      acquiredAt: '2000-01-01T00:00:00.000Z',
      pid: 123,
    }), 'utf8');

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale RUNNING after process crash',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('VC-002');
    expect(await fs.readFile(issuePath, 'utf8')).toContain('status: RUNNING');
    await expect(fs.readFile(lockPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      issueId: 'VC-002',
    });
  });

  it('recover-run rejects non-RUNNING issue', async () => {
    const vaultRoot = await createVault();

    const result = await runCli([
      'recover-run',
      'VC-001',
      '--reason',
      'stale RUNNING after process crash',
    ], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('only RUNNING issues can be recovered');
  });

  it('rejects retry for TODO issues', async () => {
    const vaultRoot = await createVault();
    await setIssueStatus(vaultRoot, 'VC-001', 'TODO');
    const result = await runCli(['retry', 'VC-001', '--mock-git'], createCliContext({ KANBAN_HOME: vaultRoot }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('only REVIEW or FAILED issues can be retried');
  });

  it('selects the highest-priority READY issue', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['next'], createCliContext({ KANBAN_HOME: vaultRoot }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('VC-001 Top priority ready');
  });

  it('sync reports issue counts from the vault', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['sync'], createCliContext({ KANBAN_HOME: vaultRoot }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('issues: 3');
    expect(result.stdout).toContain('READY: 2');
    expect(result.stdout).toContain('DONE: 1');
  });

  it('renders a board from the vault', async () => {
    const vaultRoot = await createVault();
    const result = await runCli(['board'], createCliContext({ KANBAN_HOME: vaultRoot }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('<!-- GENERATED BY kanban-task-engine. DO NOT EDIT DIRECTLY. -->');
    expect(result.stdout).toContain('## READY');
    expect(result.stdout).toContain('[Top priority ready](issues/vibe-coding/kanban-task-engine/VC-001.md)');
  });
});
