import { execFile } from "node:child_process";
import type { JudgePlugin, JudgeContext } from "../protocol.js";
import type { JudgeResult } from "../../core/types.js";

export class ShellJudge implements JudgePlugin {
  async run(
    config: Record<string, unknown>,
    _context: JudgeContext,
  ): Promise<JudgeResult> {
    const command = config.command as string;
    const timeout = ((config.timeout as number) ?? 60) * 1000;
    const startTime = Date.now();

    return new Promise<JudgeResult>((resolve) => {
      execFile(
        "sh",
        ["-c", command],
        { timeout, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          const duration_ms = Date.now() - startTime;
          let exitCode = 0;
          if (error) {
            // child_process のエラーは code に exit code (数値) が入る場合がある
            const errAny = error as { code?: string | number; status?: number };
            if (typeof errAny.code === "number") {
              exitCode = errAny.code;
            } else if (typeof errAny.status === "number") {
              exitCode = errAny.status;
            } else {
              exitCode = 1;
            }
          }
          const fired = exitCode === 0 && !error;

          let payload: Record<string, unknown>;
          try {
            const parsed = JSON.parse(stdout.trim());
            // 配列の場合もそのまま payload に含める
            payload = Array.isArray(parsed)
              ? { items: parsed, count: parsed.length }
              : parsed;
            // JSON配列が空の場合は fired = false とみなす
            if (Array.isArray(parsed) && parsed.length === 0) {
              resolve({ fired: false, payload, exit_code: exitCode, duration_ms, stderr: stderr || undefined });
              return;
            }
          } catch {
            const raw = stdout.trim();
            payload = raw ? { raw } : {};
          }

          resolve({
            fired,
            payload,
            exit_code: exitCode,
            duration_ms,
            stderr: stderr || undefined,
          });
        },
      );
    });
  }
}
