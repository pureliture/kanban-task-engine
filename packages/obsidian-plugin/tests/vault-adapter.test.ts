import { describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { ObsidianVaultPort, deriveDesktopVaultRoot } from '../src/vault-adapter';

describe('ObsidianVaultPort', () => {
  it('derives desktop root from the Obsidian filesystem adapter', () => {
    expect(deriveDesktopVaultRoot({
      adapter: {
        getBasePath: () => '/vault/root',
      },
    } as never)).toBe('/vault/root');
  });

  it('delegates read, cachedRead, and process through markdown TFile objects', async () => {
    const note = makeFile('issues/VC-001.md');
    const vault = createVaultMock({
      files: {
        [note.path]: note,
      },
      read: vi.fn(async (file: TFile) => `read:${file.path}`),
      cachedRead: vi.fn(async (file: TFile) => `cached:${file.path}`),
      process: vi.fn(async (file: TFile, updater: (content: string) => string) => updater(`old:${file.path}`)),
    });
    const port = new ObsidianVaultPort(vault as never, '/vault/root');

    await expect(port.read(note.path)).resolves.toBe('read:issues/VC-001.md');
    await expect(port.cachedRead(note.path)).resolves.toBe('cached:issues/VC-001.md');
    await expect(port.process(note.path, content => `${content}:next`)).resolves.toBe('old:issues/VC-001.md:next');
    expect(vault.read).toHaveBeenCalledWith(note);
    expect(vault.cachedRead).toHaveBeenCalledWith(note);
    expect(vault.process).toHaveBeenCalledWith(note, expect.any(Function));
  });

  it('supports registry.yaml reads while still requiring markdown files for process', async () => {
    const registry = makeFile('registry.yaml');
    const vault = createVaultMock({
      files: {
        [registry.path]: registry,
      },
      read: vi.fn(async () => 'spaces: {}'),
    });
    const port = new ObsidianVaultPort(vault as never, '/vault/root');

    await expect(port.read('registry.yaml')).resolves.toBe('spaces: {}');
    await expect(port.process('registry.yaml', content => content)).rejects.toThrow(/not a markdown file/i);
  });

  it('validates unsafe vault-relative paths before touching Obsidian APIs', async () => {
    const vault = createVaultMock();
    const port = new ObsidianVaultPort(vault as never, '/vault/root');

    await expect(port.read('/absolute.md')).rejects.toThrow(/Unsafe vault-relative path/);
    await expect(port.read('../escape.md')).rejects.toThrow(/Unsafe vault-relative path/);
    await expect(port.read('bad\\path.md')).rejects.toThrow(/Unsafe vault-relative path/);
    await expect(port.read('bad\0path.md')).rejects.toThrow(/Unsafe vault-relative path/);
    expect(vault.getAbstractFileByPath).not.toHaveBeenCalled();
  });

  it('throws helpful errors for missing files and non-markdown files', async () => {
    const textFile = makeFile('notes/plain.txt');
    const folder = makeFolder('notes/folder.md');
    const port = new ObsidianVaultPort(createVaultMock({
      files: {
        [textFile.path]: textFile,
        [folder.path]: folder,
      },
    }) as never, '/vault/root');

    await expect(port.read('missing.md')).rejects.toMatchObject({
      message: 'Vault file not found: missing.md',
      code: 'ENOENT',
    });
    await expect(port.read(textFile.path)).rejects.toThrow('Vault path is not a markdown file: notes/plain.txt');
    await expect(port.read(folder.path)).rejects.toThrow('Vault path is not a markdown file: notes/folder.md');
  });

  it('creates missing parent folders and creates the markdown file', async () => {
    const createdFolders: string[] = [];
    const vault = createVaultMock({
      createFolder: vi.fn(async (folderPath: string) => {
        createdFolders.push(folderPath);
        return makeFolder(folderPath);
      }),
      create: vi.fn(async (relativePath: string) => makeFile(relativePath)),
    });
    const port = new ObsidianVaultPort(vault as never, '/vault/root');

    await port.create('issues/vibe-coding/VC-001.md', 'content');

    expect(createdFolders).toEqual(['issues', 'issues/vibe-coding']);
    expect(vault.create).toHaveBeenCalledWith('issues/vibe-coding/VC-001.md', 'content');
  });

  it('checks markdown existence and lists markdown files by path prefix', async () => {
    const issue = makeFile('issues/VC-001.md');
    const nested = makeFile('issues/nested/VC-002.md');
    const other = makeFile('other/VC-003.md');
    const text = makeFile('issues/plain.txt');
    const port = new ObsidianVaultPort(createVaultMock({
      files: {
        [issue.path]: issue,
        [nested.path]: nested,
        [other.path]: other,
        [text.path]: text,
      },
      markdownFiles: [other, nested, issue],
    }) as never, '/vault/root');

    await expect(port.exists(issue.path)).resolves.toBe(true);
    await expect(port.exists(text.path)).resolves.toBe(false);
    await expect(port.exists('missing.md')).resolves.toBe(false);
    await expect(port.listMarkdownFiles('issues')).resolves.toEqual([
      'issues/VC-001.md',
      'issues/nested/VC-002.md',
    ]);
  });
});

function createVaultMock(input: {
  files?: Record<string, TFile | TFolder>;
  markdownFiles?: TFile[];
  read?: (file: TFile) => Promise<string>;
  cachedRead?: (file: TFile) => Promise<string>;
  process?: (file: TFile, updater: (content: string) => string) => Promise<string>;
  create?: (relativePath: string, content: string) => Promise<TFile>;
  createFolder?: (folderPath: string) => Promise<TFolder>;
} = {}) {
  const folders = new Set<string>();
  return {
    adapter: {
      getBasePath: () => '/vault/root',
    },
    getAbstractFileByPath: vi.fn((relativePath: string) => input.files?.[relativePath] ?? null),
    getFolderByPath: vi.fn((relativePath: string) => folders.has(relativePath) ? makeFolder(relativePath) : null),
    getMarkdownFiles: vi.fn(() => input.markdownFiles ?? Object.values(input.files ?? {}).filter((file): file is TFile => file instanceof TFile && file.extension === 'md')),
    read: vi.fn(input.read ?? (async file => `read:${file.path}`)),
    cachedRead: vi.fn(input.cachedRead ?? (async file => `cached:${file.path}`)),
    process: vi.fn(input.process ?? (async (_file, updater) => updater('old'))),
    create: vi.fn(input.create ?? (async relativePath => makeFile(relativePath))),
    createFolder: vi.fn(input.createFolder ?? (async folderPath => {
      folders.add(folderPath);
      return makeFolder(folderPath);
    })),
  };
}

function makeFile(relativePath: string): TFile {
  const file = new TFile();
  const name = relativePath.split('/').pop() ?? relativePath;
  const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';
  Object.assign(file, {
    path: relativePath,
    name,
    extension,
    basename: extension ? name.slice(0, -extension.length - 1) : name,
    stat: {
      ctime: 0,
      mtime: 0,
      size: 0,
    },
  });
  return file;
}

function makeFolder(relativePath: string): TFolder {
  const folder = new TFolder();
  Object.assign(folder, {
    path: relativePath,
    name: relativePath.split('/').pop() ?? relativePath,
    children: [],
  });
  return folder;
}
