import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { registerRun } from "./run.js";
import { registerOnce } from "./once.js";
import { registerStatus } from "./status.js";
import { registerHistory } from "./history.js";
import { registerValidate } from "./validate.js";
import { registerJob } from "./job.js";
import { registerResults } from "./results.js";
import { registerStop } from "./stop.js";
import { registerInit } from "./init.js";

export const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "evorch");
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, "config.yaml");
export const DEFAULT_JOBS_DIR = join(DEFAULT_CONFIG_DIR, "jobs");
export const DEFAULT_POLICIES_DIR = join(DEFAULT_CONFIG_DIR, "policies");
export const DEFAULT_PID_PATH = join(DEFAULT_CONFIG_DIR, "evorch.pid");

export function createCli(): Command {
  const program = new Command();

  program
    .name("evorch")
    .description("Event-driven orchestration CLI")
    .version("0.1.0")
    .option("-c, --config <path>", "設定ファイルパス", DEFAULT_CONFIG_PATH)
    .option("-v, --verbose", "詳細ログ出力");

  registerInit(program);
  registerRun(program);
  registerOnce(program);
  registerStatus(program);
  registerHistory(program);
  registerValidate(program);
  registerJob(program);
  registerResults(program);
  registerStop(program);

  return program;
}
