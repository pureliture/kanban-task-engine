import {
  CanonicalTaskModel,
  NormalizedStatus,
  WorkStateProvider,
  TaskRef,
} from '@kanban-task-engine/core';
import { graphql } from '@octokit/graphql';
import { githubIssueToCanonical, GitHubIssueData } from './github-mapper';
import { normalizedToGithubStatus } from './status-mapping';

export interface GitHubAdapterConfig {
  token: string;
  owner: string;
  repo: string;
  projectId?: string;
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
    if (!this.config.projectId) {
      throw new Error('GitHub project ID is required for pushStatus');
    }

    const issueNumber = parseInt(externalKey.replace('#', ''), 10);
    const githubStatus = normalizedToGithubStatus(status);

    // This would use the GitHub Projects API to update the status field
    // The actual mutation depends on the project's custom field configuration
    const mutation = `
      mutation($projectId: ID!, $contentId: ID!, $statusFieldId: ID!, $statusOptionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            contentId: $contentId
            fieldId: $statusFieldId
            value: { singleSelectOptionId: $statusOptionId }
          }
        ) {
          projectV2Item { id }
        }
      }
    `;

    try {
      await this.graphqlWithAuth(mutation, {
        projectId: this.config.projectId,
        contentId: issueNumber,
        statusFieldId: 'Status',
        statusOptionId: githubStatus,
      });
    } catch (error) {
      throw new Error(`GitHub pushStatus failed: ${error}`);
    }
  }

  async resolveRef(taskRef: TaskRef): Promise<string> {
    const repoFullName = `${this.config.owner}/${this.config.repo}`;
    return `https://github.com/${repoFullName}/issues/${taskRef.external_id.replace('#', '')}`;
  }
}