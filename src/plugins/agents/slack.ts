import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

interface SlackAgentConfig {
  channel: string;
  message: string;
  token?: string;
  thread_ts?: string;
  blocks?: unknown[];
  attachments?: unknown[];
}

/**
 * Slack Agent プラグイン
 * Slack Web API を使用してメッセージを送信
 */
export class SlackAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const slackConfig = this.parseConfig(config, event);
    const token = slackConfig.token || process.env.SLACK_BOT_TOKEN;

    if (!token) {
      return this.errorResult(event, "SLACK_BOT_TOKEN が設定されていません");
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      const body: Record<string, unknown> = {
        channel: slackConfig.channel,
        text: slackConfig.message,
      };

      if (slackConfig.thread_ts) {
        body.thread_ts = slackConfig.thread_ts;
      }
      if (slackConfig.blocks) {
        body.blocks = slackConfig.blocks;
      }
      if (slackConfig.attachments) {
        body.attachments = slackConfig.attachments;
      }

      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const completedAt = new Date().toISOString();
      const duration_ms = Date.now() - startTime;
      const result = await response.json();

      if (!result.ok) {
        return {
          result_id: ulid(),
          event_id: event.event_id,
          policy_name: "",
          agent_plugin: "slack",
          status: "failure",
          output: `Slack API エラー: ${result.error}`,
          duration_ms,
          started_at: startedAt,
          completed_at: completedAt,
        };
      }

      return {
        result_id: ulid(),
        event_id: event.event_id,
        policy_name: "",
        agent_plugin: "slack",
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
        agent_plugin: "slack",
        status: "failure",
        output: errorMessage,
        duration_ms,
        started_at: startedAt,
        completed_at: completedAt,
      };
    }
  }

  private parseConfig(
    config: Record<string, unknown>,
    event: EvOrchEvent
  ): SlackAgentConfig {
    return {
      channel: this.expandTemplate(config.channel as string, event),
      message: this.expandTemplate(config.message as string, event),
      token: config.token as string | undefined,
      thread_ts: config.thread_ts as string | undefined,
      blocks: config.blocks as unknown[],
      attachments: config.attachments as unknown[],
    };
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
      agent_plugin: "slack",
      status: "failure",
      output: error,
      duration_ms: 0,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
  }
}
