import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";
import { Executor } from "../core/executor.js";
import { EventBus } from "../core/event-bus.js";
import { PluginRuntime } from "../plugins/runtime.js";
import { createLogger } from "../logger.js";

export function registerOnce(program: Command): void {
  program
    .command("once <job>")
    .description("指定ジョブを1回だけ即時実行")
    .option("--dry-run", "judge まで実行し、agent は実行しない")
    .action(async (jobName, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const logger = createLogger(globalOpts.verbose ? "debug" : config.log.level);

      if (!config.jobs[jobName]) {
        logger.error({ job: jobName }, "ジョブが見つかりません");
        process.exit(1);
      }

      const db = openDatabase(config.store.path);
      const store = new Repository(db);
      const pluginRuntime = new PluginRuntime();
      const eventBus = new EventBus(config.policies, pluginRuntime, store, logger);
      const executor = new Executor(config, store, eventBus, pluginRuntime, logger);

      try {
        await executor.execute(jobName, { dryRun: opts.dryRun });
      } finally {
        db.close();
      }
    });
}
