import { describe, it, expect } from 'vitest';
import { NeuronsBoardEnrichmentProvider } from '../src/provider';
import { parseToolResult } from '../src/mcp-stdio-client';
import type { McpClient } from '../src/mcp-stdio-client';

function mockClient(responses: Record<string, unknown>): McpClient {
  return {
    async callTool(name: string) {
      if (name in responses) return responses[name];
      throw new Error(`no mock for ${name}`);
    },
    async close() {},
  };
}

describe('NeuronsBoardEnrichmentProvider (D3 A노선 매핑)', () => {
  it('maps neurons tool results to BoardEnrichment counts', async () => {
    const client = mockClient({
      brain_memory_search: { results: [{}, {}], graph_results: [{}] },
      brain_drift_explain: { drift_events: [{}] },
      brain_incident_search: { reusable_fixes: [{}, {}, {}] },
    });
    const provider = new NeuronsBoardEnrichmentProvider(client);
    const map = await provider.fetchForBoard({ brainSlug: 'openclaw', issueIds: ['VC-001'] });
    expect(map.get('VC-001')).toEqual({
      source: 'neurons-mirror',
      decisionCount: 2,
      neighborCount: 1,
      driftCount: 1,
      incidentCount: 3,
    });
  });

  it('is fail-soft: tool errors drop to no enrichment for that issue', async () => {
    const client: McpClient = {
      async callTool() {
        throw new Error('neurons unavailable');
      },
      async close() {},
    };
    const provider = new NeuronsBoardEnrichmentProvider(client);
    const map = await provider.fetchForBoard({ brainSlug: 'openclaw', issueIds: ['VC-001'] });
    expect(map.has('VC-001')).toBe(false); // 전 tool 실패 → enrichment 생략
  });

  it('partial data: missing tool fields are omitted (driftCount null != 0 구분)', async () => {
    const client = mockClient({
      brain_memory_search: { results: [{}] },
      brain_drift_explain: {}, // drift_events 없음 → driftCount 생략
      brain_incident_search: { reusable_fixes: [] },
    });
    const provider = new NeuronsBoardEnrichmentProvider(client);
    const e = (await provider.fetchForBoard({ brainSlug: 'openclaw', issueIds: ['VC-001'] })).get('VC-001');
    expect(e).toEqual({ source: 'neurons-mirror', decisionCount: 1, incidentCount: 0 });
  });
});

describe('parseToolResult', () => {
  it('prefers structuredContent', () => {
    expect(parseToolResult({ structuredContent: { a: 1 } })).toEqual({ a: 1 });
  });
  it('parses JSON text content', () => {
    expect(parseToolResult({ content: [{ type: 'text', text: '{"b":2}' }] })).toEqual({ b: 2 });
  });
  it('falls back to {text} for non-JSON text', () => {
    expect(parseToolResult({ content: [{ type: 'text', text: 'hello' }] })).toEqual({ text: 'hello' });
  });
});

describe('caching + concurrency (c: latency)', () => {
  function countingClient(): McpClient & { calls: number } {
    const client = {
      calls: 0,
      async callTool() {
        client.calls += 1;
        return { results: [] };
      },
      async close() {},
    };
    return client;
  }

  it('serves from TTL cache without re-calling neurons', async () => {
    const client = countingClient();
    const provider = new NeuronsBoardEnrichmentProvider(client, { now: () => 1000 });
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] });
    const afterFirst = client.calls;
    expect(afterFirst).toBeGreaterThan(0);
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] }); // 캐시 히트
    expect(client.calls).toBe(afterFirst); // 추가 호출 0
  });

  it('re-fetches after TTL expiry', async () => {
    let t = 1000;
    const client = countingClient();
    const provider = new NeuronsBoardEnrichmentProvider(client, { cacheTtlMs: 100, now: () => t });
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] });
    const afterFirst = client.calls;
    t = 1200; // expiry 초과
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] });
    expect(client.calls).toBeGreaterThan(afterFirst);
  });

  it('cacheTtlMs=0 disables caching', async () => {
    const client = countingClient();
    const provider = new NeuronsBoardEnrichmentProvider(client, { cacheTtlMs: 0 });
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] });
    const afterFirst = client.calls;
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A'] });
    expect(client.calls).toBeGreaterThan(afterFirst); // 매번 재조회
  });

  it('runs issues in parallel under the concurrency cap', async () => {
    let active = 0;
    let peak = 0;
    const client: McpClient = {
      async callTool() {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { results: [] };
      },
      async close() {},
    };
    const provider = new NeuronsBoardEnrichmentProvider(client, { concurrency: 2, cacheTtlMs: 0 });
    await provider.fetchForBoard({ brainSlug: 'x', issueIds: ['A', 'B', 'C', 'D', 'E'] });
    expect(peak).toBeGreaterThan(3); // 2 issue 병렬 발생(직렬이면 issue당 3 tool=3)
    expect(peak).toBeLessThanOrEqual(6); // cap 2 issue × 3 tool = 6
  });
});
