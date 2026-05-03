import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

type SuperpowerEval = {
  id: string;
  name: string;
  required?: boolean;
  dependencyOrder: number;
  planProgress: ReturnType<typeof planProgress>;
  localEvalCommand: string;
  deterministicScore: number;
  passed: number;
  total: number;
  checks: Check[];
};

type TestGateCommand = {
  command: string;
  args: string[];
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
};

type TestGate = {
  enabled: boolean;
  passed: boolean;
  commands: TestGateCommand[];
};

const root = process.cwd();
const argv = new Set(process.argv.slice(2));
const withTests = argv.has('--with-tests');

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

function includesAll(content: string, patterns: RegExp[]): boolean {
  return patterns.every(pattern => pattern.test(content));
}

function appearsBefore(content: string, first: string, second: string): boolean {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

function maybeReadAny(relPaths: string[]): string {
  return relPaths.map(maybeRead).join('\n');
}

function sectionBetween(content: string, start: string, end: string): string {
  const startAt = content.indexOf(start);
  if (startAt < 0) return '';
  const endAt = content.indexOf(end, startAt + start.length);
  return endAt < 0 ? content.slice(startAt) : content.slice(startAt, endAt);
}

function score(checks: Check[]): Pick<SuperpowerEval, 'deterministicScore' | 'passed' | 'total'> {
  const total = checks.length;
  const passed = checks.filter(check => check.pass).length;
  return {
    passed,
    total,
    deterministicScore: total === 0 ? 0 : Math.round((passed / total) * 100),
  };
}

function runTestGate(enabled: boolean): TestGate {
  if (!enabled) {
    return {
      enabled: false,
      passed: true,
      commands: [],
    };
  }

  const commands = [
    { command: 'pnpm', args: ['-r', 'build'] },
    { command: 'pnpm', args: ['-r', 'test'] },
  ];
  const results: TestGateCommand[] = [];

  for (const command of commands) {
    const result = spawnSync(command.command, command.args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    results.push({
      command: command.command,
      args: command.args,
      exitCode: result.status,
      stdoutTail: tail(result.stdout ?? ''),
      stderrTail: tail(result.stderr ?? ''),
    });
    if (result.status !== 0) break;
  }

  return {
    enabled: true,
    passed: results.every(result => result.exitCode === 0) && results.length === commands.length,
    commands: results,
  };
}

function tail(content: string, max = 4000): string {
  return content.length <= max ? content : content.slice(-max);
}

function planProgress(planFile: string): { checked: number; unchecked: number; score: number } {
  const content = maybeRead(planFile);
  const checked = content.match(/- \[[xX]\]/g)?.length ?? 0;
  const unchecked = content.match(/- \[ \]/g)?.length ?? 0;
  const total = checked + unchecked;
  return { checked, unchecked, score: total === 0 ? 0 : Math.round((checked / total) * 100) };
}

const controlPlaneSpec = maybeRead('docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md');
const hardeningSpec = maybeRead('docs/superpowers/specs/2026-05-02-kanban-system-hardening-spec.md');
const spec = controlPlaneSpec;
const specSection8 = sectionBetween(spec, '## 8. Markdown Issue Schema', '## 9. Status Model');
const issueSchema = maybeRead('packages/schema/src/issue-schema.ts');
const mapper = maybeRead('packages/core/src/store/mapper.ts');
const writeBack = maybeRead('packages/core/src/store/write-back.ts');
const migrateTickets = maybeRead('scripts/migrate-tickets.ts');
const runtimeDocs = maybeRead('docs/kanban-runtime.md');
const readme = maybeRead('README.md');
const archiveIndex = maybeRead('docs/archive/README.md');
const deployChecklist = maybeRead('docs/deploy-checklist.md');
const ciWorkflow = maybeRead('.github/workflows/ci.yml');
const gitignore = maybeRead('.gitignore');
const boardCommand = maybeRead('packages/cli/src/commands/board.ts');
const packageJson = JSON.parse(read('package.json')) as { packageManager?: string; scripts?: Record<string, string> };
const corePackage = exists('packages/core/package.json')
  ? JSON.parse(read('packages/core/package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  : { dependencies: {}, devDependencies: {} };
const workspace = maybeRead('pnpm-workspace.yaml');

const evals: SuperpowerEval[] = [];

{
  const checks: Check[] = [
    { name: 'Spec declares _epics vault layout', pass: /\b_epics\//.test(spec) },
    { name: 'Spec registry declares idPrefix', pass: /\bidPrefix\b/.test(sectionBetween(spec, '## 15. Registry', '## 16. Migration Strategy')) },
    { name: 'Spec frontmatter uses type/created/updated', pass: /type: task/.test(specSection8) && /\ncreated:/.test(specSection8) && /\nupdated:/.test(specSection8) },
    { name: 'Spec has required non-epic sections', pass: /## 목적/.test(specSection8) && /## 컨텍스트/.test(specSection8) && /## Acceptance Criteria/.test(specSection8) && /## 실행 힌트/.test(specSection8) },
    { name: 'Spec has required epic sections', pass: /## 목표/.test(specSection8) && /## 범위/.test(specSection8) && /## 성공 지표/.test(specSection8) && /## 하위 티켓/.test(specSection8) },
    { name: 'Spec removed legacy field names', pass: !/\bissueType\b|\bcreatedAt\b|\bupdatedAt\b|^## Goal\b|Implementation Tasks/m.test(spec) },
    { name: 'Spec removed deprecated syncTarget/jiraProject', pass: !/\bsyncTarget\b|\bjiraProject\b/.test(spec) },
    { name: 'Schema section excludes Work/Jira writeback metadata', pass: !/\bsyncTarget\b|\bjiraProject\b|\bjiraKey:/.test(specSection8) },
  ];
  evals.push({
    id: 'superpower-1',
    name: 'Spec Reconciliation',
    dependencyOrder: 1,
    planProgress: planProgress('docs/superpowers/plans/2026-04-23-kanban-spec-reconciliation.md'),
    localEvalCommand: 'pnpm eval:superpowers',
    ...score(checks),
    checks,
  });
}

{
  const checks: Check[] = [
    { name: 'IssueFrontmatter requires new core fields', pass: /type: IssueType/.test(issueSchema) && /created: string/.test(issueSchema) && /updated: string/.test(issueSchema) },
    { name: 'IssueFrontmatter excludes deprecated Work/Jira fields', pass: !/syncTarget\?:|jiraProject\?:|jiraKey\?:/.test(issueSchema) },
    { name: 'Parser enforces task sections', pass: /REQUIRED_SECTIONS_TASK.*목적.*컨텍스트.*Acceptance Criteria.*실행 힌트/s.test(issueSchema) },
    { name: 'Parser enforces epic sections', pass: /REQUIRED_SECTIONS_EPIC.*목표.*범위.*성공 지표.*하위 티켓/s.test(issueSchema) },
    { name: 'Mapper no longer reads yaml.issueType fallback', pass: !/yaml\.issueType/.test(mapper) },
    { name: 'Write-back allows new execution fields', pass: ['epic', 'depends_on', 'working_dir', 'merge_into', 'run_count'].every(fieldName => writeBack.includes(`'${fieldName}'`)) },
    { name: 'Firebase mapper uses created/updated fields', pass: /created\?: string/.test(maybeRead('packages/adapter-firebase/src/firebase-mapper.ts')) && !/createdAt|updatedAt/.test(maybeRead('packages/adapter-firebase/src/firebase-mapper.ts')) },
    { name: 'Templates match new type set', pass: exists('templates/epic.md') && exists('templates/chore.md') && exists('templates/docs.md') && !exists('templates/story.md') },
    { name: 'Migration script converts legacy schema', pass: /issueType/.test(migrateTickets) && /createdAt/.test(migrateTickets) && /updatedAt/.test(migrateTickets) },
  ];
  evals.push({
    id: 'superpower-2',
    name: 'Schema Migration',
    dependencyOrder: 2,
    planProgress: planProgress('docs/superpowers/plans/2026-04-23-kanban-schema-migration.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/schema test && pnpm --filter @kanban-task-engine/core test && pnpm --filter @kanban-task-engine/adapter-firebase test',
    ...score(checks),
    checks,
  });
}

{
  const checks: Check[] = [
    { name: 'Module runtime contracts exist', pass: exists('packages/core/src/runtime/module-runner.ts') && exists('packages/core/tests/module-runner.test.ts') },
    { name: 'Recipe loader exists with tests', pass: exists('packages/core/src/recipes/recipe-loader.ts') && exists('packages/core/tests/recipe-loader.test.ts') },
    { name: 'Home execution flow is tested', pass: exists('packages/core/tests/home-execution-flow.test.ts') },
    { name: 'Audit and git checkpoint modules exist', pass: exists('packages/core/src/modules/audit-log-module.ts') && exists('packages/core/src/modules/git-checkpoint-module.ts') },
    { name: 'Claude Code adapter exists with tests', pass: exists('packages/adapter-claude-code/src/claude-code-adapter.ts') && exists('packages/adapter-claude-code/tests/claude-code-adapter.test.ts') },
  ];
  evals.push({
    id: 'superpower-3',
    name: 'Automation Runtime',
    dependencyOrder: 3,
    planProgress: planProgress('docs/superpowers/plans/2026-04-23-kanban-automation-runtime-plan.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/core test -- tests/module-runner.test.ts tests/recipe-loader.test.ts tests/home-execution-flow.test.ts tests/audit-log-module.test.ts tests/git-checkpoint-module.test.ts',
    ...score(checks),
    checks,
  });
}

{
  const checks: Check[] = [
    { name: 'Board generator exists with tests', pass: exists('packages/core/src/boards/board-generator.ts') && exists('packages/core/tests/board-generator.test.ts') },
    { name: 'Jira mapper and adapter exist with tests', pass: exists('packages/adapter-jira/src/jira-mapper.ts') && exists('packages/adapter-jira/src/jira-adapter.ts') && exists('packages/adapter-jira/tests/jira-mapper.test.ts') },
    { name: 'Runtime docs point to hardening contract and control-plane background', pass: /2026-05-02-kanban-system-hardening-spec\.md/.test(runtimeDocs) && /2026-04-23-kanban-control-plane-design\.md/.test(runtimeDocs) },
    { name: 'Migration script respects KANBAN_HOME', pass: /KANBAN_HOME/.test(migrateTickets) },
    { name: 'Generated board files are runtime artifacts, not committed fixtures', pass: /^boards\/$/m.test(gitignore) && /renderIssueBoard/.test(boardCommand) },
  ];
  evals.push({
    id: 'superpower-4',
    name: 'Boards, Work Adapter, Cleanup',
    dependencyOrder: 4,
    planProgress: planProgress('docs/superpowers/plans/2026-04-23-kanban-boards-work-cleanup-plan.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/core test -- tests/board-generator.test.ts && pnpm --filter @kanban-task-engine/adapter-jira test',
    ...score(checks),
    checks,
  });
}

{
  const checks: Check[] = [
    { name: 'Workspace includes packages wildcard', pass: /packages\/\*/.test(workspace) },
    { name: 'Registry parser exists', pass: exists('packages/core/src/store/registry.ts') && exists('packages/core/tests/registry.test.ts') },
    { name: 'Sequence allocator exists', pass: exists('packages/core/src/store/sequence.ts') && exists('packages/core/tests/sequence.test.ts') },
    { name: 'Executor module directory exists', pass: exists('packages/core/src/executor') },
    { name: 'Git/worktree/lock/run artifact tests exist', pass: exists('packages/core/tests/executor/git.test.ts') && exists('packages/core/tests/executor/worktree.test.ts') && exists('packages/core/tests/executor/lock.test.ts') && exists('packages/core/tests/executor/run-artifacts.test.ts') },
    { name: 'Claude code executor exists and is tested', pass: exists('packages/core/src/executor/claude-code-executor.ts') && exists('packages/core/tests/executor/claude-code-executor.test.ts') },
    { name: 'Core depends on execa', pass: Boolean(corePackage.dependencies?.execa ?? corePackage.devDependencies?.execa) },
    { name: 'CLI package exists', pass: exists('packages/cli/package.json') && exists('packages/cli/src/index.ts') },
    { name: 'CLI command modules exist', pass: ['run', 'next', 'approve', 'abort', 'retry', 'sync', 'board'].every(command => exists(`packages/cli/src/commands/${command}.ts`)) },
    { name: 'CLI reads vault registry and issue Markdown', pass: exists('packages/cli/src/vault.ts') && /loadVaultIssueIndex/.test(maybeRead('packages/cli/src/vault.ts')) },
    { name: 'CLI tests cover vault-backed commands', pass: /createVault/.test(maybeRead('packages/cli/tests/index.test.ts')) && /sync reports issue counts/.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'CLI tests cover approve/abort/retry lifecycle', pass: /approves a REVIEW issue/.test(maybeRead('packages/cli/tests/index.test.ts')) && /aborts REVIEW and FAILED/.test(maybeRead('packages/cli/tests/index.test.ts')) && /retries FAILED issues/.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'CLI wires approve/abort/retry to real git lifecycle', pass: /approveWithGit/.test(maybeRead('packages/cli/src/commands/approve.ts')) && /discardAbortWithGit/.test(maybeRead('packages/cli/src/commands/abort.ts')) && /retryWithGit/.test(maybeRead('packages/cli/src/commands/retry.ts')) && /with real git/.test(maybeRead('packages/cli/tests/index.test.ts')) },
  ];
  evals.push({
    id: 'superpower-5',
    name: 'Worktree Execution + CLI',
    dependencyOrder: 5,
    planProgress: planProgress('docs/superpowers/plans/2026-04-23-kanban-worktree-cli-plan.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/core test -- tests/sequence.test.ts tests/registry.test.ts tests/executor && pnpm --filter @kanban-task-engine/cli test',
    ...score(checks),
    checks,
  });
}

{
  const agentProcessTest = maybeRead('packages/core/tests/executor/agent-process.test.ts');
  const redactionTest = maybeRead('packages/core/tests/executor/redaction.test.ts');
  const promptAssemblerTest = maybeRead('packages/core/tests/executor/prompt-assembler.test.ts');
  const runArgsTest = maybeRead('packages/cli/tests/run-args.test.ts');
  const runIssueTest = maybeRead('packages/core/tests/executor/run-issue.test.ts');
  const runArtifactsTest = maybeRead('packages/core/tests/executor/run-artifacts.test.ts');
  const agentProcess = maybeRead('packages/core/src/executor/agent-process.ts');
  const claudeRunner = maybeRead('packages/core/src/executor/claude-code-executor.ts');
  const codexRunner = maybeRead('packages/core/src/executor/codex-runner.ts');
  const codexRunnerTest = maybeRead('packages/core/tests/executor/codex-runner.test.ts');
  const runArtifacts = maybeRead('packages/core/src/executor/run-artifacts.ts');
  const recoverRun = maybeRead('packages/cli/src/commands/recover-run.ts');
  const worktree = maybeRead('packages/core/src/executor/worktree.ts');
  const cliLifecycleTests = maybeReadAny([
    'packages/cli/tests/index.test.ts',
    'packages/cli/tests/approve.test.ts',
    'packages/cli/tests/recover-run.test.ts',
  ]);
  const checks: Check[] = [
    { name: 'AgentRunner abstraction exists', pass: exists('packages/core/src/executor/agent-runner.ts') },
    { name: 'Codex runner exists with tests', pass: exists('packages/core/src/executor/codex-runner.ts') && exists('packages/core/tests/executor/codex-runner.test.ts') },
    { name: 'Generic run issue orchestration exists with tests', pass: exists('packages/core/src/executor/run-issue.ts') && exists('packages/core/tests/executor/run-issue.test.ts') },
    { name: 'Agent process tests cover shell false, spawn args, and env allowlist', pass: exists('packages/core/tests/executor/agent-process.test.ts') && includesAll(agentProcessTest, [/shell:\s*false|shell false/i, /args array|spawn args|argv|arguments array/i, /env allowlist|allowlist.*env|allowed env/i]) },
    { name: 'Redaction tests cover stdout, stderr, and metadata', pass: exists('packages/core/tests/executor/redaction.test.ts') && includesAll(redactionTest, [/stdout/i, /stderr/i, /metadata/i]) },
    { name: 'Prompt assembler tests cover raw issue markdown and execution contract', pass: exists('packages/core/tests/executor/prompt-assembler.test.ts') && includesAll(promptAssemblerTest, [/raw issue markdown|issue markdown/i, /Engine Execution Contract|execution contract/i, /prompt content|lifecycle mutation|checkpoint commit/i]) },
    { name: 'CLI --agent parser conflicts are tested', pass: exists('packages/cli/tests/run-args.test.ts') && includesAll(runArgsTest, [/--agent/, /--mock-executor/, /conflict|cannot.*together|mutually exclusive/i]) },
    { name: 'RUNNING failure convergence is tested', pass: exists('packages/core/tests/executor/run-issue.test.ts') && includesAll(runIssueTest, [/non-zero|nonzero|exit code/i, /exception after RUNNING/i, /no file changes/i, /commit failure|checkpoint commit fails/i]) },
    { name: 'Approve stale target or fast-forward target update fixture exists', pass: /approve/i.test(cliLifecycleTests) && /stale[- ]target|fast[- ]forward target|fast-forward update|behind origin/i.test(cliLifecycleTests) },
    { name: 'Stale RUNNING recovery test exists', pass: /stale RUNNING|recover-run|recoverRun/i.test(cliLifecycleTests) },
    { name: 'Run metadata and artifact path fields are tested', pass: exists('packages/core/tests/executor/run-artifacts.test.ts') && includesAll(runArtifactsTest, [/backend/i, /baseCommit/i, /headCommit/i, /ndjson/i, /logPath|\.log/i, /lastMessagePath|last-message/i, /jsonPath|run-<n>\.json|metadata/i]) },
    { name: 'Claude CLI runner uses shared safe process primitive', pass: includesAll(claudeRunner, [/createClaudeAgentRunner/, /spawnAgentProcess/, /args:\s*\[/, /env:\s*process\.env/]) && !/child_process/.test(claudeRunner) },
    { name: 'Agent env allowlist preserves locale and terminal essentials', pass: includesAll(agentProcess, [/LANG/, /LC_ALL/, /LC_CTYPE/, /TERM/, /TZ/, /LOGNAME/]) && includesAll(agentProcessTest, [/LANG/, /LC_ALL/, /TERM/, /LOGNAME/]) },
    { name: 'Stdin error handling waits for child close', pass: includesAll(agentProcessTest, [/stdin error/i, /waits for child close/i, /records synchronous stdin write errors/i]) },
    { name: 'Expanded redaction covers bearer, JWT, generic secrets, provider tokens, and PEM', pass: includesAll(redactionTest, [/Bearer/, /JWT/, /ANTHROPIC_API_KEY/, /AWS_SECRET_ACCESS_KEY/, /github_pat_/, /xoxb-/, /PRIVATE KEY/]) },
    { name: 'Event JSONL payloads are redacted', pass: includesAll(runArtifacts, [/appendRunEvent/, /redactUnknown\(event\)/]) && includesAll(runArtifactsTest, [/JSONL events/i, /Authorization: Bearer/, /CI_TOKEN/]) },
    { name: 'Final issue write failure prevents premature REVIEW event', pass: includesAll(runIssueTest, [/final issue write fails/i, /does not append a REVIEW event/i, /appendRunEvent\)\.not\.toHaveBeenCalled/]) },
    { name: 'Lifecycle commands reject unknown flags before mutation', pass: includesAll(cliLifecycleTests, [/rejects approve unknown options/i, /rejects abort unknown options/i, /rejects retry unknown options/i, /--mock-gti/, /Unknown option/]) },
    { name: 'recover-run checks recorded pid liveness', pass: includesAll(recoverRun, [/process\.kill\(pid,\s*0\)/, /pid is still alive|pid .*alive|alive/i]) && includesAll(cliLifecycleTests, [/recorded pid is dead/i, /recorded pid is still alive/i]) },
    { name: 'Kanban worktree cleanup is idempotent', pass: includesAll(worktree, [/branch['"],\s*['"]--list/, /fs\.access|exists\(/]) && includesAll(cliLifecycleTests, [/worktree is already gone/i]) },
    { name: 'Codex runner uses unquoted approval policy and validates prompt input', pass: includesAll(codexRunner, [/approval_policy=never/, /Prompt is empty/, /exitCode:\s*127/]) && includesAll(codexRunnerTest, [/approval_policy=never/, /Prompt is empty/, /missing prompt/]) && !/approval_policy="never"/.test(codexRunner) },
  ];
  evals.push({
    id: 'agent-runner-codex',
    name: 'AgentRunner + Codex Target',
    required: true,
    dependencyOrder: 6,
    planProgress: planProgress('docs/superpowers/plans/2026-04-30-agent-runner-codex-review-remediation-plan.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/codex-runner.test.ts tests/executor/prompt-assembler.test.ts tests/executor/redaction.test.ts tests/executor/run-issue.test.ts tests/executor/run-artifacts.test.ts && pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts tests/index.test.ts',
    ...score(checks),
    checks,
  });
}

{
  const checks: Check[] = [
    { name: 'Hardening spec is loaded as eval input', pass: /Kanban Task Engine System Hardening Spec/.test(hardeningSpec) },
    { name: 'README exposes operator headings', pass: ['Quick Start', 'Home And Work Modes', 'CLI', 'Recipes', 'Safety Model'].every(heading => new RegExp(`^## ${heading}$`, 'm').test(readme)) },
    { name: 'Runtime guide documents no-change FAILED', pass: /no-change[\s\S]{0,160}FAILED/i.test(runtimeDocs) },
    { name: 'Archive index maps older docs to 2026-05-02 spec', pass: /2026-04-23-kanban-control-plane-design\.md/.test(archiveIndex) && /2026-04-30-agent-runner-codex-target-design\.md/.test(archiveIndex) && /2026-05-02-kanban-system-hardening-spec\.md/.test(archiveIndex) },
    { name: 'Deploy checklist covers rollback triggers and tech debt', pass: /Rollback Triggers/.test(deployChecklist) && /Tech Debt Triage/.test(deployChecklist) && /strict-architecture/.test(deployChecklist) },
    { name: 'Root package pins pnpm and hardening eval', pass: packageJson.packageManager === 'pnpm@10.32.1' && packageJson.scripts?.['eval:hardening'] === 'node --import tsx scripts/check-hardening.ts' },
    { name: 'CI runs build, test, superpowers, and hardening gates', pass: /pnpm\/action-setup@v4/.test(ciWorkflow) && appearsBefore(ciWorkflow, 'pnpm/action-setup@v4', 'actions/setup-node@v4') && /node-version:\s*['"]?22['"]?/.test(ciWorkflow) && /pnpm -r build/.test(ciWorkflow) && /pnpm -r test/.test(ciWorkflow) && /pnpm eval:superpowers/.test(ciWorkflow) && /pnpm eval:hardening/.test(ciWorkflow) },
    { name: 'Legacy workspace config is migration-only in docs', pass: /config\/workspaces\.json/.test([readme, runtimeDocs, archiveIndex].join('\n')) && /migration-only/i.test([readme, runtimeDocs, archiveIndex].join('\n')) },
  ];
  evals.push({
    id: 'system-hardening-docs-ci',
    name: 'System Hardening Docs + CI',
    required: true,
    dependencyOrder: 7,
    planProgress: planProgress('docs/superpowers/plans/2026-05-02-kanban-system-hardening-plan.md'),
    localEvalCommand: 'pnpm eval:hardening',
    ...score(checks),
    checks,
  });
}

const deterministicScore = Math.round(evals.reduce((sum, item) => sum + item.deterministicScore, 0) / evals.length);
const testGate = runTestGate(withTests);
const planFiles = [
  'docs/superpowers/plans/2026-04-23-kanban-spec-reconciliation.md',
  'docs/superpowers/plans/2026-04-23-kanban-schema-migration.md',
  'docs/superpowers/plans/2026-04-23-kanban-automation-runtime-plan.md',
  'docs/superpowers/plans/2026-04-23-kanban-boards-work-cleanup-plan.md',
  'docs/superpowers/plans/2026-04-23-kanban-worktree-cli-plan.md',
  'docs/superpowers/plans/2026-04-30-agent-runner-codex-review-remediation-plan.md',
  'docs/superpowers/plans/2026-05-02-kanban-system-hardening-plan.md',
];
const planProgressScore = Math.round(planFiles.reduce((sum, planFile) => sum + planProgress(planFile).score, 0) / planFiles.length);
const globalOverall = deterministicScore;
const requiredFailures = evals.some(item => item.required && item.checks.some(check => !check.pass));

const result = {
  generatedAt: new Date().toISOString(),
  scoring: {
    deterministicScore,
    planProgressScore,
    globalOverall,
    llmJudgeAverage: null as number | null,
    llmJudgeStatus: 'unavailable: no repo-local LLM judge command or credentials were found',
    testGate,
  },
  global: {
    buildCommand: packageJson.scripts?.build ?? null,
    testCommand: packageJson.scripts?.test ?? null,
    evalCommand: 'pnpm eval:superpowers',
  },
  superpowers: evals,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`# Superpower Eval (${result.generatedAt})`);
  console.log('');
  console.log(`Global overall: ${result.scoring.globalOverall}%`);
  console.log(`Deterministic score: ${result.scoring.deterministicScore}%`);
  console.log(`Plan progress score: ${result.scoring.planProgressScore}%`);
  console.log(`LLM judge average: ${result.scoring.llmJudgeAverage ?? 'n/a'} (${result.scoring.llmJudgeStatus})`);
  if (result.scoring.testGate.enabled) {
    console.log(`Test gate: ${result.scoring.testGate.passed ? 'pass' : 'fail'}`);
    for (const command of result.scoring.testGate.commands) {
      console.log(`- ${command.command} ${command.args.join(' ')}: exit ${command.exitCode ?? 'null'}`);
    }
  }
  console.log('');
  console.log('| Superpower | Score | Plan progress | Passed | Local eval |');
  console.log('| --- | ---: | ---: | ---: | --- |');
  for (const item of evals) {
    console.log(`| ${item.name} | ${item.deterministicScore}% | ${item.planProgress.score}% | ${item.passed}/${item.total} | \`${item.localEvalCommand}\` |`);
  }
  console.log('');
  console.log('## Failed Checks');
  for (const item of evals) {
    const failed = item.checks.filter(check => !check.pass);
    if (failed.length === 0) continue;
    console.log(`- ${item.name}: ${failed.map(check => check.name).join('; ')}`);
  }
}

if (requiredFailures || !testGate.passed) {
  process.exitCode = 1;
}
