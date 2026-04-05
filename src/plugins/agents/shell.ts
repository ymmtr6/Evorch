import { execFile } from "node:child_process";
import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

export class ShellAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const command = config.command as string;
    const timeout = ((config.timeout as number) ?? 60) * 1000;
    const workdir = config.workdir as string | undefined;

    // テンプレート変数を展開
    const expandedCommand = this.expandTemplate(command, event);

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    return new Promise<AgentResult>((resolve) => {
      execFile(
        "sh",
        ["-c", expandedCommand],
        { timeout, maxBuffer: 1024 * 1024, cwd: workdir },
        (error, stdout, stderr) => {
          const completedAt = new Date().toISOString();
          const duration_ms = Date.now() - startTime;

          if (error) {
            const isTimeout = error.killed || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
            resolve({
              result_id: ulid(),
              event_id: event.event_id,
              policy_name: "",
              agent_plugin: "shell",
              reason: isTimeout ? "timeout" : "error",
              outcome: "error",
              output: stderr || stdout || String(error),
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
            agent_plugin: "shell",
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

  private expandTemplate(template: string, event: EvOrchEvent): string {
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
