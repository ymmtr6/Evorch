export type Severity = "low" | "medium" | "high" | "critical";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "timeout";

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
  status: "success" | "failure" | "timeout";
  output: string;
  duration_ms: number;
  started_at: string;
  completed_at: string;
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
