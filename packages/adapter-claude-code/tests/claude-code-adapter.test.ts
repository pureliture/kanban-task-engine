import { describe, expect, it } from 'vitest';
import { createClaudeCodeAdapterConfig } from '../src/claude-code-adapter';

describe('Claude Code adapter config', () => {
  it('builds claude command config with cwd', () => {
    const config = createClaudeCodeAdapterConfig('/repo');
    expect(config.command).toBe('claude');
    expect(config.args).toEqual(['--print']);
    expect(config.cwd).toBe('/repo');
  });
});
