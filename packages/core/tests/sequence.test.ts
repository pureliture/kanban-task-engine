import { describe, expect, it } from 'vitest';
import { allocateNextIssueId, parseIssueSequence } from '../src/store/sequence';

describe('sequence', () => {
  it('allocates the first id with three digit padding', () => {
    expect(allocateNextIssueId([], 'VC')).toBe('VC-001');
  });

  it('allocates the next id for a matching prefix', () => {
    expect(allocateNextIssueId(['OC-002', 'VC-001', 'VC-009'], 'VC')).toBe('VC-010');
  });

  it('naturally expands past 999', () => {
    expect(allocateNextIssueId(['VC-999'], 'VC')).toBe('VC-1000');
  });

  it('ignores ids from other prefixes and malformed ids', () => {
    expect(allocateNextIssueId(['VC-X', 'WB-100', 'VC-002-extra'], 'VC')).toBe('VC-001');
  });

  it('parses a sequence only for the requested prefix', () => {
    expect(parseIssueSequence('VC-042', 'VC')).toBe(42);
    expect(parseIssueSequence('OC-042', 'VC')).toBeNull();
  });

  it('rejects invalid prefixes', () => {
    expect(() => allocateNextIssueId([], 'vc')).toThrow('Invalid idPrefix');
  });
});
