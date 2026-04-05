export type Severity = "low" | "medium" | "high" | "critical";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "timeout";

/** エージェントの終了理由（詳細） */
export type AgentEndReason =
  | "complete" // 正常終了
  | "error" // エラー終了
  | "timeout" // タイムアウト
  | "killed" // 強制終了（キャンセル）
  | "skipped" // 条件不成立でスキップ
  | "dedup"; // 重複抑止でスキップ

/** エージェントの終了状態（3分類） */
export type AgentOutcome = "ok" | "error" | "skipped";

/** reason → outcome のマッピング */
export function reasonToOutcome(reason: AgentEndReason): AgentOutcome {
  switch (reason) {
    case "complete":
      return "ok";
    case "error":
    case "timeout":
      return "error";
    case "killed":
    case "skipped":
    case "dedup":
      return "skipped";
  }
}

/** システム全体で流れるイベント */
export interface EvOrchEvent {
  event_id: string;
  source: string;
  type: string;
  severity: Severity;
  fingerprint: string;
  payload: Record<string, unknown>;
  labels: Record<string, string>;
  created_at: string;
  run_id: string;
}

/** judge 実行結果 */
export interface JudgeResult {
  fired: boolean;
  payload: Record<string, unknown>;
  exit_code: number;
  duration_ms: number;
  stderr?: string;
}

/** agent 実行結果 */
export interface AgentResult {
  result_id: string;
  event_id: string;
  policy_name: string;
  agent_plugin: string;
  reason: AgentEndReason;
  outcome: AgentOutcome;
  output: string;
  duration_ms: number;
  started_at: string;
  completed_at: string;
  stats?: {
    input_tokens?: number;
    output_tokens?: number;
    tool_calls?: number;
  };
}

/** ジョブ実行記録 */
export interface RunRecord {
  run_id: string;
  job_name: string;
  status: RunStatus;
  scheduled_at: string;
  started_at: string;
  completed_at?: string;
  judge_fired?: boolean;
  judge_payload?: Record<string, unknown>;
  error?: string;
  attempt: number;
}
