#!/usr/bin/env node
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pluginSource = path.join(repoRoot, 'packages/obsidian-plugin');
const pluginId = 'kanban-task-engine';
const requiredFiles = ['manifest.json', 'main.js'];
const optionalFiles = ['styles.css'];

const vault = parseVaultArg(process.argv.slice(2));
const pluginTarget = path.join(vault, '.obsidian/plugins', pluginId);

await requireBuiltPlugin();
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

async function requireBuiltPlugin() {
  for (const fileName of requiredFiles) {
    const source = path.join(pluginSource, fileName);
    if (!(await exists(source))) {
      throw new Error(`Missing built plugin artifact: ${source}`);
    }
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseVaultArg(args) {
  const index = args.indexOf('--vault');
  if (index < 0 || !args[index + 1]) {
    throw new Error('Usage: obsidian-plugin-smoke-install --vault <path>');
  }
  return path.resolve(args[index + 1]);
}
