import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('plugin settings', () => {
  it('defaults to board-first, desktop-safe UX', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      defaultSpace: 'vibe-coding',
      defaultPriority: 'P2',
      defaultExecutor: 'human',
      syncBoardAfterCreate: true,
      openIssueAfterCreate: false,
      showRibbonActions: true,
      requireApplyPreview: true,
    });
  });
});
