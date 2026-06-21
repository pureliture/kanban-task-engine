/**
 * board 카드 read-only enrichment overlay (neurons mirror). Phase 1 / D3 A노선.
 *
 * 불변식: `.md` SoT 불침범. 이 overlay 는 board projection 시점에만 붙는 휘발성
 * 데이터이며 issue frontmatter 나 sync.* 에 절대 write-back 하지 않는다.
 * 조회 실패는 fail-soft (enrichment 없는 board 가 정상 동작).
 */
export interface BoardEnrichment {
  /** card_type=decision 관련 건수 (brain_memory_search) */
  decisionCount?: number;
  /** drift_events 건수 (brain_drift_explain). null/undefined = 미조회 (0 과 구분) */
  driftCount?: number;
  /** 관련 incident 건수 (brain_incident_search) */
  incidentCount?: number;
  /** OntologyEpisode 그래프 이웃 건수 */
  neighborCount?: number;
  /** 출처 표시 (편집 불가 신호) */
  source: string;
  /** staleness 표시용 ISO8601 */
  fetchedAt?: string;
}

/**
 * board projection 이 enrichment 를 batch 조회하는 포트.
 * core 는 인터페이스만 정의하고, 구현은 별도 패키지(@kanban-task-engine/neurons-enrichment)가
 * 제공해 상위(CLI)에서 주입한다 (DI, core 무순환).
 */
export interface BoardEnrichmentProvider {
  /**
   * @param brainSlug neurons brain_id 의 slug (registry external.brain_id 의 `/project/<slug>` 에서 slug)
   * @param issueIds board 의 issue id 목록
   * @returns issueId → BoardEnrichment 맵 (없는 issue 는 생략 가능)
   */
  fetchForBoard(input: { brainSlug: string; issueIds: string[] }): Promise<Map<string, BoardEnrichment>>;
}
