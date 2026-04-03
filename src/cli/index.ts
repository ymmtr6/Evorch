import { Command } from "commander";
import { registerRun } from "./run.js";
import { registerOnce } from "./once.js";
import { registerStatus } from "./status.js";
import { registerHistory } from "./history.js";
import { registerValidate } from "./validate.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("evorch")
    .description("Event-driven orchestration CLI")
    .version("0.1.0")
    .option("-c, --config <path>", "設定ファイルパス", "./evorch.config.yaml")
    .option("-v, --verbose", "詳細ログ出力");

  registerRun(program);
  registerOnce(program);
  registerStatus(program);
  registerHistory(program);
  registerValidate(program);

  return program;
}
