export interface AllocateIssueIdOptions {
  padWidth?: number;
}

export function parseIssueSequence(issueId: string, idPrefix: string): number | null {
  const match = issueId.match(new RegExp(`^${escapeRegExp(idPrefix)}-(\\d+)$`));
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function allocateNextIssueId(
  existingIds: Iterable<string>,
  idPrefix: string,
  options: AllocateIssueIdOptions = {},
): string {
  if (!/^[A-Z][A-Z0-9]*$/.test(idPrefix)) {
    throw new Error(`Invalid idPrefix: ${idPrefix}`);
  }

  const padWidth = options.padWidth ?? 3;
  let max = 0;
  for (const id of existingIds) {
    const sequence = parseIssueSequence(id, idPrefix);
    if (sequence !== null && sequence > max) {
      max = sequence;
    }
  }

  const next = String(max + 1);
  return `${idPrefix}-${next.padStart(padWidth, '0')}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
