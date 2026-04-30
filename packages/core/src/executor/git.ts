import { spawn } from 'child_process';

export interface GitRunOptions {
  cwd: string;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(args: string[], exitCode: number, result: GitRunResult) {
    super(`git ${args.join(' ')} failed with exit code ${exitCode}: ${result.stderr.trim()}`);
    this.name = 'GitCommandError';
    this.exitCode = exitCode;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}

export interface GitRunner {
  run(args: string[], options: GitRunOptions): Promise<GitRunResult>;
}

export function createNodeGitRunner(): GitRunner {
  return {
    run(args, options) {
      return new Promise((resolve, reject) => {
        const child = spawn('git', args, { cwd: options.cwd });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];

        child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
        child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
        child.on('error', reject);
        child.on('close', code => {
          const result = {
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
          };
          if (code === 0) {
            resolve(result);
          } else {
            reject(new GitCommandError(args, code ?? 1, result));
          }
        });
      });
    },
  };
}

export async function fetchOrigin(runner: GitRunner, repoPath: string): Promise<void> {
  await runner.run(['fetch', 'origin', '--prune'], { cwd: repoPath });
}

export async function checkoutBranch(runner: GitRunner, repoPath: string, branchName: string): Promise<void> {
  await runner.run(['checkout', branchName], { cwd: repoPath });
}

export async function getDefaultBranch(runner: GitRunner, repoPath: string): Promise<string> {
  const result = await runner.run(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], { cwd: repoPath });
  const branch = result.stdout.trim().replace(/^origin\//, '');
  if (!branch) {
    throw new Error('Unable to resolve origin default branch');
  }
  return branch;
}

export async function createWorktreeBranch(
  runner: GitRunner,
  repoPath: string,
  branchName: string,
  worktreePath: string,
  baseRef: string,
): Promise<void> {
  await runner.run(['worktree', 'add', '-b', branchName, worktreePath, baseRef], { cwd: repoPath });
}

export async function removeWorktree(runner: GitRunner, repoPath: string, worktreePath: string, force = true): Promise<void> {
  await runner.run(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], { cwd: repoPath });
}

export async function deleteBranch(runner: GitRunner, repoPath: string, branchName: string, force = true): Promise<void> {
  await runner.run(['branch', force ? '-D' : '-d', branchName], { cwd: repoPath });
}

export async function mergeFfOnly(runner: GitRunner, repoPath: string, branchName: string): Promise<void> {
  await runner.run(['merge', '--ff-only', branchName], { cwd: repoPath });
}

export async function getStatusPorcelain(runner: GitRunner, repoPath: string): Promise<string> {
  const result = await runner.run(['status', '--porcelain'], { cwd: repoPath });
  return result.stdout;
}

export async function revParse(runner: GitRunner, repoPath: string, ref = 'HEAD'): Promise<string> {
  const result = await runner.run(['rev-parse', ref], { cwd: repoPath });
  return result.stdout.trim();
}

export async function addAll(runner: GitRunner, repoPath: string): Promise<void> {
  await runner.run(['add', '-A'], { cwd: repoPath });
}

export async function commitAll(runner: GitRunner, repoPath: string, message: string, body: string): Promise<void> {
  await runner.run([
    '-c',
    'user.name=Kanban Engine',
    '-c',
    'user.email=kanban-engine@example.invalid',
    'commit',
    '-m',
    message,
    '-m',
    body,
  ], { cwd: repoPath });
}

export async function isAncestor(
  runner: GitRunner,
  repoPath: string,
  ancestorRef: string,
  descendantRef: string,
): Promise<boolean> {
  try {
    await runner.run(['merge-base', '--is-ancestor', ancestorRef, descendantRef], { cwd: repoPath });
    return true;
  } catch (error) {
    if (error instanceof GitCommandError && error.exitCode === 1) {
      return false;
    }
    throw error;
  }
}
