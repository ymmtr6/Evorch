import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

interface GitHubAgentConfig {
  action: "create_issue" | "create_pr" | "add_comment" | "create_release";
  repo: string;
  token?: string;
  // create_issue
  title?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  // create_pr
  head?: string;
  base?: string;
  // add_comment
  issue_number?: number;
  pull_number?: number;
  comment?: string;
  // create_release
  tag_name?: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * GitHub Agent プラグイン
 * GitHub REST API を使用して Issue/PR/Release などを操作
 */
export class GitHubAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const githubConfig = this.parseConfig(config, event);
    const token = githubConfig.token || process.env.GITHUB_TOKEN;

    if (!token) {
      return this.errorResult(event, "GITHUB_TOKEN が設定されていません");
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      let result: unknown;

      switch (githubConfig.action) {
        case "create_issue":
          result = await this.createIssue(githubConfig, token);
          break;
        case "create_pr":
          result = await this.createPullRequest(githubConfig, token);
          break;
        case "add_comment":
          result = await this.addComment(githubConfig, token);
          break;
        case "create_release":
          result = await this.createRelease(githubConfig, token);
          break;
        default:
          throw new Error(`不明なアクション: ${githubConfig.action}`);
      }

      const completedAt = new Date().toISOString();
      const duration_ms = Date.now() - startTime;

      return {
        result_id: ulid(),
        event_id: event.event_id,
        policy_name: "",
        agent_plugin: "github",
        status: "success",
        output: JSON.stringify(result),
        duration_ms,
        started_at: startedAt,
        completed_at: completedAt,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const duration_ms = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        result_id: ulid(),
        event_id: event.event_id,
        policy_name: "",
        agent_plugin: "github",
        status: "failure",
        output: `GitHub API エラー: ${errorMessage}`,
        duration_ms,
        started_at: startedAt,
        completed_at: completedAt,
      };
    }
  }

  private parseConfig(
    config: Record<string, unknown>,
    event: EvOrchEvent
  ): GitHubAgentConfig {
    return {
      action: config.action as GitHubAgentConfig["action"],
      repo: this.expandTemplate(config.repo as string, event),
      token: config.token as string | undefined,
      title: config.title ? this.expandTemplate(config.title as string, event) : undefined,
      body: config.body ? this.expandTemplate(config.body as string, event) : undefined,
      labels: config.labels as string[],
      assignees: config.assignees as string[],
      head: config.head as string,
      base: config.base as string,
      issue_number: config.issue_number as number,
      pull_number: config.pull_number as number,
      comment: config.comment ? this.expandTemplate(config.comment as string, event) : undefined,
      tag_name: config.tag_name as string,
      name: config.name ? this.expandTemplate(config.name as string, event) : undefined,
      draft: config.draft as boolean,
      prerelease: config.prerelease as boolean,
    };
  }

  private async createIssue(
    config: GitHubAgentConfig,
    token: string
  ): Promise<unknown> {
    const response = await fetch(
      `https://api.github.com/repos/${config.repo}/issues`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: config.title,
          body: config.body,
          labels: config.labels,
          assignees: config.assignees,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API エラー (${response.status}): ${text}`);
    }

    return await response.json();
  }

  private async createPullRequest(
    config: GitHubAgentConfig,
    token: string
  ): Promise<unknown> {
    const response = await fetch(
      `https://api.github.com/repos/${config.repo}/pulls`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: config.title,
          body: config.body,
          head: config.head,
          base: config.base,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API エラー (${response.status}): ${text}`);
    }

    return await response.json();
  }

  private async addComment(
    config: GitHubAgentConfig,
    token: string
  ): Promise<unknown> {
    const issueNumber = config.issue_number || config.pull_number;
    if (!issueNumber) {
      throw new Error("issue_number または pull_number が必要です");
    }

    const response = await fetch(
      `https://api.github.com/repos/${config.repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: config.comment,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API エラー (${response.status}): ${text}`);
    }

    return await response.json();
  }

  private async createRelease(
    config: GitHubAgentConfig,
    token: string
  ): Promise<unknown> {
    const response = await fetch(
      `https://api.github.com/repos/${config.repo}/releases`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag_name: config.tag_name,
          name: config.name,
          body: config.body,
          draft: config.draft ?? false,
          prerelease: config.prerelease ?? false,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API エラー (${response.status}): ${text}`);
    }

    return await response.json();
  }

  private expandTemplate(template: string, event: EvOrchEvent): string {
    if (typeof template !== "string") return template;

    return template
      .replace(/\{\{event_id\}\}/g, event.event_id)
      .replace(/\{\{event_type\}\}/g, event.type)
      .replace(/\{\{source\}\}/g, event.source)
      .replace(/\{\{payload\}\}/g, JSON.stringify(event.payload))
      .replace(/\{\{payload\.(\w+)\}\}/g, (_, key) => {
        const value = event.payload[key];
        return typeof value === "string" ? value : JSON.stringify(value);
      });
  }

  private errorResult(event: EvOrchEvent, error: string): AgentResult {
    return {
      result_id: ulid(),
      event_id: event.event_id,
      policy_name: "",
      agent_plugin: "github",
      status: "failure",
      output: error,
      duration_ms: 1,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
  }
}
