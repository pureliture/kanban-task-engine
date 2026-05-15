#!/usr/bin/env node
import { mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const pluginSource = path.join(repoRoot, 'packages/obsidian-plugin');
const pluginId = 'kanban-task-engine';

const vault = parseVaultArg(process.argv.slice(2));
const pluginRoot = path.join(vault, '.obsidian/plugins');
const pluginTarget = path.join(pluginRoot, pluginId);

await mkdir(pluginRoot, { recursive: true });
await rm(pluginTarget, { recursive: true, force: true });
await symlink(pluginSource, pluginTarget, 'dir');

console.log(`dev-linked ${pluginId} plugin`);
console.log('dev symlink is for local iteration only and is not acceptance evidence');

function parseVaultArg(args) {
  const index = args.indexOf('--vault');
  if (index < 0 || !args[index + 1]) {
    throw new Error('Usage: obsidian-plugin-dev-link --vault <path>');
  }
  return path.resolve(args[index + 1]);
}
