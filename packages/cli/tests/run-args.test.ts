import { describe, expect, it } from 'vitest';
import { createCliContext } from '../src/context';
import { runCli } from '../src';
import { parseRunArgs, resolveRunBackend } from '../src/commands/run';

describe('parseRunArgs', () => {
  it('parses inspect-only run', () => {
    expect(parseRunArgs(['VC-001'])).toEqual({
      ok: true,
      mode: { kind: 'inspect', issueId: 'VC-001' },
    });
  });

  it('defaults execute backend to claude-code', () => {
    expect(parseRunArgs(['VC-001', '--execute'])).toEqual({
      ok: true,
      mode: { kind: 'execute', issueId: 'VC-001', backend: 'claude-code', mockFail: false },
    });
  });

  it('parses --execute --agent codex', () => {
    expect(parseRunArgs(['VC-001', '--execute', '--agent', 'codex'])).toEqual({
      ok: true,
      mode: { kind: 'execute', issueId: 'VC-001', backend: 'codex', mockFail: false },
    });
  });

  it('rejects --agent without --execute', () => {
    expect(parseRunArgs(['VC-001', '--agent', 'codex'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('--agent requires --execute'),
    });
  });

  it('rejects unknown backend', () => {
    expect(parseRunArgs(['VC-001', '--execute', '--agent', 'wat'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('Unknown agent backend: wat'),
    });
  });

  it('rejects --execute with --mock-executor conflict', () => {
    expect(parseRunArgs(['VC-001', '--execute', '--mock-executor'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('--execute cannot be combined with --mock-executor'),
    });
  });

  it('maps --mock-executor to mock backend without real git', () => {
    expect(parseRunArgs(['VC-001', '--mock-executor'])).toEqual({
      ok: true,
      mode: { kind: 'execute', issueId: 'VC-001', backend: 'mock', mockFail: false },
    });
  });

  it('rejects extra positional args', () => {
    expect(parseRunArgs(['VC-001', 'VC-002'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('Unexpected argument: VC-002'),
    });
  });

  it('returns parser errors before vault lookup', async () => {
    const result = await runCli(['run', 'VC-001', '--agent', 'codex'], createCliContext({}));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--agent requires --execute');
    expect(result.stderr).not.toContain('KANBAN_HOME');
  });

  it('resolves run backend as CLI --agent over issue executor over claude-code default', () => {
    expect(resolveRunBackend({ cliAgent: 'codex', issueExecutor: 'claude-code' })).toEqual({
      ok: true,
      backend: 'codex',
    });
    expect(resolveRunBackend({ issueExecutor: 'codex' })).toEqual({
      ok: true,
      backend: 'codex',
    });
    expect(resolveRunBackend({})).toEqual({
      ok: true,
      backend: 'claude-code',
    });
  });

  it('rejects unknown issue executor before mutation', () => {
    expect(resolveRunBackend({ issueExecutor: 'wat' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('Unknown issue executor: wat'),
    });
  });
});
