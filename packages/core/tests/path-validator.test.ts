import { describe, it, expect } from 'vitest';
import { validatePath, getAllowedBasePaths, isPathWithinAllowed } from '../src/store/path-validator';
import { resolveVaultPath } from '../src/store/vault-path';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('path-validator', () => {
  describe('getAllowedBasePaths', () => {
    it('should contain at least one allowed base path', () => {
      expect(getAllowedBasePaths().length).toBeGreaterThan(0);
    });
  });

  describe('validatePath', () => {
    it('should allow paths within allowed base paths', () => {
      const basePath = getAllowedBasePaths()[0];
      const validPath = path.join(basePath, 'test.md');
      expect(() => validatePath(validPath)).not.toThrow();
    });

    it('should reject path traversal attempts with ../', () => {
      const basePath = getAllowedBasePaths()[0];
      const maliciousPath = path.join(basePath, '../../../etc/passwd');
      expect(() => validatePath(maliciousPath)).toThrow('Path traversal blocked');
    });

    it('should reject absolute paths outside allowed bases', () => {
      expect(() => validatePath('/etc/passwd')).toThrow('Path traversal blocked');
    });

    it('should return resolved canonical path', () => {
      const basePath = getAllowedBasePaths()[0];
      const inputPath = path.join(basePath, './test.md');
      const result = validatePath(inputPath);
      expect(result).toBe(path.resolve(inputPath));
    });
  });

  describe('isPathWithinAllowed', () => {
    it('should return true for allowed paths', () => {
      const basePath = getAllowedBasePaths()[0];
      expect(isPathWithinAllowed(path.join(basePath, 'test.md'))).toBe(true);
    });

    it('should return false for disallowed paths', () => {
      expect(isPathWithinAllowed('/etc/passwd')).toBe(false);
    });
  });

  describe('resolveVaultPath', () => {
    it('rejects unsafe path segments', async () => {
      for (const segment of ['..', '.', '', '   ', '/absolute', 'a/b', 'a\\b', `nul\0x`]) {
        await expect(resolveVaultPath('/vault', 'issues', segment, 'escape.md'))
          .rejects.toThrow('Unsafe vault path segment');
      }
    });

    it('rejects symlink escapes from the vault root', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-vault-'));
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-outside-'));
      await fs.symlink(outside, path.join(root, 'issues-link'));

      await expect(resolveVaultPath(root, 'issues-link', 'VC-001.md'))
        .rejects.toThrow('Vault path escapes root');
    });

    it('allows non-existing writes below an existing safe parent', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-vault-'));
      await fs.mkdir(path.join(root, 'issues'));

      await expect(resolveVaultPath(root, 'issues', 'VC-001.md'))
        .resolves.toBe(path.join(root, 'issues', 'VC-001.md'));
    });
  });
});
