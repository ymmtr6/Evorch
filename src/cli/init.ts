import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Command } from "commander";
import { DEFAULT_CONFIG_PATH, DEFAULT_JOBS_DIR, DEFAULT_POLICIES_DIR } from "./index.js";

const EXAMPLE_CONFIG = `# evorch 設定ファイル
store:
  path: ./evorch.db

log:
  level: info

jobs_dir: ./jobs
policies_dir: ./policies
`;

const EXAMPLE_JOB = `# サンプルジョブ定義
# 5分ごとに judge を実行し、条件が成立したら example.event を発火する
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

const EXAMPLE_POLICY = `# ポリシー定義 (ファイル名がポリシー名になる)
# jobs/example.yaml が発火する example.event を受け取り、シェルコマンドを実行する
match:
  type: example.event

agent:
  plugin: shell
  config:
    command: echo "example.event を受信しました"
`;

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("設定ディレクトリと初期設定ファイルを作成")
    .option("--force", "既存のファイルを上書きする")
    .action((opts: { force?: boolean }) => {
      mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
      mkdirSync(DEFAULT_POLICIES_DIR, { recursive: true });

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

      const examplePolicyPath = `${DEFAULT_POLICIES_DIR}/on-example-event.yaml`;
      if (!existsSync(examplePolicyPath) || opts.force) {
        writeFileSync(examplePolicyPath, EXAMPLE_POLICY, "utf-8");
        console.log(`作成: ${examplePolicyPath}`);
      } else {
        console.log(`スキップ (既存): ${examplePolicyPath}`);
      }

      console.log("\n次のコマンドで起動できます: evorch run");
    });
}
