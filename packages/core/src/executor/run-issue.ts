import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { AgentRunResult, AgentRunner } from './agent-runner.js';
import { addAll, commitAll, getStatusPorcelain, GitRunner, revParse } from './git.js';
import { acquireExecutionLock } from './lock.js';
import { buildExecutionPrompt } from './prompt-assembler.js';
import { redactSecrets } from './redaction.js';
import {
  appendRunEvent as defaultAppendRunEvent,
  getRunArtifactPaths,
  nextRunNumber,
  RunMetadata,
  writeRunLog as defaultWriteRunLog,
  writeRunMetadata as defaultWriteRunMetadata,
} from './run-artifacts.js';
import { createKanbanWorktree, getKanbanBranchName } from './worktree.js';

export interface RunIssueArtifactWriters {
  writeRunLog: typeof defaultWriteRunLog;
  writeRunMetadata: typeof defaultWriteRunMetadata;
  appendRunEvent: typeof defaultAppendRunEvent;
}

export interface RunIssueWithAgentInput {
  vaultRoot: string;
  issuePath: string;
  issueId: string;
  workingDir: string;
  git: GitRunner;
  agent: AgentRunner;
  now?: Date;
  baseRef?: string;
  fetch?: boolean;
  staleLockMs?: number;
  artifacts?: Partial<RunIssueArtifactWriters>;
}

export interface RunIssueWithAgentResult {
  issueId: string;
  outcome: 'REVIEW' | 'FAILED';
  runNumber: number;
  logPath: string;
  metadataPath: string;
  worktreePath: string;
}

type Frontmatter = Record<string, unknown>;
type RunOutcome = RunIssueWithAgentResult['outcome'];
type AgentRunMetadata = RunMetadata & { backend: AgentRunner['backend'] };

const CHECKPOINT_COMMIT_BODY = 'Created by kanban-task-engine run lifecycle.';

