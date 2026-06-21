import fs from 'node:fs/promises';
import path from 'node:path';
import type { VaultPort } from '../ports/vault-port';
import { collectVaultBoardProjection } from '../store/vault-record-loader';

export interface WriteObsidianBoardForSpaceInput {
  vault: VaultPort;
  vaultRoot: string;
  space: string;
  generatedAt?: string;
}

export interface WriteObsidianBoardForSpaceResult {
  boardPath: string;
  indexPath: string;
  issueCount: number;
}

export interface AssertMatchingVaultRootInput {
  vault: VaultPort;
  vaultRoot: string;
}

export async function writeObsidianBoardForSpace(
  input: WriteObsidianBoardForSpaceInput,
): Promise<WriteObsidianBoardForSpaceResult> {
  await assertMatchingVaultRoot(input);

  const projection = await collectVaultBoardProjection({
    vault: input.vault,
    space: input.space,
    generatedAt: input.generatedAt,
  });

  await writeVaultFile(input.vault, projection.boardRelativePath, projection.boardMarkdown);
  await writeVaultFile(input.vault, projection.indexRelativePath, projection.indexMarkdown);

  return {
    boardPath: projection.boardRelativePath,
    indexPath: projection.indexRelativePath,
    issueCount: projection.issueCount,
  };
}

export async function assertMatchingVaultRoot(input: AssertMatchingVaultRootInput): Promise<void> {
  const [vaultRoot, portRoot] = await Promise.all([
    fs.realpath(path.resolve(input.vaultRoot)),
    fs.realpath(path.resolve(input.vault.root)),
  ]);
  if (vaultRoot !== portRoot) {
    throw new Error(`vaultRoot must match VaultPort root: vaultRoot=${vaultRoot} VaultPort root=${portRoot}`);
  }
}

async function writeVaultFile(vault: VaultPort, relativePath: string, content: string): Promise<void> {
  if (await vault.exists(relativePath)) {
    await vault.process(relativePath, () => content);
    return;
  }
  await vault.create(relativePath, content);
}
