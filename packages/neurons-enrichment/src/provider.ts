import type { BoardEnrichment, BoardEnrichmentProvider } from '@kanban-task-engine/core';
import type { McpClient } from './mcp-stdio-client';

/** neurons tool 응답에서 안전하게 배열 길이를 읽는다. */
function arrayLen(value: unknown, key: string): number | undefined {
  if (value && typeof value === 'object') {
    const arr = (value as Record<string, unknown>)[key];
    if (Array.isArray(arr)) return arr.length;
  }
  return undefined;
}

/**
 * neurons brain knowledge 를 board 카드 read-only enrichment 로 매핑하는 provider.
 * D3 A노선: neurons = read-only mirror, `.md` SoT 불침범, fail-soft.
 *
 * 매핑(실측 mcp_server.py 기준):
 *  - decisionCount  ← brain_memory_search(card_types=[decision]).results.length
 *  - neighborCount  ← brain_memory_search.graph_results.length
 *  - driftCount     ← brain_drift_explain.drift_events.length
 *  - incidentCount  ← brain_incident_search.reusable_fixes.length
 *
 * 주의: 현재 issue 당 3 tool 호출(PoC). 레이턴시 최적화(brain_context_resolve batch +
 * 캐시 TTL)는 후속 openQuestion.
 */
export class NeuronsBoardEnrichmentProvider implements BoardEnrichmentProvider {
  constructor(private readonly client: McpClient) {}

  async fetchForBoard(input: { brainSlug: string; issueIds: string[] }): Promise<Map<string, BoardEnrichment>> {
    const out = new Map<string, BoardEnrichment>();
    for (const issueId of input.issueIds) {
      const enrichment = await this.fetchOne(input.brainSlug, issueId);
      if (enrichment) out.set(issueId, enrichment);
    }
    return out;
  }

  private async fetchOne(project: string, issueId: string): Promise<BoardEnrichment | undefined> {
    const [decisions, drift, incidents] = await Promise.all([
      this.safeCall('brain_memory_search', { query: issueId, project, card_types: ['decision'], limit: 20 }),
      this.safeCall('brain_drift_explain', { subject: issueId, project }),
      this.safeCall('brain_incident_search', { symptom: issueId, project, limit: 20 }),
    ]);

    if (decisions === null && drift === null && incidents === null) return undefined;

    const enrichment: BoardEnrichment = { source: 'neurons-mirror' };
    const decisionCount = arrayLen(decisions, 'results');
    if (decisionCount !== undefined) enrichment.decisionCount = decisionCount;
    const neighborCount = arrayLen(decisions, 'graph_results');
    if (neighborCount !== undefined) enrichment.neighborCount = neighborCount;
    const driftCount = arrayLen(drift, 'drift_events');
    if (driftCount !== undefined) enrichment.driftCount = driftCount;
    const incidentCount = arrayLen(incidents, 'reusable_fixes');
    if (incidentCount !== undefined) enrichment.incidentCount = incidentCount;
    return enrichment;
  }

  private async safeCall(name: string, args: Record<string, unknown>): Promise<unknown | null> {
    try {
      return await this.client.callTool(name, args);
    } catch {
      return null;
    }
  }
}
