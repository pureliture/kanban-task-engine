import {
  CanonicalTaskModel,
  NormalizedStatus,
  WorkStateProvider,
  TaskRef,
} from '@kanban-task-engine/core';
import { graphql } from '@octokit/graphql';
import {
  githubIssueToCanonical,
  GitHubIssueData,
  canonicalToGithubDraft,
  GitHubDraftPayload,
  parseKanbanIdFromBody,
} from './github-mapper';
import { normalizedToGithubStatus, resolveStatusOptionId } from './status-mapping';

export interface ProjectDraftItem {
  itemId: string;
  title: string;
  kanbanId?: string;
  status?: string;
}

export interface CreateDraftResult {
  payload: GitHubDraftPayload;
  dryRun: boolean;
  itemId?: string;
  appliedStatusOptionId?: string;
}

export interface GitHubAdapterConfig {
  token: string;
  owner: string;
  repo: string;
  projectId: string;
  statusFieldId: string;  // Required - the global field ID for the Status field
}

export class GitHubAdapter implements WorkStateProvider {
  private config: GitHubAdapterConfig;
  private graphqlWithAuth: typeof graphql;

  constructor(config: GitHubAdapterConfig) {
    this.config = config;
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${config.token}` },
    });
  }

  async fetchTasks(since?: string): Promise<CanonicalTaskModel[]> {
    const repoFullName = `${this.config.owner}/${this.config.repo}`;
    const query = `
      query($owner: String!, $repo: String!, $since: DateTime) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}${
            since ? ', filterBy: {since: $since}' : ''
          }) {
            nodes {
              number
              title
              body
              state
              labels(first: 20) { nodes { name } }
              assignee { login }
              createdAt
              updatedAt
              closedAt
            }
          }
        }
      }
    `;

    try {
      const result: any = await this.graphqlWithAuth(query, {
        owner: this.config.owner,
        repo: this.config.repo,
        since,
      });

      const issues: GitHubIssueData[] = result.repository.issues.nodes.map(
        (node: any) => ({
          number: node.number,
          title: node.title,
          body: node.body,
          state: node.state === 'OPEN' ? 'open' : 'closed',
          labels: node.labels.nodes.map((l: any) => ({ name: l.name })),
          assignee: node.assignee ? { login: node.assignee.login } : null,
          created_at: node.createdAt,
          updated_at: node.updatedAt,
          closed_at: node.closedAt,
        })
      );

      return issues.map(issue => githubIssueToCanonical(issue, repoFullName));
    } catch (error) {
      throw new Error(`GitHub fetchTasks failed: ${error}`);
    }
  }

  async fetchTask(externalKey: string): Promise<CanonicalTaskModel | null> {
    const issueNumber = parseInt(externalKey.replace('#', ''), 10);
    if (isNaN(issueNumber)) return null;

    const repoFullName = `${this.config.owner}/${this.config.repo}`;
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            number
            title
            body
            state
            labels(first: 20) { nodes { name } }
            assignee { login }
            createdAt
            updatedAt
            closedAt
          }
        }
      }
    `;

    try {
      const result: any = await this.graphqlWithAuth(query, {
        owner: this.config.owner,
        repo: this.config.repo,
        number: issueNumber,
      });

      if (!result.repository.issue) return null;

      const issue: GitHubIssueData = {
        number: result.repository.issue.number,
        title: result.repository.issue.title,
        body: result.repository.issue.body,
        state: result.repository.issue.state === 'OPEN' ? 'open' : 'closed',
        labels: result.repository.issue.labels.nodes.map((l: any) => ({ name: l.name })),
        assignee: result.repository.issue.assignee ? { login: result.repository.issue.assignee.login } : null,
        created_at: result.repository.issue.createdAt,
        updated_at: result.repository.issue.updatedAt,
        closed_at: result.repository.issue.closedAt,
      };

      return githubIssueToCanonical(issue, repoFullName);
    } catch (error) {
      throw new Error(`GitHub fetchTask failed: ${error}`);
    }
  }

  async pushStatus(externalKey: string, status: NormalizedStatus): Promise<void> {
    const issueNumber = parseInt(externalKey.replace('#', ''), 10);
    if (isNaN(issueNumber)) throw new Error(`Invalid issue key: ${externalKey}`);

    const githubStatus = normalizedToGithubStatus(status);

    // Step 1: Resolve issue number to node ID
    const nodeIdQuery = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) { id }
        }
      }
    `;

    const nodeResult: any = await this.graphqlWithAuth(nodeIdQuery, {
      owner: this.config.owner,
      repo: this.config.repo,
      number: issueNumber,
    });

    const contentId = nodeResult.repository.issue?.id;
    if (!contentId) throw new Error(`Could not resolve node ID for issue ${externalKey}`);

    // Step 2: Update the project item status
    const mutation = `
      mutation($projectId: ID!, $contentId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            contentId: $contentId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item { id }
        }
      }
    `;

    try {
      await this.graphqlWithAuth(mutation, {
        projectId: this.config.projectId,
        contentId,
        fieldId: this.config.statusFieldId,
        optionId: githubStatus,
      });
    } catch (error) {
      throw new Error(`GitHub pushStatus failed: ${error}`);
    }
  }

  async resolveRef(taskRef: TaskRef): Promise<string> {
    const repoFullName = `${this.config.owner}/${this.config.repo}`;
    return `https://github.com/${repoFullName}/issues/${taskRef.external_id.replace('#', '')}`;
  }

  // ===================================================================
  // 정방향 발행 (canonical → GitHub Projects draft 카드). a: Jira 대체.
  // ===================================================================

  /** Project Status 단일선택 필드의 {옵션이름: optionId} 맵을 조회한다. */
  async fetchStatusOptions(): Promise<Record<string, string>> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            field(name: "Status") {
              ... on ProjectV2SingleSelectField { options { id name } }
            }
          }
        }
      }
    `;
    const result: any = await this.graphqlWithAuth(query, { projectId: this.config.projectId });
    const options: Record<string, string> = {};
    for (const o of result.node?.field?.options ?? []) options[o.name] = o.id;
    return options;
  }

  /** canonical task 를 Project draft 카드로 발행하고 status 를 설정한다. dryRun 시 payload 만 반환. */
  async createDraftInProject(
    task: CanonicalTaskModel,
    opts: { dryRun?: boolean } = {},
  ): Promise<CreateDraftResult> {
    const payload = canonicalToGithubDraft(task);
    if (opts.dryRun) return { payload, dryRun: true };

    const createMutation = `
      mutation($projectId: ID!, $title: String!, $body: String!) {
        addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
          projectItem { id }
        }
      }
    `;
    const created: any = await this.graphqlWithAuth(createMutation, {
      projectId: this.config.projectId,
      title: payload.title,
      body: payload.body,
    });
    const itemId = created.addProjectV2DraftIssue.projectItem.id;

    const options = await this.fetchStatusOptions();
    const optionId = resolveStatusOptionId(payload.statusOption, options);
    if (optionId) {
      const setStatus = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(
            input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId } }
          ) { projectV2Item { id } }
        }
      `;
      await this.graphqlWithAuth(setStatus, {
        projectId: this.config.projectId,
        itemId,
        fieldId: this.config.statusFieldId,
        optionId,
      });
    }
    return { payload, dryRun: false, itemId, appliedStatusOptionId: optionId };
  }

  /** Project 의 draft 카드들을 조회한다 (역방향 sync 입력: kanbanId ↔ status). */
  async fetchProjectDrafts(): Promise<ProjectDraftItem[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(last: 100) {
              nodes {
                id
                content { ... on DraftIssue { title body } }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }
    `;
    const result: any = await this.graphqlWithAuth(query, { projectId: this.config.projectId });
    return (result.node?.items?.nodes ?? [])
      .filter((n: any) => n.content?.title)
      .map((n: any) => ({
        itemId: n.id,
        title: n.content.title,
        kanbanId: parseKanbanIdFromBody(n.content.body),
        status: n.fieldValueByName?.name,
      }));
  }
}