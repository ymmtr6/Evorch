import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";
import { Scheduler } from "../core/scheduler.js";
import { Executor } from "../core/executor.js";
import { EventBus } from "../core/event-bus.js";
import { PluginRuntime } from "../plugins/runtime.js";
import { createLogger } from "../logger.js";
import { DEFAULT_CONFIG_DIR, DEFAULT_LOG_PATH, DEFAULT_PID_PATH } from "./index.js";

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("デーモンモードで全ジョブをスケジュール実行")
    .option("-d, --detach", "バックグラウンド（デタッチモード）で起動")
    .action(async (opts, cmd) => {
      // detach フラグが立っている場合、自分自身を detached モードで再起動して終了
      if (opts.detach) {
        mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
        const args = process.argv.slice(2).filter(a => a !== "-d" && a !== "--detach");
        const child = spawn(process.execPath, [process.argv[1], ...args], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, EVORCH_LOG_FILE: DEFAULT_LOG_PATH },
        });
        child.unref();
        console.log(`Evorch をバックグラウンドで起動しました (PID: ${child.pid})`);
        console.log(`ログ: ${DEFAULT_LOG_PATH}`);
        process.exit(0);
      }

      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const logFile = process.env.EVORCH_LOG_FILE;
      const logger = createLogger(globalOpts.verbose ? "debug" : config.log.level, logFile);

      const db = openDatabase(config.store.path);
      const store = new Repository(db);
      const pluginRuntime = new PluginRuntime();
      const eventBus = new EventBus(config.policies, pluginRuntime, store, logger, {
        maxDispatchDepth: config.execution.max_dispatch_depth,
      });
      const executor = new Executor(config, store, eventBus, pluginRuntime, logger);

      const scheduler = new Scheduler(config, {
        onTick: (jobName) => executor.execute(jobName),
      }, logger);

      // 二重起動チェック
      if (existsSync(DEFAULT_PID_PATH)) {
        const existingPid = parseInt(readFileSync(DEFAULT_PID_PATH, "utf-8").trim(), 10);
        let isRunning = false;
        try {
          process.kill(existingPid, 0);
          isRunning = true;
        } catch {
          logger.warn({ pid: existingPid }, "stale な PID ファイルを上書きします");
        }
        if (isRunning) {
          logger.error({ pid: existingPid }, "evorch は既に起動中です");
          process.exit(1);
        }
      }

      // PID ファイル作成
      mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
      writeFileSync(DEFAULT_PID_PATH, String(process.pid), "utf-8");
      logger.info({ pid: process.pid, pidFile: DEFAULT_PID_PATH }, "PID ファイルを作成しました");

      const jobCount = Object.keys(config.jobs).length;
      logger.info({ jobs: jobCount }, "Evorch デーモン起動");
      scheduler.start();

      // Graceful shutdown
      const shutdown = () => {
        logger.info("シャットダウン中...");
        scheduler.stop();
        db.close();
        try { unlinkSync(DEFAULT_PID_PATH); } catch { /* 既に削除されている場合は無視 */ }
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
