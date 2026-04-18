import { describe, it, expect } from 'vitest';
import { validatePath, ALLOWED_BASE_PATHS, isPathWithinAllowed } from '../src/store/path-validator';
import path from 'path';

describe('path-validator', () => {
  describe('ALLOWED_BASE_PATHS', () => {
    it('should contain at least one allowed base path', () => {
      expect(ALLOWED_BASE_PATHS.length).toBeGreaterThan(0);
    });
  });

  describe('validatePath', () => {
    it('should allow paths within allowed base paths', () => {
      const basePath = ALLOWED_BASE_PATHS[0];
      const validPath = path.join(basePath, 'issues', 'test.md');
      expect(() => validatePath(validPath)).not.toThrow();
    });

    it('should reject path traversal attempts with ../', () => {
      const basePath = ALLOWED_BASE_PATHS[0];
      const maliciousPath = path.join(basePath, '../../../etc/passwd');
      expect(() => validatePath(maliciousPath)).toThrow('Path traversal blocked');
    });

    it('should reject absolute paths outside allowed bases', () => {
      expect(() => validatePath('/etc/passwd')).toThrow('Path traversal blocked');
    });

    it('should return resolved canonical path', () => {
      const basePath = ALLOWED_BASE_PATHS[0];
      const inputPath = path.join(basePath, 'issues', './test.md');
      const result = validatePath(inputPath);
      expect(result).toBe(path.resolve(inputPath));
    });
  });

  describe('isPathWithinAllowed', () => {
    it('should return true for allowed paths', () => {
      const basePath = ALLOWED_BASE_PATHS[0];
      expect(isPathWithinAllowed(path.join(basePath, 'test.md'))).toBe(true);
    });

    it('should return false for disallowed paths', () => {
      expect(isPathWithinAllowed('/etc/passwd')).toBe(false);
    });
  });
});