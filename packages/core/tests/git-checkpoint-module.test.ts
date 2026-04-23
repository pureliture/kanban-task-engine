import { describe, expect, it } from 'vitest';
import { createGitCheckpointModule } from '../src/modules/git-checkpoint-module';

describe('git checkpoint module', () => {
  it('builds non-interactive git commands', async () => {
    const commands: string[][] = [];
    const module = createGitCheckpointModule('/vault', 'checkpoint', async command => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '' };
    });
    await module.run({ values: {}, policy: { allowedSideEffects: ['gitCommit'] } });
    expect(commands).toEqual([
      ['git', '-C', '/vault', 'add', '-A'],
      ['git', '-C', '/vault', 'commit', '--no-gpg-sign', '-m', 'checkpoint'],
    ]);
  });
});
