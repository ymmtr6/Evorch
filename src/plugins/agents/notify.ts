import { execFile } from "node:child_process";
import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

/**
 * macOS 通知エージェント
 * osascript を使用して通知センターへ通知を送る
 *
 * config:
 *   title:    通知のタイトル (デフォルト: "Evorch")
 *   message:  通知本文 (デフォルト: "{{event_type}} from {{source}}")
 *   subtitle: サブタイトル (省略可)
 *   sound:    通知音 例: "default", "Basso" (省略可)
 */
export class NotifyAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const title = this.expandTemplate(
      (config.title as string) ?? "Evorch",
      event,
    );
    const message = this.expandTemplate(
      (config.message as string) ?? "{{event_type}} from {{source}}",
      event,
    );
    const subtitle = config.subtitle
      ? this.expandTemplate(config.subtitle as string, event)
      : undefined;
    const sound = config.sound as string | undefined;

    const script = this.buildScript(title, message, subtitle, sound);
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    return new Promise<AgentResult>((resolve) => {
      execFile(
        "osascript",
        ["-e", script],
        { timeout: 10000 },
        (error, stdout, stderr) => {
          const completedAt = new Date().toISOString();
          const duration_ms = Date.now() - startTime;

          if (error) {
            resolve({
              result_id: ulid(),
              event_id: event.event_id,
              policy_name: "",
              agent_plugin: "notify",
              reason: "error",
              outcome: "error",
              output: stderr || String(error),
              duration_ms,
              started_at: startedAt,
              completed_at: completedAt,
            });
            return;
          }

          resolve({
            result_id: ulid(),
            event_id: event.event_id,
            policy_name: "",
            agent_plugin: "notify",
            reason: "complete",
            outcome: "ok",
            output: stdout,
            duration_ms,
            started_at: startedAt,
            completed_at: completedAt,
          });
        },
      );
    });
  }

  private buildScript(
    title: string,
    message: string,
    subtitle?: string,
    sound?: string,
  ): string {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    let script = `display notification "${esc(message)}" with title "${esc(title)}"`;

    if (subtitle) {
      script += ` subtitle "${esc(subtitle)}"`;
    }
    if (sound) {
      script += ` sound name "${esc(sound)}"`;
    }

    return script;
  }

  private expandTemplate(template: string, event: EvOrchEvent): string {
    return template
      .replace(/\{\{event_id\}\}/g, event.event_id)
      .replace(/\{\{event_type\}\}/g, event.type)
      .replace(/\{\{source\}\}/g, event.source)
      .replace(/\{\{severity\}\}/g, event.severity)
      .replace(/\{\{payload\}\}/g, JSON.stringify(event.payload, null, 2))
      .replace(/\{\{payload\.(\w+)\}\}/g, (_, key) => {
        const value = event.payload[key];
        return typeof value === "string" ? value : JSON.stringify(value);
      });
  }
}
