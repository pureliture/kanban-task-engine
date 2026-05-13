import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-board-'));
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/vibe-coding/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
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
  await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-ready.md'), `---
id: VC-001
title: Ready item
type: task
status: READY
priority: P1
executor: human
project: kanban-task-engine
created: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
labels: []
depends_on: []
run_count: 0
---

# Ready item

## 목적
x

## 컨텍스트
x

## Acceptance Criteria
x

## 실행 힌트
x

## 로그
x
`);
  return vault;
}

describe('Obsidian board CLI', () => {
  it('keeps the legacy stdout board for bare board', async () => {
    const vault = await createVault();
    const result = await runCli(['board'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('type: kanban-board');
    expect(result.stdout).toContain('- [Ready item](issues/vibe-coding/kanban-task-engine/VC-001-ready.md) `P1` <!-- VC-001 -->');
    expect(result.stdout).not.toContain('kanban-plugin: board');
  });

  it('prints one Obsidian board for --space without writing files', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--space', 'vibe-coding'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kanban-plugin: board');
    expect(result.stdout).toContain('VC-001 Ready item');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes board and index for --write --space', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--space', 'vibe-coding'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wrote vibe-coding board: boards/vibe-coding.md');
    expect(result.stdout).toContain('wrote vibe-coding index: boards/vibe-coding-epics.md');
    expect(result.stdout).toContain('issues: 1');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-task-engine:id=VC-001');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding-epics.md'), 'utf8')).resolves.toContain('```dataview');
  });

  it('reports partial target writes when one projection target fails', async () => {
    const vault = await createVault();
    const registryPath = path.join(vault, 'registry.yaml');
    const original = await fs.readFile(registryPath, 'utf8');
    await fs.writeFile(registryPath, original.replace('epicBoard: boards/vibe-coding-epics.md', 'epicBoard: boards'));
    const result = await runCli(['board', '--write', '--space', 'vibe-coding'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('board projection write failed');
    expect(result.stderr).toContain('succeeded vibe-coding board: boards/vibe-coding.md');
    expect(result.stderr).toContain('failed vibe-coding index: boards');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).resolves.toContain('kanban-plugin: board');
  });

  it('writes every space for --write --all', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--all'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wrote vibe-coding board: boards/vibe-coding.md');
    expect(result.stdout).toContain('wrote vibe-coding index: boards/vibe-coding-epics.md');
  });

  it('rejects write without explicit KANBAN_HOME', async () => {
    const result = await runCli(['board', '--write', '--all'], createCliContext({ HOME: '/home/user' }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects invalid argument combinations', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault });

    await expect(runCli(['board', '--space'], context)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('Missing value for --space'),
    });
    await expect(runCli(['board', '--wat'], context)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('Unknown option: --wat'),
    });
    await expect(runCli(['board', '--all'], context)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('--all requires --write'),
    });
    await expect(runCli(['board', '--write'], context)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('Exactly one of --space or --all is required'),
    });
    await expect(runCli(['board', '--write', '--space', 'vibe-coding', '--all'], context)).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('Exactly one of --space or --all is required'),
    });
  });

  it('rejects unknown spaces before writing', async () => {
    const vault = await createVault();
    const result = await runCli(['board', '--write', '--space', 'missing'], createCliContext({ KANBAN_HOME: vault }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown registry space: missing');
    await expect(fs.readFile(path.join(vault, 'boards/vibe-coding.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
