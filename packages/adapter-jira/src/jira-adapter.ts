import { JiraIssuePayload } from './jira-mapper';

export interface JiraAdapterConfig {
  baseUrl: string;
  token: string;
  dryRun?: boolean;
}

export interface JiraAdapterResult {
  dryRun: boolean;
  key?: string;
  payload: JiraIssuePayload;
}

export type JiraTransport = (url: string, init: RequestInit) => Promise<Response>;

export class JiraAdapter {
  constructor(
    private config: JiraAdapterConfig,
    private transport: JiraTransport = fetch
  ) {}

  async createIssue(payload: JiraIssuePayload): Promise<JiraAdapterResult> {
    if (this.config.dryRun) {
      return { dryRun: true, payload };
    }

    const response = await this.transport(`${this.config.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Jira create failed: ${response.status}`);
    }
    const data = await response.json() as { key?: string };
    return { dryRun: false, key: data.key, payload };
  }
}