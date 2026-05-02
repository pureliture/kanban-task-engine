import fs from 'fs/promises';
import path from 'path';
import { AgentRunInput, AgentRunResult, AgentRunner } from './agent-runner.js';
import { spawnAgentProcess } from './agent-process.js';
import { redactSecrets } from './redaction.js';

export interface CodexCliRunnerOptions {
  executable?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function createCodexCliRunner(options: CodexCliRunnerOptions = {}): AgentRunner {
  return {
    backend: 'codex',
    async run(input) {
      return runCodexCli(input, options);
    },
  };
}

async function runCodexCli(input: AgentRunInput, options: CodexCliRunnerOptions): Promise<AgentRunResult> {
  let prompt: string;
  try {
    prompt = await fs.readFile(input.promptPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {
        exitCode: 127,
        stdout: '',
        stderr: error.message,
        timedOut: false,
        command: [options.executable ?? 'codex', 'exec'],
      };
    }
    throw error;
  }

  if (!prompt.trim()) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'Prompt is empty.',
      timedOut: false,
      command: [options.executable ?? 'codex', 'exec'],
    };
  }

  const lastMessagePath = input.lastMessagePath ?? path.join(input.cwd, '.kanban-codex-last-message.md');
  await fs.mkdir(path.dirname(lastMessagePath), { recursive: true });
  const args = [
    'exec',
    '-',
    '-C',
    input.cwd,
    '--sandbox',
    'workspace-write',
    '-c',
    'approval_policy=never',
    '--json',
    '--color',
    'never',
    '--ephemeral',
    '--output-last-message',
    lastMessagePath,
  ];

  try {
    const result = await spawnAgentProcess({
      executable: options.executable ?? 'codex',
      args,
      cwd: input.cwd,
      stdin: prompt,
      timeoutMs: input.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: process.env,
    });

    let ndjsonPath: string | undefined;
    if (input.ndjsonPath) {
      await fs.mkdir(path.dirname(input.ndjsonPath), { recursive: true });
      const redacted = redactSecrets(result.stdout);
      await fs.writeFile(input.ndjsonPath, redacted.endsWith('\n') ? redacted : `${redacted}\n`, 'utf8');
      ndjsonPath = input.ndjsonPath;
    }
    const createdLastMessagePath = await redactLastMessageIfPresent(lastMessagePath);

    return {
      ...result,
      ndjsonPath,
      lastMessagePath: createdLastMessagePath,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {
        exitCode: 127,
        stdout: '',
        stderr: error.message,
        timedOut: false,
        command: [options.executable ?? 'codex', ...args],
      };
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function redactLastMessageIfPresent(lastMessagePath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(lastMessagePath, 'utf8');
    await fs.writeFile(lastMessagePath, redactSecrets(content), 'utf8');
    return lastMessagePath;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
