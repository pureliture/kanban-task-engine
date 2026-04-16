import { describe, it, expect } from 'vitest';
import { githubStatusToNormalized, normalizedToGithubStatus } from '../src/status-mapping';

describe('GitHub status mapping', () => {
  describe('githubStatusToNormalized', () => {
    it('maps "In Progress" to ACTIVE', () => {
      expect(githubStatusToNormalized('In Progress')).toBe('ACTIVE');
    });
    it('maps "Done" to DONE', () => {
      expect(githubStatusToNormalized('Done')).toBe('DONE');
    });
    it('maps "Todo" to SELECTED', () => {
      expect(githubStatusToNormalized('Todo')).toBe('SELECTED');
    });
    it('defaults unknown to BACKLOG', () => {
      expect(githubStatusToNormalized('Unknown')).toBe('BACKLOG');
    });
  });

  describe('normalizedToGithubStatus', () => {
    it('maps ACTIVE to "In Progress"', () => {
      expect(normalizedToGithubStatus('ACTIVE')).toBe('In Progress');
    });
    it('maps DONE to "Done"', () => {
      expect(normalizedToGithubStatus('DONE')).toBe('Done');
    });
  });
});