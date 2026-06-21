import {
  BoardProjectionWriteError,
  collectBoardProjection,
  writeBoardProjection,
  writeBoardProjections,
  type BoardProjectionWriteResult,
  type BoardEnrichmentProvider,
} from '@kanban-task-engine/core';
import {
  NeuronsBoardEnrichmentProvider,
  StdioMcpClient,
  HttpMcpClient,
  type McpClient,
} from '@kanban-task-engine/neurons-enrichment';
import { CliHandler, fail, ok } from '../index.js';
import { loadVaultIssueIndex, renderIssueBoard } from '../vault.js';

/**
 * neurons enrichment provider 를 환경변수 기반으로 생성한다 (read-only, opt-in, fail-soft D3).
 * 우선순위:
 *  1) KANBAN_NEURONS_MCP_URL — 원격 mcp-http(Streamable HTTP, Tailscale). 라이브 서버 권장.
 *  2) KANBAN_NEURONS_LEDGER — 로컬 stdio(`neuron-knowledge mcp-stdio`). neuron-knowledge 설치 필요.
 *  3) 미설정 — 미주입(enrichment 없는 board).
 * KANBAN_NEURONS_GRAPH=1 이면 stdio 모드에서 graphiti graph 결과 활성화(--enable-graph).
 */
function createEnrichmentProvider(): { provider?: BoardEnrichmentProvider; client?: McpClient } {
  const url = process.env.KANBAN_NEURONS_MCP_URL;
  if (url) {
    const client = new HttpMcpClient({ url });
    return { provider: new NeuronsBoardEnrichmentProvider(client), client };
  }
  const ledgerPath = process.env.KANBAN_NEURONS_LEDGER;
  if (ledgerPath) {
    const client = new StdioMcpClient({ ledgerPath, enableGraph: process.env.KANBAN_NEURONS_GRAPH === '1' });
    return { provider: new NeuronsBoardEnrichmentProvider(client), client };
  }
  return {};
}

interface BoardArgs {
  write: boolean;
  all: boolean;
  space?: string;
}

export const commandBoard: CliHandler = async (args, context) => {
  const parsed = parseBoardArgs(args);
  if ('exitCode' in parsed) return parsed;

  if (parsed.write && !context.vaultRootExplicit) {
    return fail('KANBAN_HOME must be explicitly set for board --write');
  }

  const { provider: enrichmentProvider, client: mcpClient } = createEnrichmentProvider();
  try {
    if (parsed.write) {
      const generatedAt = new Date().toISOString();
      const results = parsed.all
        ? await writeBoardProjections({ vaultRoot: context.vaultRoot, all: true, generatedAt, enrichmentProvider })
        : [await writeBoardProjection({
          vaultRoot: context.vaultRoot,
          space: parsed.space as string,
          generatedAt,
          enrichmentProvider,
        })];
      return ok(formatWriteResults(results));
    }

    if (parsed.space) {
      const projection = await collectBoardProjection({
        vaultRoot: context.vaultRoot,
        space: parsed.space,
        generatedAt: new Date().toISOString(),
        enrichmentProvider,
      });
      return ok(projection.boardMarkdown);
    }

    const index = await loadVaultIssueIndex(context.vaultRoot);
    return ok(renderIssueBoard('Kanban Board', index.issues, new Date().toISOString()));
  } catch (error) {
    if (error instanceof BoardProjectionWriteError) {
      return fail(formatProjectionWriteError(error));
    }
    return fail(error instanceof Error ? error.message : String(error));
  } finally {
    await mcpClient?.close();
  }
};

function parseBoardArgs(args: string[]): BoardArgs | ReturnType<typeof fail> {
  const parsed: BoardArgs = { write: false, all: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      parsed.write = true;
      continue;
    }
    if (arg === '--all') {
      parsed.all = true;
      continue;
    }
    if (arg === '--space') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        return fail('Missing value for --space');
      }
      parsed.space = value;
      index += 1;
      continue;
    }
    return fail(`Unknown option: ${arg}`);
  }

  if (parsed.all && !parsed.write) {
    return fail('--all requires --write');
  }
  const hasSpace = parsed.space !== undefined;
  if (parsed.write && hasSpace === parsed.all) {
    return fail('Exactly one of --space or --all is required for board --write');
  }
  if (hasSpace && parsed.all) {
    return fail('Exactly one of --space or --all is required for board');
  }

  return parsed;
}

function formatWriteResults(results: BoardProjectionWriteResult[]): string {
  return results.map(result => [
    `wrote ${result.space} board: ${result.boardRelativePath}`,
    `wrote ${result.space} index: ${result.indexRelativePath}`,
    `issues: ${result.issueCount}`,
  ].join('\n')).join('\n');
}

function formatProjectionWriteError(error: BoardProjectionWriteError): string {
  return [
    error.message,
    ...error.succeeded.map(target => `succeeded ${target.space} ${target.kind}: ${target.relativePath}`),
    ...error.failed.map(target => `failed ${target.space} ${target.kind}: ${target.relativePath} (${target.error})`),
  ].join('\n');
}
