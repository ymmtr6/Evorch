import { execFile } from "node:child_process";
import { ulid } from "ulid";
import type { AgentPlugin } from "../protocol.js";
import type { AgentResult, EvOrchEvent } from "../../core/types.js";

export class CodexAgent implements AgentPlugin {
  async run(
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const template = (config.prompt_template as string) ?? "{{payload}}";
    const timeout = ((config.timeout as number | undefined) ?? 300) * 1000;
    const workdir = config.workdir as string | undefined;
    const model = config.model as string | undefined;
    const approvalMode = config.approval_mode as string | undefined;

    // テンプレート変数を展開
    const prompt = this.expandTemplate(template, event);

    // codex コマンドを構築
    const args = ["-q"]; // quiet mode (非対話)
    if (model) {
      args.push("-m", model);
    }
    if (approvalMode) {
      args.push("-a", approvalMode);
    }
    args.push(prompt);

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    return new Promise<AgentResult>((resolve) => {
      const child = execFile("codex", args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        cwd: workdir,
      }, (error, stdout, stderr) => {
        const completedAt = new Date().toISOString();
        const duration_ms = Date.now() - startTime;

        if (error) {
          const isTimeout = error.killed || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
          resolve({
            result_id: ulid(),
            event_id: event.event_id,
            policy_name: "",
            agent_plugin: "codex",
            status: isTimeout ? "timeout" : "failure",
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
          agent_plugin: "codex",
          status: "success",
          output: stdout,
          duration_ms,
          started_at: startedAt,
          completed_at: completedAt,
        });
      });
    });
  }

  private expandTemplate(template: string, event: EvOrchEvent): string {
    return template
      .replace(/\{\{event_id\}\}/g, event.event_id)
      .replace(/\{\{event_type\}\}/g, event.type)
      .replace(/\{\{source\}\}/g, event.source)
      .replace(/\{\{payload\}\}/g, JSON.stringify(event.payload, null, 2))
      .replace(/\{\{payload\.(\w+)\}\}/g, (_, key) => {
        const value = event.payload[key];
        return typeof value === "string" ? value : JSON.stringify(value);
      });
  }
}
