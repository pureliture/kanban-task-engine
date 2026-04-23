import fs from 'fs/promises';
import path from 'path';
import grayMatter from 'gray-matter';

function expandHome(input: string): string {
  if (input === '~') return process.env.HOME!;
  if (input.startsWith('~/')) return path.join(process.env.HOME!, input.slice(2));
  return input;
}

function kanbanHome(): string {
  return path.resolve(expandHome(process.env.KANBAN_HOME || '~/.openclaw/workspace-kanban/kanban'));
}

const MIGRATIONS: Array<{
  from: string;
  to: string;
  workspace: string;
  type: 'single' | 'container';
}> = [
  {
    from: path.join(process.env.HOME!, '.openclaw/workspace-claude/issues'),
    to: path.join(kanbanHome(), 'issues', 'vibe-coding'),
    workspace: 'vibe-coding',
    type: 'container'
  },
  {
    from: path.join(process.env.HOME!, '.openclaw/workspace-stocks/issues'),
    to: path.join(kanbanHome(), 'issues', 'stocks'),
    workspace: 'stocks',
    type: 'single'
  },
  {
    from: path.join(process.env.HOME!, '.openclaw/workspace-web/issues'),
    to: path.join(kanbanHome(), 'issues', 'web'),
    workspace: 'web',
    type: 'single'
  },
  {
    from: path.join(process.env.HOME!, '.openclaw/workspace-personal/issues'),
    to: path.join(kanbanHome(), 'issues', 'personal'),
    workspace: 'personal',
    type: 'single'
  }
];

async function migrateFile(srcPath: string, destPath: string, workspace: string): Promise<void> {
  const content = await fs.readFile(srcPath, 'utf-8');
  const { data, content: body } = grayMatter(content);

  // Update frontmatter
  data.workspace = workspace;

  // Move automation.workspace to top level if exists
  if (data.automation?.workspace) {
    if (data.automation.workspace === workspace) {
      delete data.automation.workspace;
    }
  }

  // Reconstruct file
  const newContent = grayMatter.stringify(body, data);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, newContent);

  console.log(`Migrated: ${srcPath} -> ${destPath}`);
}

async function main(): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      const files = await fs.readdir(migration.from);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      console.log(`Found ${mdFiles.length} files in ${migration.from}`);

      for (const file of mdFiles) {
        const srcPath = path.join(migration.from, file);
        const destPath = path.join(migration.to, file);
        await migrateFile(srcPath, destPath, migration.workspace);
      }

      await fs.mkdir(migration.to, { recursive: true });
    } catch (err) {
      console.log(`Skipping ${migration.from}: ${(err as Error).message}`);
    }
  }
}

main().catch(console.error);