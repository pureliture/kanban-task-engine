import fs from 'node:fs';
import path from 'node:path';

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

type ArchitectureGuard = {
  name: string;
  roots: string[];
  match: RegExp;
  allow: Array<{ file: string; reason: string }>;
};

const root = process.cwd();
const argv = new Set(process.argv.slice(2));
const strictArchitecture = argv.has('--strict-architecture');

function file(relPath: string): string {
  return path.join(root, relPath);
}

function exists(relPath: string): boolean {
  return fs.existsSync(file(relPath));
}

function read(relPath: string): string {
  return fs.readFileSync(file(relPath), 'utf8');
}

function maybeRead(relPath: string): string {
  return exists(relPath) ? read(relPath) : '';
}

function has(relPath: string, pattern: RegExp): boolean {
  return pattern.test(maybeRead(relPath));
}

function packageJson(): { packageManager?: string; scripts?: Record<string, string> } {
  return JSON.parse(read('package.json'));
}

function includesAll(content: string, patterns: RegExp[]): boolean {
  return patterns.every(pattern => pattern.test(content));
}

function appearsBefore(content: string, first: string, second: string): boolean {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function headingExists(content: string, heading: string): boolean {
  return new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, 'm').test(content);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walk(relRoot: string): string[] {
  const absRoot = file(relRoot);
  if (!fs.existsSync(absRoot)) return [];

  const result: string[] = [];
  const stack = [relRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(file(current), { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
      const relPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(relPath);
      } else if (entry.isFile()) {
        result.push(relPath);
      }
    }
  }
  return result.sort();
}

function scanGuard(guard: ArchitectureGuard): { unapproved: string[]; allowed: string[] } {
  const files = guard.roots
    .flatMap(walk)
    .filter(relPath => relPath.endsWith('.ts'))
    .filter(relPath => !relPath.includes(`${path.sep}tests${path.sep}`))
    .filter(relPath => relPath !== 'scripts/check-hardening.ts');
  const allowedFiles = new Map(guard.allow.map(item => [item.file, item.reason]));
  const unapproved: string[] = [];
  const allowed: string[] = [];

  for (const relPath of files) {
    const lines = maybeRead(relPath).split('\n');
    lines.forEach((line, index) => {
      guard.match.lastIndex = 0;
      if (!guard.match.test(line)) return;
      const hit = `${relPath}:${index + 1}`;
      if (allowedFiles.has(relPath)) {
        allowed.push(`${hit} (${allowedFiles.get(relPath)})`);
      } else {
        unapproved.push(hit);
      }
    });
  }

  return { unapproved, allowed };
}

const pkg = packageJson();
const readme = maybeRead('README.md');
const runtime = maybeRead('docs/kanban-runtime.md');
const archive = maybeRead('docs/archive/README.md');
const ci = maybeRead('.github/workflows/ci.yml');
const evalSuperpowers = maybeRead('scripts/eval-superpowers.ts');
const combinedDocs = [readme, runtime, archive].join('\n');

const checks: Check[] = [
  {
    name: 'README documents required operator headings',
    pass: ['Quick Start', 'Home And Work Modes', 'CLI', 'Recipes', 'Safety Model']
      .every(heading => headingExists(readme, heading)),
  },
  {
    name: 'Runtime guide references 2026-05-02 hardening spec',
    pass: /docs\/superpowers\/specs\/2026-05-02-kanban-system-hardening-spec\.md/.test(runtime),
  },
  {
    name: 'Runtime guide states no-change success converges to FAILED',
    pass: /no-change[\s\S]{0,160}FAILED/i.test(runtime),
  },
  {
    name: 'Archive index maps superseded docs to current docs',
    pass: exists('docs/archive/README.md')
      && /2026-04-23-kanban-control-plane-design\.md/.test(archive)
      && /2026-04-30-agent-runner-codex-target-design\.md/.test(archive)
      && /2026-05-02-kanban-system-hardening-spec\.md/.test(archive)
      && /no-change[\s\S]{0,160}FAILED/i.test(archive),
  },
  {
    name: 'CI workflow has required triggers, runtime, cache, and gates',
    pass: includesAll(ci, [
      /^on:\s*$/m,
      /pull_request:/,
      /push:[\s\S]*branches:[\s\S]*main/,
      /fetch-depth:\s*0/,
      /pnpm\/action-setup@v4/,
      /node-version:\s*['"]?22['"]?/,
      /cache:\s*['"]?pnpm['"]?/,
      /pnpm install --frozen-lockfile/,
      /git diff --check origin\/main\.\.\.HEAD/,
      /pnpm -r build/,
      /pnpm -r test/,
      /pnpm eval:superpowers/,
      /pnpm eval:hardening/,
    ]) && appearsBefore(ci, 'pnpm/action-setup@v4', 'actions/setup-node@v4'),
  },
  {
    name: 'package.json pins pnpm and exposes eval:hardening',
    pass: pkg.packageManager === 'pnpm@10.32.1'
      && pkg.scripts?.['eval:hardening'] === 'node --import tsx scripts/check-hardening.ts',
  },
  {
    name: 'Superpowers eval includes 2026-05-02 hardening spec input',
    pass: /2026-05-02-kanban-system-hardening-spec\.md/.test(evalSuperpowers),
  },
  {
    name: 'Superpowers eval no longer requires runtime docs to declare 2026-04-23 as sole authority',
    pass: !/Runtime docs point to authoritative spec[\s\S]{0,220}2026-04-23-kanban-control-plane-design\.md/.test(evalSuperpowers),
  },
  {
    name: 'Superpowers eval includes 2026-05-02 hardening plan progress input',
    pass: /planFiles[\s\S]*2026-05-02-kanban-system-hardening-plan\.md/.test(evalSuperpowers),
  },
  {
    name: 'config/workspaces.json is documented as migration-only legacy config',
    pass: /config\/workspaces\.json/.test(combinedDocs) && /migration-only/i.test(combinedDocs),
  },
  {
    name: 'check-hardening contains allowlist-based architecture guards',
    pass: has('scripts/check-hardening.ts', /path\.join\(vaultRoot/)
      && has('scripts/check-hardening.ts', /direct CLI YAML lifecycle writes/)
      && has('scripts/check-hardening.ts', /adapter constructors without policy/)
      && has('scripts/check-hardening.ts', /strict-architecture/),
  },
];

const architectureGuards: ArchitectureGuard[] = [
  {
    name: 'raw path.join(vaultRoot, ...) calls',
    roots: ['packages', 'scripts'],
    match: /path\.join\([^)]*\b(?:vaultRoot|input\.vaultRoot|context\.vaultRoot)\b/,
    allow: [
      { file: 'packages/cli/src/vault.ts', reason: 'Task 5 owns CLI delegation to core VaultService' },
      { file: 'packages/cli/src/policy.ts', reason: 'CLI active recipe lookup reads <vaultRoot>/config/active-recipe.yaml' },
      { file: 'packages/cli/src/commands/recover-run.ts', reason: 'Task 5 owns CLI lifecycle path delegation' },
      { file: 'packages/core/src/executor/run-issue.ts', reason: 'Task 2 owns vault artifact path containment' },
      { file: 'packages/core/src/executor/run-artifacts.ts', reason: 'Task 2 owns run artifact path containment' },
      { file: 'packages/core/src/store/workspace-resolver.ts', reason: 'Task 2 owns registry path containment migration' },
    ],
  },
  {
    name: 'direct CLI YAML lifecycle writes',
    roots: ['packages/cli/src'],
    match: /YAML\.stringify|fs\.writeFile\([^)]*issue|updateIssueStatus\(/,
    allow: [
      { file: 'packages/cli/src/vault.ts', reason: 'Task 5 owns replacing direct CLI lifecycle writes with core service calls' },
      { file: 'packages/cli/src/commands/abort.ts', reason: 'Task 5 owns command delegation to core services' },
      { file: 'packages/cli/src/commands/approve.ts', reason: 'Task 5 owns command delegation to core services' },
      { file: 'packages/cli/src/commands/recover-run.ts', reason: 'Task 5 owns command delegation to core services' },
      { file: 'packages/cli/src/commands/retry.ts', reason: 'Task 5 owns command delegation to core services' },
      { file: 'packages/cli/src/commands/run.ts', reason: 'Task 5 owns run preflight and lifecycle delegation' },
    ],
  },
  {
    name: 'adapter constructors without policy',
    roots: ['packages/adapter-firebase/src', 'packages/adapter-openclaw/src', 'packages/adapter-jira/src', 'packages/adapter-cli/src'],
    match: /constructor\(/,
    allow: [
      { file: 'packages/adapter-cli/src/cli-adapter.ts', reason: 'Task 6 owns adapter policy constructor requirement' },
      { file: 'packages/adapter-cli/src/session-manager.ts', reason: 'Task 6 owns adapter-cli environment policy' },
      { file: 'packages/adapter-firebase/src/firebase-adapter.ts', reason: 'Task 6 owns Firebase policy guard' },
      { file: 'packages/adapter-firebase/src/firebase-listener.ts', reason: 'Task 6 owns Firebase listener policy guard' },
      { file: 'packages/adapter-jira/src/jira-adapter.ts', reason: 'Task 6 owns Jira policy guard' },
      { file: 'packages/adapter-openclaw/src/config-adapter.ts', reason: 'Config adapter has no external side-effect policy surface' },
      { file: 'packages/adapter-openclaw/src/openclaw-adapter.ts', reason: 'Task 6 owns OpenClaw policy guard' },
      { file: 'packages/adapter-openclaw/src/rate-limit-queue.ts', reason: 'Task 6 owns durable queue shape and persistence policy' },
    ],
  },
];

for (const guard of architectureGuards) {
  const result = scanGuard(guard);
  checks.push({
    name: `Architecture guard: ${guard.name}`,
    pass: result.unapproved.length === 0,
    detail: [
      result.unapproved.length > 0 ? `unapproved: ${result.unapproved.join(', ')}` : '',
      result.allowed.length > 0 ? `allowed: ${result.allowed.join(', ')}` : '',
    ].filter(Boolean).join(' | '),
  });
}

const failed = checks.filter(check => !check.pass);
console.log('# Kanban hardening check');
console.log('');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (failed.length > 0) {
  console.error('');
  console.error(`Hardening check failed: ${failed.length}/${checks.length} checks failed.`);
  process.exitCode = 1;
}
