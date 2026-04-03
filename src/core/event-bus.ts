import { ulid } from "ulid";
import type { EvOrchEvent, AgentResult } from "./types.js";
import type { PolicyConfig } from "../config/schema.js";
import type { PluginRuntime } from "../plugins/runtime.js";
import type { Repository } from "../store/repository.js";
import type { Logger } from "../logger.js";
import { matchEvent } from "./policy.js";

export class EventBus {
  constructor(
    private policies: PolicyConfig[],
    private pluginRuntime: PluginRuntime,
    private store: Repository,
    private logger: Logger,
  ) {}

  async emit(event: EvOrchEvent): Promise<void> {
    this.store.recordEvent(event);
    this.logger.info(
      { event_id: event.event_id, type: event.type, source: event.source },
      "イベント発行",
    );

    for (const policy of this.policies) {
      if (!matchEvent(event, policy.match)) {
        continue;
      }

      this.logger.info(
        { policy: policy.name, agent: policy.agent.plugin },
        "ポリシーマッチ → agent 起動",
      );

      const startedAt = new Date().toISOString();
      const startTime = Date.now();

      try {
        const agentResult = await this.pluginRuntime.runAgent(
          policy.agent.plugin,
          policy.agent.config as Record<string, unknown>,
          event,
        );

        const result: AgentResult = {
          ...agentResult,
          result_id: agentResult.result_id || ulid(),
          event_id: event.event_id,
          policy_name: policy.name,
          agent_plugin: policy.agent.plugin,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        };

        this.store.recordAgentResult(result);
        this.logger.info(
          { policy: policy.name, status: result.status, duration_ms: result.duration_ms },
          "agent 完了",
        );
      } catch (err) {
        const result: AgentResult = {
          result_id: ulid(),
          event_id: event.event_id,
          policy_name: policy.name,
          agent_plugin: policy.agent.plugin,
          status: "failure",
          output: String(err),
          duration_ms: Date.now() - startTime,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        };
        this.store.recordAgentResult(result);
        this.logger.error({ policy: policy.name, err }, "agent 失敗");
      }
    }
  }
}
