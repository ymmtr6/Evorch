import { execFile } from "node:child_process";
import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

export class ClaudeCodeAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const template = (config.prompt_template as string) ?? "{{payload}}";
    const timeout = ((config.timeout as number) ?? 300) * 1000;
    const workdir = config.workdir as string | undefined;

    // {{payload}} を展開
    const prompt = template.replace(
      /\{\{payload\}\}/g,
      JSON.stringify(event.payload, null, 2),
    );

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    return new Promise<AgentResult>((resolve) => {
      const child = execFile(
        "claude",
        ["--print", "--output-format", "text", "-p", prompt],
        {
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          cwd: workdir,
        },
        (error, stdout, stderr) => {
          const completedAt = new Date().toISOString();
          const duration_ms = Date.now() - startTime;

          if (error) {
            const isTimeout = error.killed || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
            resolve({
              result_id: ulid(),
              event_id: event.event_id,
              policy_name: "",
              agent_plugin: "claude-code",
              reason: isTimeout ? "timeout" : "error",
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
            agent_plugin: "claude-code",
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
}
