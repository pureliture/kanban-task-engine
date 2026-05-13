import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCliContext } from '../src/context';
import { runCli } from '../src';

async function createVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-cli-authoring-'));
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
  return vault;
}

describe('authoring cli', () => {
  it('rejects new without explicit KANBAN_HOME', async () => {
    const result = await runCli(
      ['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', 'No vault'],
      createCliContext({ HOME: '/home/user' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects normalize without explicit KANBAN_HOME', async () => {
    const write = await runCli(
      ['normalize', '/tmp/rough.md', '--write', '--space', 'vibe-coding', '--project', 'kanban-task-engine'],
      createCliContext({ HOME: '/home/user' }),
    );
    expect(write.exitCode).toBe(1);
    expect(write.stderr).toContain('KANBAN_HOME must be explicitly set');

    const check = await runCli(
      ['normalize', '/tmp/rough.md', '--check', '--space', 'vibe-coding', '--project', 'kanban-task-engine'],
      createCliContext({ HOME: '/home/user' }),
    );
    expect(check.exitCode).toBe(1);
    expect(check.stderr).toContain('KANBAN_HOME must be explicitly set');
  });

  it('rejects missing option values, invalid option values, and unknown flags for new', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    expect((await runCli(['new', '--space'], context)).stderr).toContain('Missing value for --space');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--label'], context)).stderr).toContain('Missing value for --label');
    expect((await runCli(['new', '--wat', 'Title'], context)).stderr).toContain('Unknown option: --wat');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--type', 'feature', 'Title'], context)).stderr).toContain('Invalid value for --type');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--priority', 'P9', 'Title'], context)).stderr).toContain('Invalid value for --priority');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--executor', 'bot', 'Title'], context)).stderr).toContain('Invalid value for --executor');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--epic', '../VC-001', 'Title'], context)).stderr).toContain('Invalid value for --epic');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--working-dir', 'bad\npath', 'Title'], context)).stderr).toContain('Invalid value for --working-dir');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--merge-into', '-bad', 'Title'], context)).stderr).toContain('Invalid value for --merge-into');
    expect((await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--merge-into', 'origin/-bad', 'Title'], context)).stderr).toContain('Invalid value for --merge-into');
  });

  it('rejects normalize with no mode, both modes, missing option values, or unknown flags', async () => {
    const vault = await createVault();
    const source = path.join(vault, 'rough.md');
    await fs.writeFile(source, '# Rough\n');
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    expect((await runCli(['normalize', source], context)).stderr).toContain('Exactly one of --check or --write is required');
    expect((await runCli(['normalize', source, '--check', '--write'], context)).stderr).toContain('Exactly one of --check or --write is required');
    expect((await runCli(['normalize', source, '--check', '--space'], context)).stderr).toContain('Missing value for --space');
    expect((await runCli(['normalize', source, '--check', '--wat'], context)).stderr).toContain('Unknown option: --wat');
  });

  it('creates a new issue and supports JSON and plain dry-run', async () => {
    const vault = await createVault();
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    const dry = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--dry-run', '--json', 'Dry Smoke'], context);
    expect(dry.exitCode).toBe(0);
    expect(JSON.parse(dry.stdout).created).toBe(false);

    const plainDry = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--dry-run', 'Plain Dry Smoke'], context);
    expect(plainDry.exitCode).toBe(0);
    expect(plainDry.stdout).toContain('dry-run VC-001');
    expect(plainDry.stdout).toContain('---');
    expect(plainDry.stdout).toContain('Plain Dry Smoke');

    const created = await runCli(['new', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json', 'Real Smoke'], context);
    expect(created.exitCode).toBe(0);
    const payload = JSON.parse(created.stdout);
    expect(payload.id).toBe('VC-001');
    await expect(fs.readFile(path.join(vault, payload.path), 'utf8')).resolves.toContain('Real Smoke');
  });

  it('normalizes a rough note with JSON output', async () => {
    const vault = await createVault();
    const source = path.join(vault, 'rough.md');
    await fs.writeFile(source, '# Rough\n\nBody\n');
    const context = createCliContext({ KANBAN_HOME: vault, HOME: '/home/user' });
    const result = await runCli(['normalize', source, '--check', '--space', 'vibe-coding', '--project', 'kanban-task-engine', '--json'], context);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.wrote).toBe(false);
    expect(payload.hasPlaceholders).toBe(true);
    expect(payload.executionReady).toBe(false);
  });
});
