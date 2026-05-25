import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, symlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NodeFsVaultPort } from '../../src/ports/node-fs-vault-port';

describe('NodeFsVaultPort', () => {
  it('creates, reads, processes, and lists vault-relative markdown files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-'));
    const vault = new NodeFsVaultPort(root);

    await vault.create('issues/vibe-coding/VC-001.md', '# One\n');
    expect(await vault.exists('issues/vibe-coding/VC-001.md')).toBe(true);
    expect(await vault.read('issues/vibe-coding/VC-001.md')).toBe('# One\n');

    const updated = await vault.process('issues/vibe-coding/VC-001.md', content =>
      content.replace('One', 'Two'),
    );

    expect(updated).toBe('# Two\n');
    expect(await readFile(path.join(root, 'issues/vibe-coding/VC-001.md'), 'utf8')).toBe('# Two\n');
    await expect(readdir(path.join(root, 'issues/vibe-coding'))).resolves.not.toContain('VC-001.md.tmp');
    expect(await vault.listMarkdownFiles('issues')).toEqual(['issues/vibe-coding/VC-001.md']);
  });

  it('rejects absolute and escaping paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-'));
    const vault = new NodeFsVaultPort(root);

    await expect(vault.read('/tmp/outside.md')).rejects.toThrow('Unsafe vault-relative path');
    await expect(vault.create('../outside.md', '# nope')).rejects.toThrow('Unsafe vault-relative path');
  });

  it('rejects vault-relative paths through symlinked ancestors outside the vault', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-outside-'));
    await writeFile(path.join(outside, 'secret.md'), '# Secret\n', 'utf8');
    await symlink(outside, path.join(root, 'link'), 'dir');
    const vault = new NodeFsVaultPort(root);

    await expect(vault.read('link/secret.md')).rejects.toThrow(
      /Unsafe vault-relative path|Vault path escapes root/,
    );
    await expect(vault.process('link/secret.md', content => content.replace('Secret', 'Changed')))
      .rejects.toThrow(/Unsafe vault-relative path|Vault path escapes root/);
    await expect(vault.create('link/secret.md', '# nope\n')).rejects.toThrow(
      /Unsafe vault-relative path|Vault path escapes root/,
    );
    expect(await readFile(path.join(outside, 'secret.md'), 'utf8')).toBe('# Secret\n');
  });

  it('skips dot entries like .git, .obsidian, or .DS_Store during walk', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kte-vault-port-dots-'));
    const vault = new NodeFsVaultPort(root);

    await vault.create('issues/VC-001.md', '# One\n');
    await mkdir(path.join(root, '.git'), { recursive: true });
    await writeFile(path.join(root, '.git/secret.md'), '# Secret\n', 'utf8');
    await mkdir(path.join(root, '.obsidian'), { recursive: true });
    await writeFile(path.join(root, '.obsidian/settings.md'), '# Settings\n', 'utf8');
    await writeFile(path.join(root, '.DS_Store'), 'binary', 'utf8');

    const files = await vault.listMarkdownFiles();
    expect(files).toEqual(['issues/VC-001.md']);
  });
});
