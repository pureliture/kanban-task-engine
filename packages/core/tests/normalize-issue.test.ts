import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { parseIssueMarkdown, validateIssueFrontmatterForRegistry } from '@kanban-task-engine/schema';
import { normalizeIssue } from '../src/authoring';

async function makeVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-normalize-'));
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

async function makeSingleSpaceVault(): Promise<string> {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-authoring-normalize-single-'));
  await fs.mkdir(path.join(vault, 'issues/openclaw'), { recursive: true });
  await fs.mkdir(path.join(vault, 'issues/openclaw/_epics'), { recursive: true });
  await fs.writeFile(path.join(vault, 'registry.yaml'), `spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
`);
  return vault;
}

describe('normalizeIssue', () => {
  it('creates a canonical target for vault-internal rough notes and preserves source', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough title\n\nSome context only.\n');
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.inPlace).toBe(false);
    expect(result.wrote).toBe(true);
    expect(result.hasPlaceholders).toBe(true);
    expect(result.executionReady).toBe(false);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('Some context only.');
    const normalized = await fs.readFile(result.targetPath, 'utf8');
    expect(normalized).toContain('kanban:placeholder');
    assertFormalDraft(normalized, 'container');
  });

  it('preserves unknown non-deprecated frontmatter keys', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, `---
title: Rough with metadata
custom_field: keep-me
---
# Rough with metadata
`);
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
      now: new Date('2026-05-12T00:00:00.000Z'),
    });
    expect(result.markdown).toContain('custom_field: keep-me');
    assertFormalDraft(result.markdown, 'container');
  });

  it.each(['READY', 'RUNNING', 'REVIEW', 'DONE'] as const)(
    'downgrades placeholder-bearing %s rough notes to TODO',
    async status => {
      const vault = await makeVault();
      await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
      const source = path.join(vault, `inbox/${status.toLowerCase()}.md`);
      await fs.writeFile(source, `---
status: ${status}
---
# ${status} but empty
`);
      const result = await normalizeIssue({
        vaultRoot: vault,
        sourcePath: source,
        space: 'vibe-coding',
        project: 'kanban-task-engine',
        write: false,
        now: new Date('2026-05-12T00:00:00.000Z'),
      });
      expect(result.markdown).toContain('status: TODO');
      expect(result.warnings.join('\n')).toContain(`Placeholder content prevents ${status} status`);
      assertFormalDraft(result.markdown, 'container');
    },
  );

  it('rejects source paths outside the vault', async () => {
    const vault = await makeVault();
    const outside = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'outside-')), 'rough.md');
    await fs.writeFile(outside, '# Outside\n');
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: outside, write: false })).rejects.toThrow('Source path is outside vault');
  });

  it('rejects symlink source paths that resolve outside the vault', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outside = path.join(outsideDir, 'rough.md');
    await fs.writeFile(outside, '# Outside through symlink\n');
    const link = path.join(vault, 'inbox/link.md');
    await fs.symlink(outside, link);
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: link,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Source path is outside vault');
  });

  it('rejects non-Markdown sources before check or write', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.txt');
    await fs.writeFile(source, '# Not markdown\n');

    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Source file is not Markdown');
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Source file is not Markdown');
  });

  it('rejects unsafe execution metadata preserved from rough frontmatter', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const mergeSource = path.join(vault, 'inbox/bad-merge.md');
    await fs.writeFile(mergeSource, `---
merge_into: -bad
---
# Bad merge
`);
    const workdirSource = path.join(vault, 'inbox/bad-workdir.md');
    await fs.writeFile(workdirSource, `---
working_dir: "bad\\npath"
---
# Bad working dir
`);

    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: mergeSource,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Invalid merge_into');
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: workdirSource,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Invalid working_dir');

    const originMergeSource = path.join(vault, 'inbox/bad-origin-merge.md');
    await fs.writeFile(originMergeSource, `---
merge_into: origin/--detach
---
# Bad origin merge
`);
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: originMergeSource,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Invalid merge_into');
  });
});

