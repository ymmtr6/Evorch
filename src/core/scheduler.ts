import { Cron } from "croner";
import type { Config } from "../config/schema.js";
import type { Logger } from "../logger.js";

export interface SchedulerOptions {
  onTick: (jobName: string) => Promise<void>;
}

export class Scheduler {
  private cronJobs = new Map<string, Cron>();

  constructor(
    private config: Config,
    private options: SchedulerOptions,
    private logger: Logger,
  ) {}

  start(): void {
    for (const [jobName, jobConfig] of Object.entries(this.config.jobs)) {
      // webhook トリガーのジョブはスケジュールしない
      if (!jobConfig.schedule) {
        this.logger.info({ job: jobName }, "スケジュールなし（Webhook トリガー）");
        continue;
      }

      const cron = new Cron(
        jobConfig.schedule,
        { timezone: jobConfig.timezone, protect: true },
        async () => {
          this.logger.info({ job: jobName }, "cron tick");
          try {
            await this.options.onTick(jobName);
          } catch (err) {
            this.logger.error({ job: jobName, err }, "ジョブ実行エラー");
          }
        },
      );
      this.cronJobs.set(jobName, cron);
      this.logger.info(
        { job: jobName, schedule: jobConfig.schedule, next: cron.nextRun() },
        "スケジュール登録",
      );
    }
  }

  stop(): void {
    for (const [name, cron] of this.cronJobs) {
      cron.stop();
      this.logger.debug({ job: name }, "スケジュール停止");
    }
    this.cronJobs.clear();
  }

  getNextRun(jobName: string): Date | null {
    const cron = this.cronJobs.get(jobName);
    return cron?.nextRun() ?? null;
  }

  /** 特定ジョブを即時実行（once コマンド用） */
  async triggerNow(jobName: string): Promise<void> {
    await this.options.onTick(jobName);
  }
}
