export const ISSUE_STATUSES = ['TODO', 'READY', 'RUNNING', 'REVIEW', 'DONE', 'FAILED'] as const;

export type IssueStatus = typeof ISSUE_STATUSES[number];

export interface IssueTransition {
  from: IssueStatus;
  to: IssueStatus;
}

export const VALID_ISSUE_TRANSITIONS: IssueTransition[] = [
  { from: 'TODO', to: 'READY' },
  { from: 'READY', to: 'RUNNING' },
  { from: 'READY', to: 'TODO' },
  { from: 'RUNNING', to: 'REVIEW' },
  { from: 'RUNNING', to: 'FAILED' },
  { from: 'REVIEW', to: 'DONE' },
  { from: 'REVIEW', to: 'RUNNING' },
  { from: 'FAILED', to: 'READY' },
];

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === 'string' && (ISSUE_STATUSES as readonly string[]).includes(value);
}

// =====================================================================
// 3-way status bridge (ADR-0003, M3)
// kanban IssueStatus ↔ raw_status_category ↔ neurons mirror ↔ Jira
// 이 상수가 status 매핑의 단일 SoT다. 정방향/역방향 모두 여기서 파생한다.
// =====================================================================

/** core RawStatusCategory 와 값이 일치하는 schema-side 카테고리(순환 의존 회피용). */
export type StatusCategory = 'TODO' | 'READY' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'FAILED';
export type JiraStatusCategory = 'To Do' | 'In Progress' | 'Done';

export interface StatusBridgeEntry {
  /** raw_status_category 정규화 값 */
  category: StatusCategory;
  /** neurons mirror status (자유형, 소문자). neurons 는 enum 이 아님 — kanban→neurons 정규화용. */
  neurons: string;
  /** Jira status name 후보 (테넌트 워크플로에 없을 수 있음 → resolveJiraTransition 으로 폴백) */
  jiraHint: string;
  /** Jira statusCategory (폴백 그룹 기준) */
  jiraCategory: JiraStatusCategory;
}

export const STATUS_BRIDGE: Record<IssueStatus, StatusBridgeEntry> = {
  TODO: { category: 'TODO', neurons: 'todo', jiraHint: 'To Do', jiraCategory: 'To Do' },
  READY: { category: 'READY', neurons: 'ready', jiraHint: 'Ready', jiraCategory: 'To Do' },
  RUNNING: { category: 'IN_PROGRESS', neurons: 'running', jiraHint: 'In Progress', jiraCategory: 'In Progress' },
  REVIEW: { category: 'IN_REVIEW', neurons: 'in_review', jiraHint: 'In Review', jiraCategory: 'In Progress' },
  DONE: { category: 'DONE', neurons: 'done', jiraHint: 'Done', jiraCategory: 'Done' },
  FAILED: { category: 'FAILED', neurons: 'failed', jiraHint: 'Blocked', jiraCategory: 'In Progress' },
};

/** neurons 의 종료 상태(자유형). 역매핑 시 전부 DONE 으로 정규화한다. */
export const NEURONS_TERMINAL_STATUSES = ['done', 'resolved', 'closed', 'cancelled'] as const;

export const JIRA_STATUS_HINTS: Record<IssueStatus, string> = Object.fromEntries(
  ISSUE_STATUSES.map((s) => [s, STATUS_BRIDGE[s].jiraHint]),
) as Record<IssueStatus, string>;

// --- 정방향 (kanban → 외부) ---
export function toJiraStatusHint(status: IssueStatus): string {
  return STATUS_BRIDGE[status].jiraHint;
}
export function toNeuronsStatus(status: IssueStatus): string {
  return STATUS_BRIDGE[status].neurons;
}
export function toStatusCategory(status: IssueStatus): StatusCategory {
  return STATUS_BRIDGE[status].category;
}
export function toJiraCategory(status: IssueStatus): JiraStatusCategory {
  return STATUS_BRIDGE[status].jiraCategory;
}

// --- 역방향 (외부 → kanban). 모르면 null = fail-closed(사람 확인 큐) ---

/** neurons mirror/terminal status → IssueStatus. */
export function fromNeuronsStatus(raw: string): IssueStatus | null {
  const s = raw.trim().toLowerCase();
  if ((NEURONS_TERMINAL_STATUSES as readonly string[]).includes(s)) return 'DONE';
  return ISSUE_STATUSES.find((k) => STATUS_BRIDGE[k].neurons === s) ?? null;
}

/** Jira statusCategory → IssueStatus 폴백. */
export function fromJiraCategory(category: string): IssueStatus | null {
  switch (category) {
    case 'To Do':
      return 'TODO';
    case 'In Progress':
      return 'RUNNING';
    case 'Done':
      return 'DONE';
    default:
      return null;
  }
}

/**
 * 발행 시 실제 Jira transition 이름을 resolve 한다 (ADR-0003 폴백 규칙).
 * READY/REVIEW 처럼 테넌트 워크플로에 없을 수 있는 hint 는, 같은 jiraCategory 의
 * 다른 후보로 폴백한다. 그래도 없으면 null → 사람 확인 큐(fail-closed).
 * availableTransitions 는 M4 에서 테넌트로부터 실측한 transition 이름 목록이다.
 */
export function resolveJiraTransition(status: IssueStatus, availableTransitions: string[]): string | null {
  const { jiraHint, jiraCategory } = STATUS_BRIDGE[status];
  if (availableTransitions.includes(jiraHint)) return jiraHint;
  const fallback = ISSUE_STATUSES.filter((s) => STATUS_BRIDGE[s].jiraCategory === jiraCategory)
    .map((s) => STATUS_BRIDGE[s].jiraHint)
    .find((h) => availableTransitions.includes(h));
  return fallback ?? null;
}
