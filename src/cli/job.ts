import { Command } from "commander";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DEFAULT_CONFIG_DIR, DEFAULT_JOBS_DIR } from "./index.js";
import {
  getTemplate,
  listTemplates,
} from "../templates/index.js";

export function registerJob(program: Command): void {
  const job = program
    .command("job")
    .description("ジョブ定義ファイルの管理");

  job
    .command("add <file>")
    .description("ジョブファイルを登録")
    .action((file: string) => {
      const srcPath = resolve(file);
      if (!existsSync(srcPath)) {
        console.error(`ファイルが見つかりません: ${srcPath}`);
        process.exit(1);
      }

      // jobs ディレクトリを作成
      if (!existsSync(DEFAULT_JOBS_DIR)) {
        mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
      }

      const jobName = basename(file).replace(/\.(yaml|yml)$/, "");
      const destPath = resolve(DEFAULT_JOBS_DIR, `${jobName}.yaml`);

      if (existsSync(destPath)) {
        console.error(`ジョブは既に登録されています: ${jobName}`);
        process.exit(1);
      }

      copyFileSync(srcPath, destPath);
      console.log(`ジョブを登録しました: ${jobName}`);
    });

  job
    .command("remove <name>")
    .description("ジョブを削除")
    .action((name: string) => {
      const jobPath = findJobFile(name);
      if (!jobPath) {
        console.error(`ジョブが見つかりません: ${name}`);
        process.exit(1);
      }

      rmSync(jobPath);
      console.log(`ジョブを削除しました: ${name}`);
    });

  job
    .command("list")
    .description("登録済みジョブ一覧を表示")
    .action(() => {
      if (!existsSync(DEFAULT_JOBS_DIR)) {
        console.log("登録済みジョブはありません");
        return;
      }

      const files = readdirSync(DEFAULT_JOBS_DIR).filter(
        (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
      );

      if (files.length === 0) {
        console.log("登録済みジョブはありません");
        return;
      }

      console.log("登録済みジョブ:");
      for (const file of files) {
        const jobName = file.replace(/\.(yaml|yml)$/, "");
        console.log(`  - ${jobName}`);
      }
    });

  // 初期化コマンド（設定ディレクトリとデフォルト設定を作成）
  job
    .command("init")
    .description("設定ディレクトリを初期化、またはテンプレートからジョブを作成")
    .option("--list", "テンプレート一覧を表示")
    .option("-t, --template <name>", "テンプレート名を指定してジョブを作成")
    .option("-o, --output <path>", "出力先パス（テンプレート使用時）")
    .action((options: { list?: boolean; template?: string; output?: string }) => {
      // テンプレート一覧表示
      if (options.list) {
        console.log("利用可能なテンプレート:\n");
        const templates = listTemplates();
        for (const t of templates) {
          console.log(`  ${t.name}`);
          console.log(`    ${t.description}\n`);
        }
        return;
      }

      // テンプレートからジョブ作成
      if (options.template) {
        const template = getTemplate(options.template);
        if (!template) {
          console.error(`テンプレートが見つかりません: ${options.template}`);
          console.error("利用可能なテンプレートを確認するには --list を使用してください");
          process.exit(1);
        }

        // 出力先を決定
        const outputPath = options.output
          ? resolve(options.output)
          : resolve(DEFAULT_JOBS_DIR, `${template.name}.yaml`);

        // 出力ディレクトリを作成
        const outputDir = dirname(outputPath);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        // ファイル存在チェック
        if (existsSync(outputPath)) {
          console.error(`ファイルが既に存在します: ${outputPath}`);
          process.exit(1);
        }

        writeFileSync(outputPath, template.content);
        console.log(`テンプレートからジョブを作成しました: ${outputPath}`);
        console.log(`テンプレート: ${template.name} (${template.description})`);
        return;
      }

      // デフォルト: 設定ディレクトリの初期化
      if (!existsSync(DEFAULT_CONFIG_DIR)) {
        mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
      }
      if (!existsSync(DEFAULT_JOBS_DIR)) {
        mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
      }

      const configPath = resolve(DEFAULT_CONFIG_DIR, "config.yaml");
      if (!existsSync(configPath)) {
        const defaultConfig = `store:
  path: "evorch.db"

log:
  level: "info"

jobs_dir: "./jobs"

policies: []
`;
        writeFileSync(configPath, defaultConfig);
        console.log(`設定ファイルを作成しました: ${configPath}`);
      } else {
        console.log(`設定ファイルは既に存在します: ${configPath}`);
      }

      console.log(`設定ディレクトリ: ${DEFAULT_CONFIG_DIR}`);
      console.log(`ジョブディレクトリ: ${DEFAULT_JOBS_DIR}`);
    });
}

function findJobFile(name: string): string | null {
  const yamlPath = resolve(DEFAULT_JOBS_DIR, `${name}.yaml`);
  const ymlPath = resolve(DEFAULT_JOBS_DIR, `${name}.yml`);

  if (existsSync(yamlPath)) return yamlPath;
  if (existsSync(ymlPath)) return ymlPath;
  return null;
}
