import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Command } from "commander";
import { DEFAULT_CONFIG_PATH, DEFAULT_JOBS_DIR } from "./index.js";

const EXAMPLE_CONFIG = `# evorch 設定ファイル
store:
  path: ./evorch.db

log:
  level: info

jobs_dir: ./jobs

policies:
  - name: default
    match:
      severity: [high, critical]
    agent:
      plugin: shell
      config:
        command: echo "Event fired"
`;

const EXAMPLE_JOB = `# サンプルジョブ定義
schedule: "*/5 * * * *"

judge:
  plugin: shell
  config:
    command: "exit 0"

event:
  type: example.event
  severity: low
  labels:
    source: example
`;

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("設定ディレクトリと初期設定ファイルを作成")
    .option("--force", "既存のファイルを上書きする")
    .action((opts: { force?: boolean }) => {
      mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });

      if (!existsSync(DEFAULT_CONFIG_PATH) || opts.force) {
        writeFileSync(DEFAULT_CONFIG_PATH, EXAMPLE_CONFIG, "utf-8");
        console.log(`作成: ${DEFAULT_CONFIG_PATH}`);
      } else {
        console.log(`スキップ (既存): ${DEFAULT_CONFIG_PATH}`);
      }

      const exampleJobPath = `${DEFAULT_JOBS_DIR}/example.yaml`;
      if (!existsSync(exampleJobPath) || opts.force) {
        writeFileSync(exampleJobPath, EXAMPLE_JOB, "utf-8");
        console.log(`作成: ${exampleJobPath}`);
      } else {
        console.log(`スキップ (既存): ${exampleJobPath}`);
      }

      console.log("\n次のコマンドで起動できます: evorch run");
    });
}
