import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

interface HttpAgentConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;
}

/**
 * HTTP Agent プラグイン
 * 汎用 HTTP リクエストを送信
 */
export class HttpAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const httpConfig = this.parseConfig(config, event);
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = (httpConfig.timeout ?? 30) * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const body =
        httpConfig.body !== undefined
          ? this.expandTemplate(
              typeof httpConfig.body === "string"
                ? httpConfig.body
                : JSON.stringify(httpConfig.body),
              event
            )
          : undefined;

      const response = await fetch(httpConfig.url, {
        method: httpConfig.method ?? "POST",
        headers: httpConfig.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const completedAt = new Date().toISOString();
      const duration_ms = Date.now() - startTime;

      if (!response.ok) {
        const responseText = await response.text();
        return {
          result_id: ulid(),
          event_id: event.event_id,
          policy_name: "",
          agent_plugin: "http",
          status: "failure",
          output: `HTTP ${response.status}: ${responseText}`,
          duration_ms,
          started_at: startedAt,
          completed_at: completedAt,
        };
      }

      const responseText = await response.text();
      return {
        result_id: ulid(),
        event_id: event.event_id,
        policy_name: "",
        agent_plugin: "http",
        status: "success",
        output: responseText,
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
        agent_plugin: "http",
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
  ): HttpAgentConfig {
    return {
      url: this.expandTemplate(config.url as string, event),
      method: config.method as HttpAgentConfig["method"],
      headers: (config.headers as Record<string, string>) ?? {},
      body: config.body as string | Record<string, unknown> | undefined,
      timeout: config.timeout as number,
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
}
