import type { Command } from "commander";
import { Cron } from "croner";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("各ジョブの状態と次回実行時刻を表示")
    .option("--json", "JSON形式で出力")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const db = openDatabase(config.store.path);
      const store = new Repository(db);

      const statuses = [];
      for (const [jobName, jobConfig] of Object.entries(config.jobs)) {
        let nextRun: Date | null = null;
        if (jobConfig.schedule) {
          const cron = new Cron(jobConfig.schedule, {
            timezone: jobConfig.timezone,
          });
          nextRun = cron.nextRun();
        }
        const lastRun = store.getLastRun(jobName);

        statuses.push({
          job: jobName,
          schedule: jobConfig.schedule || "webhook",
          next_run: nextRun?.toISOString() ?? "-",
          last_run: lastRun?.started_at ?? "-",
          last_status: lastRun?.status ?? "-",
          last_fired: lastRun?.judge_fired ?? "-",
        });
      }

      if (opts.json) {
        console.log(JSON.stringify(statuses, null, 2));
      } else {
        // テーブル表示
        console.log(
          padEnd("JOB", 24) +
            padEnd("NEXT RUN", 22) +
            padEnd("LAST RUN", 22) +
            padEnd("STATUS", 12) +
            "FIRED",
        );
        console.log("-".repeat(92));
        for (const s of statuses) {
          console.log(
            padEnd(s.job, 24) +
              padEnd(formatTime(s.next_run), 22) +
              padEnd(formatTime(s.last_run), 22) +
              padEnd(String(s.last_status), 12) +
              String(s.last_fired),
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
  if (iso === "-") return "-";
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}
