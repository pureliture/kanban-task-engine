import { describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cliBin = path.join(repoRoot, 'packages/cli/dist/bin.js');
const builtCliIt = existsSync(cliBin) ? it : it.skip;

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-runtime-smoke-'));
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

async function kanban(vault: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await run('node', [cliBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, KANBAN_HOME: vault, HOME: '/tmp/no-home' },
  });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

describe('authoring built CLI runtime smoke', () => {
  builtCliIt('runs new and normalize against a disposable vault', async () => {
    const vault = await makeVault();

    const dry = await kanban(vault, [
      'new',
      '--space',
      'vibe-coding',
      '--project',
      'kanban-task-engine',
      '--dry-run',
      '--json',
      'Dry Runtime',
    ]);
    const dryPayload = JSON.parse(dry.stdout);
    expect(dryPayload).toMatchObject({ id: 'VC-001', created: false });
    expect(dryPayload.markdown).toContain('Dry Runtime');

    const created = await kanban(vault, [
      'new',
      '--space',
      'vibe-coding',
      '--project',
      'kanban-task-engine',
      '--json',
      'Runtime Issue',
    ]);
    const createdPayload = JSON.parse(created.stdout);
    expect(createdPayload).toMatchObject({
      id: 'VC-001',
      created: true,
      path: 'issues/vibe-coding/kanban-task-engine/VC-001-runtime-issue.md',
    });
    await expect(fs.readFile(path.join(vault, createdPayload.path), 'utf8')).resolves.toContain('Runtime Issue');

    const rough = path.join(vault, 'rough-runtime.md');
    await fs.writeFile(rough, '# Rough Runtime\n\nBody\n');
    const checked = await kanban(vault, [
      'normalize',
      rough,
      '--check',
      '--space',
      'vibe-coding',
      '--project',
      'kanban-task-engine',
      '--json',
    ]);
    expect(JSON.parse(checked.stdout)).toMatchObject({
      id: 'VC-002',
      wrote: false,
      hasPlaceholders: true,
      executionReady: false,
    });

    const written = await kanban(vault, [
      'normalize',
      rough,
      '--write',
      '--space',
      'vibe-coding',
      '--project',
      'kanban-task-engine',
      '--json',
    ]);
    const writtenPayload = JSON.parse(written.stdout);
    expect(writtenPayload).toMatchObject({ id: 'VC-002', wrote: true });
    await expect(fs.readFile(writtenPayload.targetPath, 'utf8')).resolves.toContain('kanban:placeholder');
  });
});
