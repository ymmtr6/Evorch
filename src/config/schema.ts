import { z } from "zod";

const JudgeConfigSchema = z.object({
  plugin: z.string(),
  config: z.record(z.unknown()).default({}),
});

const DedupSchema = z.object({
  fingerprint: z.string(),
  suppress_for: z.string(),
});

const EventTemplateSchema = z.object({
  type: z.string(),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .default("medium"),
  labels: z.record(z.string()).default({}),
});

const PolicyMatchSchema = z.object({
  type: z.string().optional(),
  severity: z
    .union([
      z.enum(["low", "medium", "high", "critical"]),
      z.array(z.enum(["low", "medium", "high", "critical"])),
    ])
    .optional(),
  labels: z.record(z.string()).optional(),
});

const AgentConfigSchema = z.object({
  plugin: z.string(),
  config: z.record(z.unknown()).default({}),
});

const OnFailureSchema = z.object({
  agent: AgentConfigSchema.optional(),
  command: z.string().optional(),
});

/** ジョブ定義スキーマ（個別YAMLファイル用） */
export const JobSchema = z.object({
  schedule: z.string(),
  timezone: z.string().optional(),
  judge: JudgeConfigSchema,
  event: EventTemplateSchema,
  dedup: DedupSchema.optional(),
  on_failure: OnFailureSchema.optional(),
});

const PolicySchema = z.object({
  name: z.string(),
  match: PolicyMatchSchema,
  agent: AgentConfigSchema,
});

const RetrySchema = z.object({
  max_attempts: z.number().default(2),
  backoff: z.enum(["fixed", "exponential"]).default("exponential"),
  initial_delay: z.number().default(10),
});

const ExecutionSchema = z.object({
  max_concurrent: z.number().default(3),
  default_timeout: z.number().default(120),
  retry: RetrySchema.default({}),
});

/** メイン設定ファイルスキーマ */
export const MainConfigSchema = z.object({
  store: z
    .object({
      path: z.string().default("./evorch.db"),
    })
    .default({}),
  log: z
    .object({
      level: z
        .enum(["debug", "info", "warn", "error"])
        .default("info"),
    })
    .default({}),
  jobs_dir: z.string().default("./jobs"),
  jobs: z.record(z.string(), JobSchema).default({}),
  policies: z.array(PolicySchema).default([]),
  execution: ExecutionSchema.default({}),
});

export type JobConfig = z.infer<typeof JobSchema>;
export type PolicyConfig = z.infer<typeof PolicySchema>;
export type PolicyMatch = z.infer<typeof PolicyMatchSchema>;
export type MainConfig = z.infer<typeof MainConfigSchema>;

/** ジョブ名をキーにした最終的な統合設定 */
export interface Config extends MainConfig {
  /** メイン設定のインラインjobs + jobs_dir から読み込んだジョブの統合結果 */
  jobs: Record<string, JobConfig>;
}