export async function runIssueWithAgent(input: RunIssueWithAgentInput): Promise<RunIssueWithAgentResult> {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const date = startedAt.slice(0, 10);
  const lockPath = path.join(input.vaultRoot, 'runtime', 'current.lock');
  const lock = await acquireExecutionLock(lockPath, { issueId: input.issueId, pid: process.pid }, {
    now,
    staleMs: input.staleLockMs,
  });

  try {
    const original = await readIssueDocument(input.issuePath);
    if (String(original.frontmatter.id) !== input.issueId) {
      throw new Error(`Issue id mismatch: expected ${input.issueId}, found ${String(original.frontmatter.id)}`);
    }
    if (original.frontmatter.status !== 'READY') {
      throw new Error(`Issue ${input.issueId} is ${String(original.frontmatter.status)}; only READY issues can be run`);
    }

    const runNumber = await nextRunNumber(input.vaultRoot, date, input.issueId);
    const runCount = Number(original.frontmatter.run_count ?? 0) + 1;
    const artifactPaths = getRunArtifactPaths(input.vaultRoot, date, input.issueId, runNumber);
    let logPath = artifactPaths.logPath;
    let metadataPath = artifactPaths.metadataPath;
    let worktreePath = '';
    let baseCommit: string | undefined;
    let headCommit: string | undefined;
    let agentResult: AgentRunResult | undefined;
    let outcome: RunOutcome = 'FAILED';
    let failureReason: string | undefined;

    await writeIssueDocument(input.issuePath, {
      ...original.frontmatter,
      status: 'RUNNING',
      run_count: runCount,
      updated: startedAt,
    }, original.body);

    try {
      const worktree = await createKanbanWorktree({
        runner: input.git,
        workingDir: input.workingDir,
        issueId: input.issueId,
        baseRef: input.baseRef ?? 'origin/main',
        fetch: input.fetch,
      });
      worktreePath = worktree.worktreePath;
      baseCommit = await revParse(input.git, worktreePath, 'HEAD');

      const promptPath = await writePrompt(input.vaultRoot, date, input.issueId, runNumber, original.raw);
      agentResult = await runAgentSafely(input.agent, {
        promptPath,
        cwd: worktreePath,
        ndjsonPath: artifactPaths.ndjsonPath,
        lastMessagePath: artifactPaths.lastMessagePath,
      });

      if (agentResult.exitCode === 0) {
        const status = await getStatusPorcelain(input.git, worktreePath);
        if (!status.trim()) {
          failureReason = 'Agent exited zero but produced no file changes.';
        } else {
          try {
            await addAll(input.git, worktreePath);
            await commitAll(input.git, worktreePath, `${input.issueId} checkpoint`, CHECKPOINT_COMMIT_BODY);
            headCommit = await revParse(input.git, worktreePath, 'HEAD');
            if (headCommit === baseCommit) {
              failureReason = 'Checkpoint commit did not advance HEAD.';
            } else {
              outcome = 'REVIEW';
            }
          } catch (error) {
            failureReason = `Checkpoint commit failed: ${errorMessage(error)}`;
          }
        }
      }
    } catch (error) {
      failureReason = `Run lifecycle failed: ${errorMessage(error)}`;
    }

    const completedAt = (input.now ?? new Date()).toISOString();
    const finalAgentResult = agentResult ?? {
      exitCode: 1,
      stdout: '',
      stderr: failureReason ?? 'Run lifecycle failed before agent completed.',
      timedOut: false,
    };
    let metadata: AgentRunMetadata = {
      issueId: input.issueId,
      runNumber,
      startedAt,
      completedAt,
      outcome,
      acceptanceRatio: countAcceptance(original.body),
      backend: input.agent.backend,
      baseCommit,
      headCommit,
      worktreePath,
      logPath,
      command: finalAgentResult.command,
      exitCode: finalAgentResult.exitCode,
      timedOut: finalAgentResult.timedOut ?? false,
      ndjsonPath: finalAgentResult.ndjsonPath,
      lastMessagePath: finalAgentResult.lastMessagePath,
    };

    const artifacts = {
      writeRunLog: defaultWriteRunLog,
      writeRunMetadata: defaultWriteRunMetadata,
      appendRunEvent: defaultAppendRunEvent,
      ...input.artifacts,
    };

    try {
      logPath = await artifacts.writeRunLog(
        input.vaultRoot,
        date,
        metadata,
        formatRunLog(finalAgentResult, failureReason),
      );
      metadata = { ...metadata, logPath };
      metadataPath = await artifacts.writeRunMetadata(input.vaultRoot, date, metadata);
    } catch (error) {
      outcome = 'FAILED';
      failureReason = `Artifact writing failed: ${errorMessage(error)}`;
      metadata = { ...metadata, outcome, logPath };
      try {
        logPath = await artifacts.writeRunLog(
          input.vaultRoot,
          date,
          metadata,
          formatRunLog(finalAgentResult, failureReason),
        );
        metadata = { ...metadata, logPath };
      } catch {
        // Keep final issue convergence independent of artifact durability.
      }
      try {
        metadataPath = await artifacts.writeRunMetadata(input.vaultRoot, date, metadata);
      } catch {
        // The issue log below records the artifact failure when metadata cannot be rewritten.
      }
    }

    const writeFinalIssueState = async () => {
      const latest = await readIssueDocument(input.issuePath);
      await writeIssueDocument(input.issuePath, {
        ...latest.frontmatter,
        status: outcome,
        run_count: runCount,
        updated: completedAt,
      }, appendLog(latest.body, formatIssueLogEntry({
        at: completedAt,
        issueId: input.issueId,
        outcome,
        result: finalAgentResult,
        logPath,
        worktreePath,
        failureReason,
      })));
    };

    await writeFinalIssueState();

    try {
      await artifacts.appendRunEvent(input.vaultRoot, date, {
        type: 'issue.run',
        issueId: input.issueId,
        runNumber,
        backend: input.agent.backend,
        outcome,
        at: completedAt,
        logPath,
        metadataPath,
      });
    } catch (error) {
      outcome = 'FAILED';
      failureReason = `Artifact writing failed: ${errorMessage(error)}`;
      metadata = { ...metadata, outcome, logPath };
      try {
        logPath = await artifacts.writeRunLog(
          input.vaultRoot,
          date,
          metadata,
          formatRunLog(finalAgentResult, failureReason),
        );
        metadata = { ...metadata, logPath };
      } catch {
        // The final issue log below records the event failure when log rewrite is unavailable.
      }
      try {
        metadataPath = await artifacts.writeRunMetadata(input.vaultRoot, date, metadata);
      } catch {
        // The final issue log below records the event failure when metadata cannot be rewritten.
      }
      await writeFinalIssueState();
      try {
        await artifacts.appendRunEvent(input.vaultRoot, date, {
          type: 'issue.run',
          issueId: input.issueId,
          runNumber,
          backend: input.agent.backend,
          outcome,
          at: completedAt,
          logPath,
          metadataPath,
        });
      } catch {
        // Best-effort final event rewrite; final issue status has already converged.
      }
    }

    return {
      issueId: input.issueId,
      outcome,
      runNumber,
      logPath,
      metadataPath,
      worktreePath,
    };
  } finally {
    await lock.release();
  }
}

