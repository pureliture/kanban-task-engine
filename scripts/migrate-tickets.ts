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

const PRIORITY_TO_P: Record<string, string> = {
  blocker:  'P0',
  critical: 'P0',
  high:     'P1',
  medium:   'P2',
  low:      'P3',
  trivial:  'P3',
};

const REMOVED_TYPES = new Set(['story', 'sub-task', 'subtask', 'spike']);

function migrateFields(data: Record<string, unknown>): void {
  // issueType → type (copy before normalization)
  if ('issueType' in data && !('type' in data)) {
    data.type = data.issueType;
    delete data.issueType;
  }

  // type: lowercase + remove retired values (story/sub-task → task)
  if (typeof data.type === 'string') {
    const t = data.type.toLowerCase();
    data.type = REMOVED_TYPES.has(t) ? 'task' : t;
  }

  // createdAt → created
  if ('createdAt' in data && !('created' in data)) {
    data.created = data.createdAt;
    delete data.createdAt;
  }

  // updatedAt → updated
  if ('updatedAt' in data && !('updated' in data)) {
    data.updated = data.updatedAt;
    delete data.updatedAt;
  }

  // priority: Jira names → P-style
  if (typeof data.priority === 'string') {
    const mapped = PRIORITY_TO_P[data.priority.toLowerCase()];
    if (mapped) data.priority = mapped;
  }

  // Remove deprecated fields
  delete data.syncTarget;
  delete data.jiraProject;
  delete data.jiraKey;
  delete data.parent;

  // Remove automation.trigger/allowedActions block (keep policy_id/useAcp/onEnter if present)
  if (data.automation && typeof data.automation === 'object') {
    const auto = data.automation as Record<string, unknown>;
    delete auto.trigger;
    delete auto.allowedActions;
    if (Object.keys(auto).length === 0) delete data.automation;
  }
}

function migrateSections(body: string): string {
  return body
    .replace(/^## Goal\b/gm, '## 목적')
    .replace(/^## Notes\b/gm, '## 컨텍스트')
    .replace(/^## Implementation Tasks\b/gm, '## 실행 힌트');
}

const MIGRATIONS: Array<{
  from: string;
  to: string;
  workspace: string;
  type: 'single' | 'container';
}> = [
  {
    from: path.join(process.env.HOME!, '.openclaw/workspace-vibe-coding/issues'),
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

async function migrateFile(srcPath: string, destPath: string, workspace: string, force: boolean): Promise<void> {
  if (!force) {
    try {
      await fs.access(destPath);
      console.log(`Skipped (exists): ${destPath}  (use --force to overwrite)`);
      return;
    } catch {
      // destination does not exist — proceed
    }
  }

  const content = await fs.readFile(srcPath, 'utf-8');
  const { data, content: body } = grayMatter(content);

  data.workspace = workspace;

  if (data.automation && typeof data.automation === 'object') {
    const auto = data.automation as Record<string, unknown>;
    if (auto.workspace === workspace) delete auto.workspace;
  }

  migrateFields(data);

  const migratedBody = migrateSections(body);
  const newContent = grayMatter.stringify(migratedBody, data);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, newContent);

  console.log(`Migrated: ${srcPath} -> ${destPath}`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  if (force) console.log('--force: existing destination files will be overwritten');

  for (const migration of MIGRATIONS) {
    try {
      const files = await fs.readdir(migration.from);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      console.log(`Found ${mdFiles.length} files in ${migration.from}`);

      for (const file of mdFiles) {
        const srcPath = path.join(migration.from, file);
        const destPath = path.join(migration.to, file);
        await migrateFile(srcPath, destPath, migration.workspace, force);
      }

      await fs.mkdir(migration.to, { recursive: true });
    } catch (err) {
      console.log(`Skipping ${migration.from}: ${(err as Error).message}`);
    }
  }
}

main().catch(console.error);
