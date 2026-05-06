import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const verifier = join(repoRoot, 'scripts/verify-docs.py');
const tempRoots: string[] = [];

async function makeFixture(options: {
  svg: string;
  drawio?: string;
  readmeImage?: string;
  statusSource?: string;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kanban-docs-verify-'));
  tempRoots.push(root);

  await mkdir(join(root, 'docs/design'), { recursive: true });
  await mkdir(join(root, 'packages/schema/src'), { recursive: true });
  await mkdir(join(root, 'packages/core/src/executor'), { recursive: true });

  const image = options.readmeImage ?? 'docs/design/kanban-task-engine-one-page.svg';
  await writeFile(
    join(root, 'README.md'),
    [
      '# fixture',
      '',
      '<p align="center">',
      '  <a href="docs/design/kanban-task-engine-one-page.svg">',
      `    <img src="${image}" alt="Architecture overview" width="100%" />`,
      '  </a>',
      '</p>',
      '',
      'validate-only READY RUNNING',
      '',
      '<details><summary>Architecture Detail (Text Version)</summary>',
      'Vault Engine External Work Mode lifecycle policy codex-runner REVIEW DONE FAILED',
      'IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)',
      '</details>',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(root, 'docs/design/README.md'),
    [
      '# docs/design',
      '',
      '`kanban-task-engine-one-page.drawio`',
      '`kanban-task-engine-one-page.svg`',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(root, 'docs/design/kanban-task-engine-one-page.drawio'),
    options.drawio ??
      '<mxfile><diagram><mxGraphModel><root>Vault Engine Markdown Canonical Recipe TODO READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</root></mxGraphModel></diagram></mxfile>',
    'utf8',
  );

  await writeFile(join(root, 'docs/design/kanban-task-engine-one-page.svg'), options.svg, 'utf8');
  await writeFile(
    join(root, 'packages/schema/src/status.ts'),
    options.statusSource ??
      `export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;
export const VALID_ISSUE_TRANSITIONS = [
  { from: 'TODO', to: 'READY' },
  { from: 'READY', to: 'RUNNING' },
  { from: 'READY', to: 'TODO' },
  { from: 'RUNNING', to: 'REVIEW' },
  { from: 'RUNNING', to: 'FAILED' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'FAILED', to: 'READY' },
];`,
    'utf8',
  );

  return root;
}

function runVerify(root: string): { status: number | null; output: string } {
  const result = spawnSync('python3', [verifier, '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

function validSvg(extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480">
  <title>Architecture fixture</title>
  <desc>Fixture SVG for docs verification tests.</desc>
  <defs>
    <style>
      text { font-family: Arial, sans-serif; }
      .title { font-size: 22px; font-weight: 700; fill: #172033; }
      .body { font-size: 14px; fill: #263548; }
    </style>
  </defs>
  <rect x="0" y="0" width="720" height="480" fill="#f8fafc"></rect>
  <text x="32" y="48" class="title">kanban-task-engine Architecture</text>
  <text x="32" y="90" class="body">Vault Engine Markdown Canonical Recipe</text>
  <text x="32" y="120" class="body">TODO READY RUNNING REVIEW DONE FAILED</text>
  <text x="32" y="150" class="body">IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</text>
  <text x="32" y="180" class="body">Jira Worktree codex-runner validate-only SoT</text>
  ${extra}
</svg>`;
}

describe('verify-docs SVG rendering contract', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('keeps the Python verifier split behind a small CLI wrapper', async () => {
    const wrapper = await readFile(verifier, 'utf8');
    const wrapperLineCount = wrapper.split('\n').length;
    const expectedModules = [
      'scripts/verify_docs/cli.py',
      'scripts/verify_docs/common.py',
      'scripts/verify_docs/readme.py',
      'scripts/verify_docs/status.py',
      'scripts/verify_docs/svg.py',
      'scripts/verify_docs/svg_dom.py',
    ];
    const moduleLineCounts = expectedModules.map(modulePath => ({
      modulePath,
      lineCount: existsSync(join(repoRoot, modulePath))
        ? readFileSync(join(repoRoot, modulePath), 'utf8').split('\n').length
        : 0,
    }));

    expect(wrapperLineCount).toBeLessThanOrEqual(40);
    expect(wrapper).toContain('from verify_docs.cli import main');
    expect(expectedModules.every(modulePath => existsSync(join(repoRoot, modulePath)))).toBe(true);
    expect(moduleLineCounts.every(({ lineCount }) => lineCount > 0 && lineCount <= 220)).toBe(true);
  });

  it('fails when SVG text uses an undefined class', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="220" class="missing">Undefined class text</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('undefined SVG classes');
    expect(result.output).toContain('missing');
  });

  it('fails when SVG has no full-viewBox background', async () => {
    const root = await makeFixture({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480">
        <title>Architecture fixture</title>
        <desc>Fixture SVG for docs verification tests.</desc>
        <text x="32" y="48" font-size="18">Vault Engine Markdown Canonical Recipe TODO READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</text>
      </svg>`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('full-viewBox background');
  });

  it('fails when README effective body font is too small at 900px', async () => {
    const root = await makeFixture({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
        <title>Architecture fixture</title>
        <desc>Fixture SVG for docs verification tests.</desc>
        <rect x="0" y="0" width="1600" height="900" fill="#f8fafc"></rect>
        <text x="20" y="40" font-size="10">Vault Engine Markdown Canonical Recipe TODO READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</text>
      </svg>`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('effective README font-size');
  });

  it('fails on external SVG references', async () => {
    const root = await makeFixture({
      svg: validSvg('<style>@import url("https://example.com/a.css");</style><image href="https://example.com/a.png"></image>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('external SVG reference');
  });

  it('fails on false package labels not backed by repo packages', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="220" class="body">packages/adapter-codex</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('non-existent package label');
    expect(result.output).toContain('packages/adapter-codex');
  });

  it('fails on the bare adapter-codex label because no such package exists', async () => {
    const root = await makeFixture({
      svg: validSvg('<text x="32" y="220" class="body">adapter-codex</text>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('forbidden Codex adapter label');
    expect(result.output).toContain('adapter-codex');
  });

  it('ignores unrelated decorative README SVGs when checking architecture readability', async () => {
    const root = await makeFixture({
      readmeImage: 'docs/design/kanban-task-engine-architecture-overview.svg',
      svg: validSvg(),
    });
    await writeFile(
      join(root, 'README.md'),
      [
        '# fixture',
        '',
        '<img src="docs/design/hero-header.svg" alt="decorative header" width="100%" />',
        '',
        '<p align="center">',
        '  <a href="docs/design/kanban-task-engine-one-page.svg">',
        '    <img src="docs/design/kanban-task-engine-architecture-overview.svg" alt="Architecture overview" width="100%" />',
        '  </a>',
        '</p>',
        '',
        'validate-only READY RUNNING',
        '',
        '<details><summary>Architecture Detail (Text Version)</summary>',
        'Vault Engine External Work Mode lifecycle policy codex-runner REVIEW DONE FAILED',
        'IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)',
        '</details>',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(root, 'docs/design/hero-header.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 200"><text x="1" y="12" font-size="6">tiny decorative text</text></svg>',
      'utf8',
    );
    await writeFile(join(root, 'docs/design/kanban-task-engine-architecture-overview.svg'), validSvg(), 'utf8');
    await writeFile(
      join(root, 'docs/design/README.md'),
      [
        '# docs/design',
        '',
        '`kanban-task-engine-one-page.drawio`',
        '`kanban-task-engine-one-page.svg`',
        '`kanban-task-engine-architecture-overview.svg`',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = runVerify(root);

    expect(result.status).toBe(0);
    expect(result.output).not.toContain('hero-header.svg');
  });

  it('fails when drawio and svg critical labels drift', async () => {
    const root = await makeFixture({
      svg: validSvg(),
      drawio: '<mxfile><diagram><mxGraphModel><root>Vault Engine Markdown Canonical Recipe TODO READY RUNNING REVIEW DONE FAILED Jira Worktree validate-only SoT IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</root></mxGraphModel></diagram></mxfile>',
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('drawio/svg critical label drift');
    expect(result.output).toContain('codex');
  });

  it('fails when diagram status truth drifts from packages/schema/src/status.ts', async () => {
    const root = await makeFixture({
      svg: validSvg(),
      statusSource:
        `export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE'] as const;
export const VALID_ISSUE_TRANSITIONS = [
  { from: 'TODO', to: 'READY' },
];`,
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('status.ts/SVG status drift');
    expect(result.output).toContain('FAILED');
    expect(result.output).toContain('8');
  });

  it('fails when SVG contains script or foreignObject', async () => {
    const root = await makeFixture({
      svg: validSvg('<script>alert(1)</script><foreignObject x="1" y="1" width="1" height="1"></foreignObject>'),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('forbidden SVG element');
  });

  it('fails clearly when the architecture README embed SVG path is missing', async () => {
    const root = await makeFixture({
      readmeImage: 'docs/design/Missing-Architecture.svg',
      svg: validSvg(),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('architecture README embed SVG does not exist');
    expect(result.output).toContain('Missing-Architecture.svg');
  });

  it('fails when the architecture README embed SVG path escapes the fixture root', async () => {
    const root = await makeFixture({
      readmeImage: '../outside.svg',
      svg: validSvg(),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('architecture README embed SVG path must stay inside repository');
    expect(result.output).toContain('../outside.svg');
  });

  it('fails when the architecture README embed SVG path is absolute', async () => {
    const root = await makeFixture({
      readmeImage: '/tmp/outside.svg',
      svg: validSvg(),
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('architecture README embed SVG path must be repository-relative');
    expect(result.output).toContain('/tmp/outside.svg');
  });

  it('fails when drawio XML is malformed even if expected tag strings are present', async () => {
    const root = await makeFixture({
      svg: validSvg(),
      drawio: '<mxfile><diagram><mxGraphModel>Vault Engine Markdown Canonical Recipe TODO READY RUNNING REVIEW DONE FAILED Jira Worktree codex-runner validate-only SoT IssueStatus (6) VALID_ISSUE_TRANSITIONS (8)</diagram></mxfile>',
    });

    const result = runVerify(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('draw.io XML parse error');
  });

  it('passes a self-contained README-safe SVG', async () => {
    const root = await makeFixture({ svg: validSvg() });

    const result = runVerify(root);

    expect(result.status).toBe(0);
    expect(result.output).toContain('ALL CHECKS PASSED');
  });
});