describe('normalizeIssue ownership and writeback', () => {
  it('rewrites in place only for the sole owner in the correct project root', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Owned
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
custom_field: keep-me
---
# Owned
`);
    const result = await normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true });
    expect(result.inPlace).toBe(true);
    expect(result.targetPath).toBe(source);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('custom_field: keep-me');
  });

  it('re-reads in-place source content inside the authoring lock before writing', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Before lock
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Before lock
`);
    const lockDir = await authoringLockDir(vault, 'vibe-coding');
    await fs.mkdir(lockDir, { recursive: true });
    const pending = normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true });
    await sleep(100);
    await fs.writeFile(source, `---
id: VC-001
title: Fresh edit
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Fresh edit
`);
    await fs.rm(lockDir, { recursive: true, force: true });
    const result = await pending;
    expect(result.markdown).toContain('Fresh edit');
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('Fresh edit');
  });

  it('rejects in-place rewrite when project frontmatter does not match the project root', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Wrong project
type: task
status: TODO
executor: human
project: other-project
created: 2026-05-12
updated: 2026-05-12
---
# Wrong project
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Project does not match registry root');
  });

  it('rewrites single-space issue roots in place with empty project', async () => {
    const vault = await makeSingleSpaceVault();
    const source = path.join(vault, 'issues/openclaw/OC-001-owned.md');
    await fs.writeFile(source, `---
id: OC-001
title: Single owned
type: task
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# Single owned
`);
    const result = await normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true });
    expect(result.inPlace).toBe(true);
    expect(result.targetPath).toBe(source);
    assertFormalDraft(result.markdown, 'single', 'OC');
  });

  it('rewrites nested single-space epic roots without ambiguous root matches', async () => {
    const vault = await makeSingleSpaceVault();
    const source = path.join(vault, 'issues/openclaw/_epics/OC-001-epic.md');
    await fs.writeFile(source, `---
id: OC-001
title: Single epic
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# Single epic
`);
    const result = await normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true });
    expect(result.inPlace).toBe(true);
    expect(result.targetPath).toBe(source);
    assertFormalDraft(result.markdown, 'single', 'OC');
  });

  it('rejects in-place rewrite when an issue-root source claims epic type', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    await fs.writeFile(source, `---
id: VC-001
title: Wrong root type
type: epic
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Wrong root type
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Epic frontmatter does not match registry root');
  });

  it('rejects in-place rewrite when id prefix does not match the owning space', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/OC-001-owned.md');
    await fs.writeFile(source, `---
id: OC-001
title: Wrong prefix
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Wrong prefix
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Issue id prefix does not match registry space');
  });

  it('fails normalize write when target scan scope has malformed files without reliable ids', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/broken.md'), 'not: [valid');
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough\n');
    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Cannot allocate issue id while scan has fatal errors');
  });

  it('surfaces scan warnings from malformed files with reliable filename ids', async () => {
    const vault = await makeVault();
    await fs.writeFile(path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-010-broken.md'), `---
not: [valid
---
# Broken
`);
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, '# Rough\n');
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    });
    expect(result.warnings.join('\n')).toContain('VC-010-broken.md');
  });

  it('rejects in-place rewrite when another file owns the same id', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-owned.md');
    const duplicate = path.join(vault, 'issues/vibe-coding/_epics/VC-001-duplicate.md');
    await fs.writeFile(source, `---
id: VC-001
title: Owned
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Owned
`);
    await fs.writeFile(duplicate, `---
id: VC-001
title: Duplicate
type: epic
status: TODO
executor: human
project: ""
created: 2026-05-12
updated: 2026-05-12
---
# Duplicate
`);
    await expect(normalizeIssue({ vaultRoot: vault, sourcePath: source, write: true })).rejects.toThrow('Duplicate issue ids');
  });

  it('rejects canonical write when rough frontmatter id is already owned by another file', async () => {
    const vault = await makeVault();
    const existing = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-existing.md');
    await fs.writeFile(existing, `---
id: VC-001
title: Existing
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Existing
`);
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/rough.md');
    await fs.writeFile(source, `---
id: VC-001
title: Rough duplicate
---
# Rough duplicate
`);

    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })).rejects.toThrow('Duplicate issue ids');
  });

  it('rejects canonical epic target when project is supplied', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const source = path.join(vault, 'inbox/epic.md');
    await fs.writeFile(source, `---
type: epic
---
# Project-scoped epic
`);

    await expect(normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: false,
    })).rejects.toThrow('Project is not allowed for epic issues');
  });

  it('allocates unique ids for concurrent canonical writes', async () => {
    const vault = await makeVault();
    await fs.mkdir(path.join(vault, 'inbox'), { recursive: true });
    const sources = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const source = path.join(vault, `inbox/rough-${index + 1}.md`);
      await fs.writeFile(source, `# Concurrent ${index + 1}\n`);
      return source;
    }));

    const results = await Promise.all(sources.map(source => normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    })));

    expect(new Set(results.map(result => result.id)).size).toBe(results.length);
    expect(results.map(result => result.id).sort()).toEqual([
      'VC-001',
      'VC-002',
      'VC-003',
      'VC-004',
      'VC-005',
      'VC-006',
      'VC-007',
      'VC-008',
    ]);
  });

  it('creates a canonical target when an issue-root source has only a filename id', async () => {
    const vault = await makeVault();
    const source = path.join(vault, 'issues/vibe-coding/kanban-task-engine/VC-001-rough.md');
    await fs.writeFile(source, `---
title: Filename id only
type: task
status: TODO
executor: human
project: kanban-task-engine
created: 2026-05-12
updated: 2026-05-12
---
# Filename id only
`);
    const result = await normalizeIssue({
      vaultRoot: vault,
      sourcePath: source,
      space: 'vibe-coding',
      project: 'kanban-task-engine',
      write: true,
    });
    expect(result.inPlace).toBe(false);
    expect(result.targetPath).not.toBe(source);
    await expect(fs.readFile(source, 'utf8')).resolves.toContain('Filename id only');
  });
});

function assertFormalDraft(markdown: string, spaceType: 'single' | 'container', idPrefix = 'VC'): void {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  expect(match).not.toBeNull();
  if (!match) throw new Error('Missing YAML frontmatter');
  const frontmatter = YAML.parse(match[1]);
  expect(validateIssueFrontmatterForRegistry(frontmatter, { idPrefix, spaceType }).ok).toBe(true);
  if (spaceType === 'container') {
    const parsed = parseIssueMarkdown(markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  }
}

async function authoringLockDir(vaultRoot: string, space: string): Promise<string> {
  const realVaultRoot = await fs.realpath(vaultRoot);
  const digest = crypto.createHash('sha256').update(`${realVaultRoot}\0${space}`).digest('hex');
  return path.join(os.tmpdir(), 'kanban-task-engine-authoring-locks', digest);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
