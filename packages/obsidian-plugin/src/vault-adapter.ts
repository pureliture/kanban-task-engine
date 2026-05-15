export type PlaceholderVaultAdapter = {
  read(relativePath: string): Promise<string>;
};

export function createVaultAdapter(): PlaceholderVaultAdapter {
  throw new Error('Vault adapter implementation is pending Task 6.');
}
