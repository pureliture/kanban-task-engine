import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnAgentProcess } from '../../src/executor/agent-process';
import { createCodexCliRunner } from '../../src/executor/codex-runner';

vi.mock('../../src/executor/agent-process', () => ({
  spawnAgentProcess: vi.fn(),
}));

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kanban-codex-runner-'));
}

async function writePrompt(dir: string, content = 'run this issue'): Promise<string> {
  const promptPath = path.join(dir, 'prompt.md');
  await fs.writeFile(promptPath, content, 'utf8');
  return promptPath;
}

describe('createCodexCliRunner', () => {
  beforeEach(() => {
    vi.mocked(spawnAgentProcess).mockReset();
    vi.mocked(spawnAgentProcess).mockResolvedValue({
      exitCode: 0,
      stdout: '{"type":"message"}\n',
      stderr: '',
      command: ['codex', 'exec'],
    });
  });

  it('runs codex exec with stdin prompt and workspace root', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd, 'prompt body');
    const runner = createCodexCliRunner();

    await runner.run({ promptPath, cwd, lastMessagePath: path.join(cwd, 'last.md') });

    expect(spawnAgentProcess).toHaveBeenCalledWith(expect.objectContaining({
      executable: 'codex',
      cwd,
      stdin: 'prompt body',
    }));
    expect(vi.mocked(spawnAgentProcess).mock.calls[0]?.[0].args.slice(0, 4)).toEqual([
      'exec',
      '-',
      '-C',
      cwd,
    ]);
  });

  it('uses --sandbox workspace-write and approval_policy never', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);

    await createCodexCliRunner().run({ promptPath, cwd, lastMessagePath: path.join(cwd, 'last.md') });

    const args = vi.mocked(spawnAgentProcess).mock.calls[0]?.[0].args ?? [];
    expect(args).toContain('--sandbox');
    expect(args).toContain('workspace-write');
    expect(args).toContain('-c');
    expect(args).toContain('approval_policy=never');
    expect(args).not.toContain('approval_policy="never"');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('returns a failed result without spawning when the prompt is empty', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd, '   \n');

    await expect(createCodexCliRunner().run({
      promptPath,
      cwd,
      lastMessagePath: path.join(cwd, 'last.md'),
    })).resolves.toMatchObject({
      exitCode: 2,
      stderr: 'Prompt is empty.',
    });
    expect(spawnAgentProcess).not.toHaveBeenCalled();
  });

  it('maps missing prompt files to a failed result without spawning', async () => {
    const cwd = await tmpDir();
    const promptPath = path.join(cwd, 'missing.md');

    await expect(createCodexCliRunner().run({
      promptPath,
      cwd,
      lastMessagePath: path.join(cwd, 'last.md'),
    })).resolves.toMatchObject({
      exitCode: 127,
    });
    expect(vi.mocked(spawnAgentProcess).mock.calls).toHaveLength(0);
  });

  it('writes --output-last-message artifact path', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    const lastMessagePath = path.join(cwd, 'nested', 'run.last-message.md');

    await createCodexCliRunner().run({ promptPath, cwd, lastMessagePath });

    const args = vi.mocked(spawnAgentProcess).mock.calls[0]?.[0].args ?? [];
    expect(args).toContain('--output-last-message');
    expect(args).toContain(lastMessagePath);
    expect((await fs.stat(path.dirname(lastMessagePath))).isDirectory()).toBe(true);
  });

  it('captures JSONL stdout into ndjson artifact', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    const ndjsonPath = path.join(cwd, 'run.ndjson');
    const secret = 'sk-proj-secret123';
    vi.mocked(spawnAgentProcess).mockResolvedValueOnce({
      exitCode: 0,
      stdout: `{"type":"started","token":"${secret}"}\n{"type":"done"}\n`,
      stderr: '',
      command: ['codex', 'exec'],
    });

    const result = await createCodexCliRunner().run({
      promptPath,
      cwd,
      ndjsonPath,
      lastMessagePath: path.join(cwd, 'last.md'),
    });

    const content = await fs.readFile(ndjsonPath, 'utf8');
    expect(content).not.toContain(secret);
    expect(content).toContain('[REDACTED]');
    expect(result.ndjsonPath).toBe(ndjsonPath);
  });

  it('redacts --output-last-message artifact and only returns path when the file exists', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    const lastMessagePath = path.join(cwd, 'run.last-message.md');
    const secret = 'sk-proj-secret123';
    vi.mocked(spawnAgentProcess).mockImplementationOnce(async input => {
      const outputIndex = input.args.indexOf('--output-last-message');
      await fs.writeFile(input.args[outputIndex + 1], `done with ${secret}\n`, 'utf8');
      return {
        exitCode: 0,
        stdout: '{"type":"done"}\n',
        stderr: '',
        command: ['codex', 'exec'],
      };
    });

    const result = await createCodexCliRunner().run({ promptPath, cwd, lastMessagePath });

    const content = await fs.readFile(lastMessagePath, 'utf8');
    expect(content).not.toContain(secret);
    expect(content).toContain('[REDACTED]');
    expect(result.lastMessagePath).toBe(lastMessagePath);
  });

  it('does not return lastMessagePath when codex does not create the file', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    const lastMessagePath = path.join(cwd, 'missing.last-message.md');

    const result = await createCodexCliRunner().run({ promptPath, cwd, lastMessagePath });

    expect(result.lastMessagePath).toBeUndefined();
  });

  it('maps ENOENT to exitCode 127', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    const error = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    vi.mocked(spawnAgentProcess).mockRejectedValueOnce(error);

    await expect(createCodexCliRunner().run({
      promptPath,
      cwd,
      lastMessagePath: path.join(cwd, 'last.md'),
    })).resolves.toMatchObject({
      exitCode: 127,
      stderr: 'spawn codex ENOENT',
    });
  });

  it('maps timeout to exitCode 124', async () => {
    const cwd = await tmpDir();
    const promptPath = await writePrompt(cwd);
    vi.mocked(spawnAgentProcess).mockResolvedValueOnce({
      exitCode: 124,
      stdout: '',
      stderr: '',
      timedOut: true,
      command: ['codex', 'exec'],
    });

    await expect(createCodexCliRunner().run({
      promptPath,
      cwd,
      lastMessagePath: path.join(cwd, 'last.md'),
    })).resolves.toMatchObject({
      exitCode: 124,
      timedOut: true,
    });
  });
});
