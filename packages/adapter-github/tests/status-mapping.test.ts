import { describe, it, expect } from 'vitest';
import { githubStatusToNormalized, normalizedToGithubStatus } from '../src/status-mapping';

describe('GitHub status mapping', () => {
  describe('githubStatusToNormalized', () => {
    it('maps "In Progress" to RUNNING', () => {
      expect(githubStatusToNormalized('In Progress')).toBe('RUNNING');
    });
    it('maps "Done" to DONE', () => {
      expect(githubStatusToNormalized('Done')).toBe('DONE');
    });
    it('maps "Todo" to TODO', () => {
      expect(githubStatusToNormalized('Todo')).toBe('TODO');
    });
    it('defaults unknown to TODO', () => {
      expect(githubStatusToNormalized('Unknown')).toBe('TODO');
    });
  });

  describe('normalizedToGithubStatus', () => {
    it('maps RUNNING to "In Progress"', () => {
      expect(normalizedToGithubStatus('RUNNING')).toBe('In Progress');
    });
    it('maps DONE to "Done"', () => {
      expect(normalizedToGithubStatus('DONE')).toBe('Done');
    });
  });
});
