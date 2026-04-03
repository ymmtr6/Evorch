import { ulid } from "ulid";
import type { Config, JobConfig } from "../config/schema.js";
import type { EvOrchEvent, RunRecord } from "./types.js";
import type { Repository } from "../store/repository.js";
import type { PluginRuntime } from "../plugins/runtime.js";
import type { EventBus } from "./event-bus.js";
import type { Logger } from "../logger.js";

export class Executor {
  private running = new Map<string, AbortController>();
  private concurrentCount = 0;

  constructor(
    private config: Config,
    private store: Repository,
    private eventBus: EventBus,
    private pluginRuntime: PluginRuntime,
    private logger: Logger,
  ) {}

  /** ジョブ1回分の実行フロー */
  async execute(jobName: string, options?: { dryRun?: boolean }): Promise<void> {
    const jobConfig = this.config.jobs[jobName];
    if (!jobConfig) {
      throw new Error(`ジョブが見つかりません: ${jobName}`);
    }

    // concurrency チェック
    if (this.concurrentCount >= this.config.execution.max_concurrent) {
      this.logger.warn({ job: jobName }, "同時実行数上限に達しているためスキップ");
      return;
    }

    const runId = ulid();
    const now = new Date().toISOString();
    const abort = new AbortController();
    this.running.set(runId, abort);
    this.concurrentCount++;

    const run: RunRecord = {
      run_id: runId,
      job_name: jobName,
      status: "running",
      scheduled_at: now,
      started_at: now,
      attempt: 1,
    };
    this.store.recordRunStart(run);
    this.logger.info({ job: jobName, run_id: runId }, "ジョブ実行開始");

    try {
      // judge 実行
      const judgeResult = await this.pluginRuntime.runJudge(
        jobConfig.judge.plugin,
        jobConfig.judge.config as Record<string, unknown>,
        { jobName, runId },
      );

      this.logger.info(
        { job: jobName, fired: judgeResult.fired, duration_ms: judgeResult.duration_ms },
        "judge 完了",
      );

      if (!judgeResult.fired) {
        this.store.recordRunComplete(runId, "completed", false, judgeResult.payload);
        this.logger.info({ job: jobName }, "条件不成立 → スキップ");
        return;
      }

      // dedup チェック
      if (jobConfig.dedup) {
        const fingerprint = expandFingerprint(jobConfig.dedup.fingerprint);
        if (this.store.checkFingerprint(fingerprint)) {
          this.store.recordRunComplete(runId, "skipped", true, judgeResult.payload);
          this.logger.info({ job: jobName, fingerprint }, "重複抑止によりスキップ");
          return;
        }

        const expiresAt = calcExpiry(jobConfig.dedup.suppress_for);
        this.store.recordFingerprint(fingerprint, expiresAt);
      }

      // dry-run の場合はイベント発行せずに終了
      if (options?.dryRun) {
        this.store.recordRunComplete(runId, "completed", true, judgeResult.payload);
        this.logger.info({ job: jobName, payload: judgeResult.payload }, "[dry-run] イベント内容");
        return;
      }

      // イベント生成 + 配送
      const event: EvOrchEvent = {
        event_id: `${jobConfig.event.type}:${jobName}:${now}`,
        source: jobName,
        type: jobConfig.event.type,
        severity: jobConfig.event.severity,
        fingerprint: jobConfig.dedup
          ? expandFingerprint(jobConfig.dedup.fingerprint)
          : `${jobName}:${now}`,
        payload: judgeResult.payload,
        labels: jobConfig.event.labels,
        created_at: now,
        run_id: runId,
      };

      await this.eventBus.emit(event);
      this.store.recordRunComplete(runId, "completed", true, judgeResult.payload);
    } catch (err) {
      this.store.recordRunComplete(runId, "failed", undefined, undefined, String(err));
      this.logger.error({ job: jobName, run_id: runId, err }, "ジョブ実行失敗");
    } finally {
      this.running.delete(runId);
      this.concurrentCount--;
    }
  }

  async cancel(runId: string): Promise<void> {
    const abort = this.running.get(runId);
    if (abort) {
      abort.abort();
      this.running.delete(runId);
      this.concurrentCount--;
    }
  }

  get activeCount(): number {
    return this.concurrentCount;
  }
}

/** fingerprint テンプレートの環境変数を展開 */
function expandFingerprint(template: string): string {
  return template.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? name);
}

/** "1h", "30m" 形式の期間を ISO8601 の有効期限に変換 */
function calcExpiry(duration: string): string {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`不正な期間形式: ${duration}`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]!;
  return new Date(Date.now() + value * ms).toISOString();
}
