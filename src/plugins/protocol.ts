import type { JudgeResult, AgentResult, EvOrchEvent } from "../core/types.js";

/** judge プラグインのインターフェース */
export interface JudgePlugin {
  run(config: Record<string, unknown>, context: JudgeContext): Promise<JudgeResult>;
}

/** agent プラグインのインターフェース */
export interface AgentPlugin {
  run(config: Record<string, unknown>, event: EvOrchEvent): Promise<AgentResult>;
}

export interface JudgeContext {
  jobName: string;
  runId: string;
}
