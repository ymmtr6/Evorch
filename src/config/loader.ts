import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { MainConfigSchema, JobSchema, PolicyFileSchema, type Config, type PolicyConfig } from "./schema.js";

/** デフォルト設定を返す */
function getDefaultConfig(baseDir: string): Config {
  return {
    store: { path: resolve(baseDir, "evorch.db") },
    log: { level: "info" },
    jobs_dir: "./jobs",
    jobs: {},
    policies_dir: "./policies",
    policies: [],
    execution: {
      max_concurrent: 3,
      default_timeout: 120,
      max_dispatch_depth: 10,
      retry: { max_attempts: 2, backoff: "exponential", initial_delay: 10 },
    },
  };
}

/** メイン設定ファイル + jobs_dir のジョブ定義を読み込んで統合する */
export function loadConfig(configPath: string): Config {
  const absPath = resolve(configPath);
  const baseDir = dirname(absPath);

  // 設定ファイルが存在しない場合はデフォルト設定を使用
  if (!existsSync(absPath)) {
    const defaultConfig = getDefaultConfig(baseDir);
    const dirJobs = loadJobsFromDir(resolve(baseDir, "jobs"));
    const dirPolicies = loadPoliciesFromDir(resolve(baseDir, "policies"));
    return { ...defaultConfig, jobs: dirJobs, policies: dirPolicies };
  }

  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseYaml(raw);
  const mainConfig = MainConfigSchema.parse(parsed);

  // jobs_dir 内の *.yaml を読み込み
  const jobsDirPath = resolve(baseDir, mainConfig.jobs_dir);
  const dirJobs = loadJobsFromDir(jobsDirPath);

  // policies_dir 内の *.yaml を読み込み、インライン定義とマージ（ディレクトリが優先）
  const policiesDirPath = resolve(baseDir, mainConfig.policies_dir);
  const dirPolicies = loadPoliciesFromDir(policiesDirPath);
  const mergedPolicies = mergePolicies(mainConfig.policies, dirPolicies);

  // インライン jobs と jobs_dir を統合（jobs_dir が優先）
  const mergedJobs = { ...mainConfig.jobs, ...dirJobs };

  return {
    ...mainConfig,
    store: {
      ...mainConfig.store,
      path: resolve(baseDir, mainConfig.store.path),
    },
    jobs: mergedJobs,
    policies: mergedPolicies,
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

/** ディレクトリ内の *.yaml を読み込み、ファイル名をポリシー名としてパースする */
function loadPoliciesFromDir(dirPath: string): PolicyConfig[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const files = readdirSync(dirPath)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const policies: PolicyConfig[] = [];

  for (const file of files) {
    const name = basename(file).replace(/\.(yaml|yml)$/, "");
    const filePath = resolve(dirPath, file);
    const raw = readFileSync(filePath, "utf-8");
    const parsed = parseYaml(raw);
    const filePolicy = PolicyFileSchema.parse(parsed);
    policies.push({ name, ...filePolicy });
  }

  return policies;
}

/** インラインポリシーとディレクトリポリシーをマージする（同名はディレクトリ側が優先） */
function mergePolicies(inline: PolicyConfig[], fromDir: PolicyConfig[]): PolicyConfig[] {
  const dirNames = new Set(fromDir.map((p) => p.name));
  const filtered = inline.filter((p) => !dirNames.has(p.name));
  return [...filtered, ...fromDir];
}
