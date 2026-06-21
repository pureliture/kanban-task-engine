import { describe, it, expect } from 'vitest';
import { HttpMcpClient, readJsonRpcResponse } from '../src/http-mcp-client';
import { NeuronsBoardEnrichmentProvider } from '../src/provider';

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('HttpMcpClient', () => {
  it('initializes once, carries session id, and calls tools', async () => {
    const calls: Array<{ method: string; sessionHeader: string | null }> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id?: number };
      const headers = new Headers(init?.headers);
      calls.push({ method: body.method, sessionHeader: headers.get('mcp-session-id') });
      if (body.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { ok: true } }, { 'mcp-session-id': 'sess-1' });
      }
      if (body.method === 'tools/call') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { results: [{}, {}] } } });
      }
      return jsonResponse({ jsonrpc: '2.0' }); // notifications/initialized
    }) as unknown as typeof fetch;

    const client = new HttpMcpClient({ url: 'http://tailnet-host:8765/mcp', fetchImpl });
    const out = await client.callTool('brain_memory_search', { project: 'openclaw' });
    expect(out).toEqual({ results: [{}, {}] });

    expect(calls[0].method).toBe('initialize');
    expect(calls.some((c) => c.method === 'notifications/initialized')).toBe(true);
    // tools/call 은 initialize 에서 받은 session id 를 헤더로 보낸다
    const toolCall = calls.find((c) => c.method === 'tools/call');
    expect(toolCall?.sessionHeader).toBe('sess-1');
  });

  it('works as a drop-in McpClient for the provider', async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id?: number; params?: { name?: string } };
      if (body.method === 'initialize') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} }, { 'mcp-session-id': 's' });
      if (body.method === 'tools/call') {
        const tool = body.params?.name;
        const map: Record<string, unknown> = {
          brain_memory_search: { results: [{}], graph_results: [{}, {}] },
          brain_drift_explain: { drift_events: [{}] },
          brain_incident_search: { reusable_fixes: [] },
        };
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { structuredContent: map[tool ?? ''] ?? {} } });
      }
      return jsonResponse({ jsonrpc: '2.0' });
    }) as unknown as typeof fetch;

    const client = new HttpMcpClient({ url: 'http://h/mcp', fetchImpl });
    const provider = new NeuronsBoardEnrichmentProvider(client);
    const e = (await provider.fetchForBoard({ brainSlug: 'openclaw', issueIds: ['VC-1'] })).get('VC-1');
    expect(e).toEqual({ source: 'neurons-mirror', decisionCount: 1, neighborCount: 2, driftCount: 1, incidentCount: 0 });
  });
});

describe('readJsonRpcResponse SSE parsing', () => {
  it('extracts the matching id from an event-stream', async () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"v":1}}\n\n';
    const res = new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const msg = await readJsonRpcResponse(res, 7);
    expect(msg.result).toEqual({ v: 1 });
  });
});
