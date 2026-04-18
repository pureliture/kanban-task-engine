import { describe, it, expect } from 'vitest';
import { FileWatcher } from '../src/store/file-watcher';

describe('FileWatcher', () => {
  describe('constructor', () => {
    it('should use default values for options', () => {
      const watcher = new FileWatcher();
      expect(watcher).toBeDefined();
    });

    it('should accept custom pattern option', () => {
      const watcher = new FileWatcher({ pattern: 'issues/**/*.md' });
      expect(watcher).toBeDefined();
    });

    it('should accept custom basePath option', () => {
      const watcher = new FileWatcher({ basePath: '/test' });
      expect(watcher).toBeDefined();
    });

    it('should accept custom depth option', () => {
      const watcher = new FileWatcher({ depth: 5 });
      expect(watcher).toBeDefined();
    });
  });

  describe('getLastEvent', () => {
    it('should return null when no events have occurred', () => {
      const watcher = new FileWatcher({ basePath: '/test' });
      expect(watcher.getLastEvent()).toBeNull();
    });
  });

  describe('simulateFileChange', () => {
    it('should store last event when simulateFileChange is called', async () => {
      const watcher = new FileWatcher({
        pattern: 'issues/**/*.md',
        basePath: '/test',
        debounceMs: 50,
      });

      const nestedFile = '/test/issues/vibe-coding/project-a/TK-001.md';
      watcher.simulateFileChange(nestedFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(watcher.getLastEvent()?.filePath).toBe(nestedFile);
      expect(watcher.getLastEvent()?.type).toBe('change');
    });
  });

  describe('nested directory support', () => {
    it('should watch nested directories for container workspaces', async () => {
      const watcher = new FileWatcher({
        pattern: 'issues/**/*.md',
        basePath: '/test',
        debounceMs: 50,
      });

      // Simulate file change in nested directory
      const nestedFile = '/test/issues/vibe-coding/project-a/TK-001.md';
      watcher.simulateFileChange(nestedFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(watcher.getLastEvent()?.filePath).toBe(nestedFile);
    });

    it('should detect changes at root and nested levels', async () => {
      const watcher = new FileWatcher({
        pattern: 'issues/**/*.md',
        basePath: '/test',
        debounceMs: 50,
      });

      const events: string[] = [];
      watcher.onChange((event) => events.push(event.filePath));

      watcher.simulateFileChange('/test/issues/openclaw/OC-001.md');
      watcher.simulateFileChange('/test/issues/vibe-coding/project/VP-001.md');

      // Wait for debounce timers
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(events).toHaveLength(2);
      expect(events).toContain('/test/issues/openclaw/OC-001.md');
      expect(events).toContain('/test/issues/vibe-coding/project/VP-001.md');
    });
  });
});