#!/usr/bin/env node
import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pluginSource = path.join(repoRoot, 'packages/obsidian-plugin');
const pluginId = 'kanban-task-engine';

const args = process.argv.slice(2);
const noGui = args.includes('--no-gui');
const vault = await mkdtemp(path.join(os.tmpdir(), 'kte-obsidian-plugin-smoke-'));

await seedObsidianConfig(vault);
await seedRegistry(vault);
await copyInstallPlugin(vault);

console.log(`created disposable vault: ${vault}`);
console.log('seeded registry.yaml');
printNextCommands(vault, noGui);

async function seedObsidianConfig(vaultRoot) {
  const obsidianDir = path.join(vaultRoot, '.obsidian');
  await mkdir(path.join(obsidianDir, 'plugins'), { recursive: true });
  await writeFile(
    path.join(obsidianDir, 'community-plugins.json'),
    `${JSON.stringify([pluginId], null, 2)}\n`,
    'utf8',
  );
}

async function seedRegistry(vaultRoot) {
  await mkdir(path.join(vaultRoot, 'issues/vibe-coding/kanban-task-engine'), { recursive: true });
  await mkdir(path.join(vaultRoot, 'issues/vibe-coding/_epics'), { recursive: true });
  await mkdir(path.join(vaultRoot, 'boards'), { recursive: true });
  await writeFile(path.join(vaultRoot, 'registry.yaml'), [
    'spaces:',
    '  vibe-coding:',
    '    type: container',
    '    idPrefix: VC',
    '    issues: issues/vibe-coding',
    '    epics: issues/vibe-coding/_epics',
    '    board: boards/vibe-coding.md',
    '    epicBoard: boards/vibe-coding-epics.md',
    '    projects:',
    '      kanban-task-engine:',
    '        path: issues/vibe-coding/kanban-task-engine',
    '',
  ].join('\n'), 'utf8');
}

async function copyInstallPlugin(vaultRoot) {
  const pluginTarget = path.join(vaultRoot, '.obsidian/plugins', pluginId);
  const requiredFiles = ['manifest.json', 'main.js'];
  const optionalFiles = ['styles.css'];

  for (const fileName of requiredFiles) {
    const source = path.join(pluginSource, fileName);
    if (!(await exists(source))) {
      throw new Error(`Missing built plugin artifact: ${source}`);
    }
  }

  await rm(pluginTarget, { recursive: true, force: true });
  await mkdir(pluginTarget, { recursive: true });

  for (const fileName of requiredFiles) {
    await copyFile(path.join(pluginSource, fileName), path.join(pluginTarget, fileName));
  }
  for (const fileName of optionalFiles) {
    const source = path.join(pluginSource, fileName);
    if (await exists(source)) {
      await copyFile(source, path.join(pluginTarget, fileName));
    }
  }

  console.log(`copy-installed ${pluginId} plugin`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printNextCommands(vaultRoot, noGuiMode) {
  const vaultName = path.basename(vaultRoot);
  if (noGuiMode) {
    console.log('no-gui mode: Obsidian Desktop commands were not executed');
  }
  console.log('next Obsidian Desktop and CLI commands:');
  console.log(`open -a Obsidian "${vaultRoot}"`);
  console.log(`obsidian vault="${vaultName}" plugin:reload id=${pluginId}`);
  console.log(`obsidian vault="${vaultName}" commands filter=${pluginId}`);
  console.log(`obsidian vault="${vaultName}" command id=${pluginId}:new-task`);
  console.log(`obsidian vault="${vaultName}" dev:screenshot path=/tmp/kte-obsidian-plugin-smoke.png`);
  console.log(`obsidian vault="${vaultName}" dev:errors`);
}
