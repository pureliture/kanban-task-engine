import { spawn } from 'child_process';
import { AutomationModule } from '../runtime/module';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string[]) => Promise<CommandResult>;

const defaultRunner: CommandRunner = command => new Promise(resolve => {
  const child = spawn(command[0], command.slice(1), { stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', data => { stdout += data.toString(); });
  child.stderr?.on('data', data => { stderr += data.toString(); });
  child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

export function createGitCheckpointModule(vaultPath: string, message: string, runner: CommandRunner = defaultRunner): AutomationModule {
  return {
    name: 'git-checkpoint',
    sideEffects: ['gitCommit'],
    async run(context) {
      await runner(['git', '-C', vaultPath, 'add', '-A']);
      const result = await runner(['git', '-C', vaultPath, 'commit', '--no-gpg-sign', '-m', message]);
      if (result.code !== 0 && !result.stdout.includes('nothing to commit') && !result.stderr.includes('nothing to commit')) {
        throw new Error(result.stderr || result.stdout || `git commit failed with code ${result.code}`);
      }
      return context;
    },
  };
}
