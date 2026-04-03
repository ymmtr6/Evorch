import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";

export function registerHistory(program: Command): void {
  program
    .command("history [job]")
    .description("実行履歴を表示")
    .option("-n, --limit <number>", "表示件数", "20")
    .option("--json", "JSON形式で出力")
    .action(async (jobName, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const db = openDatabase(config.store.path);
      const store = new Repository(db);

      const limit = parseInt(opts.limit, 10);
      const runs = store.getRunHistory(jobName, limit);

      if (opts.json) {
        console.log(JSON.stringify(runs, null, 2));
      } else {
        console.log(
          padEnd("RUN ID", 28) +
            padEnd("JOB", 24) +
            padEnd("STARTED", 22) +
            padEnd("STATUS", 12) +
            "FIRED",
        );
        console.log("-".repeat(98));
        for (const r of runs) {
          console.log(
            padEnd(r.run_id, 28) +
              padEnd(r.job_name, 24) +
              padEnd(formatTime(r.started_at), 22) +
              padEnd(r.status, 12) +
              String(r.judge_fired ?? "-"),
          );
        }
      }

      db.close();
    });
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}
