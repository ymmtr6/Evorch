import { ulid } from "ulid";
import type { Config, JobConfig } from "../config/schema.js";
import type { EvOrchEvent, RunRecord } from "./types.js";
import type { Repository } from "../store/repository.js";
import type { PluginRuntime } from "../plugins/runtime.js";
import type { EventBus } from "./event-bus.js";
import type { Logger } from "../logger.js";

interface StepOutput {
  name: string;
  output: Record<string, unknown>;
}

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
      // ステップチェーン形式か従来形式かを判定
      if (jobConfig.steps) {
        await this.executeSteps(jobConfig, jobName, runId, options);
      } else if (jobConfig.judge && jobConfig.event) {
        await this.executeLegacy(jobConfig, jobName, runId, options);
      } else {
        throw new Error("ジョブ設定が不正です: judge + event または steps が必要です");
      }
    } catch (err) {
      this.store.recordRunComplete(runId, "failed", undefined, undefined, String(err));
      this.logger.error({ job: jobName, run_id: runId, err }, "ジョブ実行失敗");
    } finally {
      this.running.delete(runId);
      this.concurrentCount--;
    }
  }

  /** 従来の単一 judge/agent 形式 */
  private async executeLegacy(
    jobConfig: JobConfig,
    jobName: string,
    runId: string,
    options?: { dryRun?: boolean },
  ): Promise<void> {
    const now = new Date().toISOString();

    // judge 実行
    const judgeResult = await this.pluginRuntime.runJudge(
      jobConfig.judge!.plugin,
      jobConfig.judge!.config as Record<string, unknown>,
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
      event_id: `${jobConfig.event!.type}:${jobName}:${now}`,
      source: jobName,
      type: jobConfig.event!.type,
      severity: jobConfig.event!.severity,
      fingerprint: jobConfig.dedup
        ? expandFingerprint(jobConfig.dedup.fingerprint)
        : `${jobName}:${now}`,
      payload: judgeResult.payload,
      labels: jobConfig.event!.labels,
      created_at: now,
      run_id: runId,
    };

    await this.eventBus.emit(event);
    this.store.recordRunComplete(runId, "completed", true, judgeResult.payload);
  }

  /** ステップチェーン形式 */
  private async executeSteps(
    jobConfig: JobConfig,
    jobName: string,
    runId: string,
    options?: { dryRun?: boolean },
  ): Promise<void> {
    const now = new Date().toISOString();
    const stepOutputs: StepOutput[] = [];
    let currentPayload: Record<string, unknown> = {};

    for (const step of jobConfig.steps!) {
      this.logger.info({ job: jobName, step: step.name }, "ステップ実行開始");

      // 条件チェック
      if (step.condition) {
        const shouldRun = this.evaluateStepCondition(step.condition, stepOutputs, currentPayload);
        if (!shouldRun) {
          this.logger.info({ job: jobName, step: step.name }, "条件不成立 → ステップスキップ");
          continue;
        }
      }

      // judge ステップ
      if (step.judge) {
        const config = this.expandStepTemplates(step.judge.config, stepOutputs, currentPayload);
        const result = await this.pluginRuntime.runJudge(
          step.judge.plugin,
          config as Record<string, unknown>,
          { jobName, runId },
        );

        if (!result.fired) {
          this.logger.info({ job: jobName, step: step.name }, "judge 条件不成立");
          continue;
        }

        currentPayload = result.payload;
        stepOutputs.push({ name: step.name, output: result.payload });
      }

      // agent ステップ
      if (step.agent) {
        const config = this.expandStepTemplates(step.agent.config, stepOutputs, currentPayload);
        const result = await this.pluginRuntime.runAgent(
          step.agent.plugin,
          config as Record<string, unknown>,
          {
            event_id: `step:${step.name}:${runId}`,
            source: jobName,
            type: "step_execution",
            severity: "medium",
            fingerprint: `${step.name}:${runId}`,
            payload: currentPayload,
            labels: {},
            created_at: now,
            run_id: runId,
          },
        );

        if (result.output) {
          try {
            currentPayload = JSON.parse(result.output);
          } catch {
            currentPayload = { raw: result.output };
          }
        }
        stepOutputs.push({ name: step.name, output: currentPayload });
      }

      this.logger.info({ job: jobName, step: step.name }, "ステップ完了");
    }

    // dry-run の場合はイベント発行せずに終了
    if (options?.dryRun) {
      this.store.recordRunComplete(runId, "completed", true, currentPayload);
      this.logger.info({ job: jobName, payload: currentPayload }, "[dry-run] ステップチェーン完了");
      return;
    }

    // 最終出力をイベントとして発行
    if (jobConfig.output) {
      const event: EvOrchEvent = {
        event_id: `${jobConfig.output.type}:${jobName}:${now}`,
        source: jobName,
        type: jobConfig.output.type,
        severity: jobConfig.output.severity,
        fingerprint: `${jobName}:${runId}`,
        payload: currentPayload,
        labels: jobConfig.output.labels,
        created_at: now,
        run_id: runId,
      };

      await this.eventBus.emit(event);
    }

    this.store.recordRunComplete(runId, "completed", true, currentPayload);
  }

  /** ステップ条件を評価 */
  private evaluateStepCondition(
    condition: string,
    stepOutputs: StepOutput[],
    currentPayload: Record<string, unknown>,
  ): boolean {
    try {
      // steps.<name>.output 形式を解決
      let resolvedCondition = condition;

      for (const step of stepOutputs) {
        const pattern = new RegExp(`steps\\.${step.name}\\.output`, "g");
        resolvedCondition = resolvedCondition.replace(pattern, JSON.stringify(step.output));
      }

      // payload.* を解決
      resolvedCondition = resolvedCondition.replace(/payload\.(\w+)/g, (_, key) => {
        return JSON.stringify(currentPayload[key]);
      });

      // 安全性チェック
      const dangerousPatterns = [/\beval\b/, /\bFunction\b/, /\brequire\b/];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(resolvedCondition)) {
          this.logger.warn(`安全でない条件式: ${condition}`);
          return false;
        }
      }

      return new Function(`return ${resolvedCondition}`)();
    } catch (err) {
      this.logger.warn({ condition, err }, "条件式の評価に失敗");
      return false;
    }
  }

  /** ステップテンプレートを展開 */
  private expandStepTemplates(
    config: Record<string, unknown>,
    stepOutputs: StepOutput[],
    currentPayload: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "string") {
        result[key] = this.expandStepTemplateString(value, stepOutputs, currentPayload);
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.expandStepTemplates(value as Record<string, unknown>, stepOutputs, currentPayload);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /** 文字列内のステップテンプレートを展開 */
  private expandStepTemplateString(
    template: string,
    stepOutputs: StepOutput[],
    currentPayload: Record<string, unknown>,
  ): string {
    let result = template;

    // steps.<name>.output を展開
    for (const step of stepOutputs) {
      const pattern = new RegExp(`\\{\\{\\s*steps\\.${step.name}\\.output\\s*\\}\\}`, "g");
      result = result.replace(pattern, JSON.stringify(step.output));
    }

    // {{payload.*}} を展開
    result = result.replace(/\{\{\s*payload\.(\w+)\s*\}\}/g, (_, key) => {
      const value = currentPayload[key];
      return typeof value === "string" ? value : JSON.stringify(value);
    });

    return result;
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
