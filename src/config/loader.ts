import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { MainConfigSchema, JobSchema, type Config } from "./schema.js";

/** メイン設定ファイル + jobs_dir のジョブ定義を読み込んで統合する */
export function loadConfig(configPath: string): Config {
  const absPath = resolve(configPath);
  const baseDir = dirname(absPath);
  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseYaml(raw);
  const mainConfig = MainConfigSchema.parse(parsed);

  // jobs_dir 内の *.yaml を読み込み
  const jobsDirPath = resolve(baseDir, mainConfig.jobs_dir);
  const dirJobs = loadJobsFromDir(jobsDirPath);

  // インライン jobs と jobs_dir を統合（jobs_dir が優先）
  const mergedJobs = { ...mainConfig.jobs, ...dirJobs };

  return {
    ...mainConfig,
    store: {
      ...mainConfig.store,
      path: resolve(baseDir, mainConfig.store.path),
    },
    jobs: mergedJobs,
  };
}

/** ディレクトリ内の *.yaml を読み込み、ファイル名をジョブ名としてパースする */
function loadJobsFromDir(
  dirPath: string,
): Record<string, ReturnType<typeof JobSchema.parse>> {
  if (!existsSync(dirPath)) {
    return {};
  }

  const files = readdirSync(dirPath).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );
  const jobs: Record<string, ReturnType<typeof JobSchema.parse>> = {};

  for (const file of files) {
    const jobName = basename(file).replace(/\.(yaml|yml)$/, "");
    const filePath = resolve(dirPath, file);
    const raw = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(raw);
    jobs[jobName] = JobSchema.parse(parsed);
  }

  return jobs;
}
