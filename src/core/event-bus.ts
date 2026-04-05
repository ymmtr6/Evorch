import { ulid } from "ulid";
import type { EvOrchEvent, AgentResult, AgentEndReason } from "./types.js";
import { reasonToOutcome } from "./types.js";
import type { PolicyConfig } from "../config/schema.js";
import type { PluginRuntime } from "../plugins/runtime.js";
import type { Repository } from "../store/repository.js";
import type { Logger } from "../logger.js";
import { matchEvent } from "./policy.js";

export class EventBus {
  private dispatchDepth = 0;
  private readonly maxDispatchDepth: number;

  constructor(
    private policies: PolicyConfig[],
    private pluginRuntime: PluginRuntime,
    private store: Repository,
    private logger: Logger,
    options?: { maxDispatchDepth?: number },
  ) {
    this.maxDispatchDepth = options?.maxDispatchDepth ?? 10;
  }

  async emit(event: EvOrchEvent): Promise<void> {
    // 再帰ガード
    if (this.dispatchDepth >= this.maxDispatchDepth) {
      this.logger.warn(
        { event_id: event.event_id, depth: this.dispatchDepth },
        "再帰深度上限によりイベント破棄",
      );
      return;
    }

    this.dispatchDepth++;
    try {
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

          const reason: AgentEndReason =
            (agentResult as { reason?: AgentEndReason }).reason ?? "complete";
          const result: AgentResult = {
            ...agentResult,
            result_id: agentResult.result_id || ulid(),
            event_id: event.event_id,
            policy_name: policy.name,
            agent_plugin: policy.agent.plugin,
            reason,
            outcome: reasonToOutcome(reason),
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
          };

          this.store.recordAgentResult(result);
          this.logger.info(
            {
              policy: policy.name,
              reason: result.reason,
              outcome: result.outcome,
              duration_ms: result.duration_ms,
            },
            "agent 完了",
          );
        } catch (err) {
          const reason: AgentEndReason = "error";
          const result: AgentResult = {
            result_id: ulid(),
            event_id: event.event_id,
            policy_name: policy.name,
            agent_plugin: policy.agent.plugin,
            reason,
            outcome: reasonToOutcome(reason),
            output: String(err),
            duration_ms: Date.now() - startTime,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          };
          this.store.recordAgentResult(result);
          this.logger.error({ policy: policy.name, err }, "agent 失敗");
        }
      }
    } finally {
      this.dispatchDepth--;
    }
  }
}
