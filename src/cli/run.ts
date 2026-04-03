import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";
import { Scheduler } from "../core/scheduler.js";
import { Executor } from "../core/executor.js";
import { EventBus } from "../core/event-bus.js";
import { PluginRuntime } from "../plugins/runtime.js";
import { createLogger } from "../logger.js";

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("デーモンモードで全ジョブをスケジュール実行")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const logger = createLogger(globalOpts.verbose ? "debug" : config.log.level);

      const db = openDatabase(config.store.path);
      const store = new Repository(db);
      const pluginRuntime = new PluginRuntime();
      const eventBus = new EventBus(config.policies, pluginRuntime, store, logger);
      const executor = new Executor(config, store, eventBus, pluginRuntime, logger);

      const scheduler = new Scheduler(config, {
        onTick: (jobName) => executor.execute(jobName),
      }, logger);

      const jobCount = Object.keys(config.jobs).length;
      logger.info({ jobs: jobCount }, "Evorch デーモン起動");
      scheduler.start();

      // Graceful shutdown
      const shutdown = () => {
        logger.info("シャットダウン中...");
        scheduler.stop();
        db.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
