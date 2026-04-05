import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { Cron } from "croner";

export function registerValidate(program: Command): void {
  program
    .command("validate")
    .description("設定ファイルの検証")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const config = loadConfig(globalOpts.config);
        const jobNames = Object.keys(config.jobs);

        if (jobNames.length === 0) {
          console.log("⚠ ジョブが定義されていません");
          process.exit(1);
        }

        // cron式の検証
        for (const [name, job] of Object.entries(config.jobs)) {
          if (job.schedule) {
            try {
              new Cron(job.schedule);
            } catch (err) {
              console.error(`✗ ジョブ "${name}" のcron式が不正です: ${job.schedule}`);
              process.exit(1);
            }
          }
        }

        console.log(`✓ 設定ファイル: ${globalOpts.config}`);
        console.log(`✓ ジョブ数: ${jobNames.length}`);
        for (const name of jobNames) {
          const job = config.jobs[name];
          const trigger = job.schedule || "webhook";
          console.log(`  - ${name} (${trigger}) judge:${job.judge.plugin}`);
        }
        console.log(`✓ ポリシー数: ${config.policies.length}`);
        for (const p of config.policies) {
          console.log(`  - ${p.name} → agent:${p.agent.plugin}`);
        }
        console.log("\n✓ バリデーション成功");
      } catch (err) {
        console.error("✗ 設定ファイルエラー:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