async function runAgentSafely(agent: AgentRunner, input: Parameters<AgentRunner['run']>[0]): Promise<AgentRunResult> {
  try {
    return await agent.run(input);
  } catch (error) {
    return { exitCode: 1, stdout: '', stderr: errorMessage(error) };
  }
}

async function writePrompt(vaultRoot: string, date: string, issueId: string, runNumber: number, issueMarkdown: string): Promise<string> {
  const promptDir = path.join(vaultRoot, 'runtime', 'prompts', date);
  const promptPath = path.join(promptDir, `${issueId}-run-${runNumber}.md`);
  await fs.mkdir(promptDir, { recursive: true });
  await fs.writeFile(promptPath, buildExecutionPrompt({ issueId, issueMarkdown }), 'utf8');
  return promptPath;
}

async function readIssueDocument(issuePath: string): Promise<{ raw: string; frontmatter: Frontmatter; body: string }> {
  const raw = await fs.readFile(issuePath, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    throw new Error(`Missing YAML frontmatter: ${issuePath}`);
  }

  const parsed = YAML.parse(match[1]);
  if (!isRecord(parsed)) {
    throw new Error(`Frontmatter must be an object: ${issuePath}`);
  }

  return {
    raw,
    frontmatter: parsed,
    body: normalized.slice(match[0].length),
  };
}

async function writeIssueDocument(issuePath: string, frontmatter: Frontmatter, body: string): Promise<void> {
  const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${body.trimStart()}`;
  await fs.writeFile(issuePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function countAcceptance(body: string): { total: number; checked: number } {
  const section = body.match(/^## Acceptance Criteria\s*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/m)?.[1] ?? '';
  const total = section.match(/^\s*-\s+\[[ xX]\]/gm)?.length ?? 0;
  const checked = section.match(/^\s*-\s+\[[xX]\]/gm)?.length ?? 0;
  return { total, checked };
}

function appendLog(body: string, entry: string): string {
  const normalized = body.trimEnd();
  if (/^## 로그\s*$/m.test(normalized)) {
    return `${normalized}\n\n${entry}\n`;
  }
  return `${normalized}\n\n## 로그\n\n${entry}\n`;
}

function formatIssueLogEntry(input: {
  at: string;
  issueId: string;
  outcome: RunOutcome;
  result: AgentRunResult;
  logPath: string;
  worktreePath: string;
  failureReason?: string;
}): string {
  const { at, issueId, outcome, result, logPath, worktreePath, failureReason } = input;
  const summary = failureReason
    ?? (result.exitCode === 0
      ? firstNonEmptyLine(result.stdout) ?? 'Agent runner completed successfully.'
      : firstNonEmptyLine(result.stderr) ?? 'Agent runner failed.');
  const lines = [
    `### ${at} run -> ${outcome}`,
    '',
    `- exitCode: ${result.exitCode}`,
    `- summary: ${summary}`,
    `- artifact: ${logPath}`,
  ];
  if (outcome === 'FAILED') {
    lines.push(
      `- worktreePath: ${worktreePath || '<unknown>'}`,
      `- branchName: ${getKanbanBranchName(issueId)}`,
      `- artifactPath: ${logPath}`,
      '- cleanupOwner: retry|abort',
      `- cleanupGuidance: inspect artifactPath, then choose kanban retry ${issueId} or kanban abort ${issueId} --discard`,
    );
  }
  return redactSecrets(lines.join('\n'));
}

function formatRunLog(result: AgentRunResult, failureReason?: string): string {
  return [
    `exitCode: ${result.exitCode}`,
    failureReason ? `lifecycle: ${failureReason}` : '',
    '',
    '## stdout',
    result.stdout.trimEnd(),
    '',
    '## stderr',
    result.stderr.trimEnd(),
    '',
  ].join('\n');
}

function firstNonEmptyLine(input: string): string | null {
  return input.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
