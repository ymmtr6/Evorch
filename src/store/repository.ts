import type Database from "better-sqlite3";
import type { EvOrchEvent, RunRecord, AgentResult, RunStatus } from "../core/types.js";

export class Repository {
  constructor(private db: Database.Database) {}

  // --- 実行履歴 ---

  recordRunStart(run: RunRecord): void {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, job_name, status, scheduled_at, started_at, attempt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.run_id,
        run.job_name,
        run.status,
        run.scheduled_at,
        run.started_at,
        run.attempt,
      );
  }

  recordRunComplete(
    runId: string,
    status: RunStatus,
    judgeFired?: boolean,
    judgePayload?: Record<string, unknown>,
    error?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE runs
         SET status = ?, completed_at = datetime('now'),
             judge_fired = ?, judge_payload = ?, error = ?
         WHERE run_id = ?`,
      )
      .run(
        status,
        judgeFired != null ? (judgeFired ? 1 : 0) : null,
        judgePayload ? JSON.stringify(judgePayload) : null,
        error ?? null,
        runId,
      );
  }

  getRunHistory(jobName?: string, limit: number = 20): RunRecord[] {
    const query = jobName
      ? `SELECT * FROM runs WHERE job_name = ? ORDER BY started_at DESC LIMIT ?`
      : `SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`;
    const params = jobName ? [jobName, limit] : [limit];
    const rows = this.db.prepare(query).all(...params) as RunRow[];
    return rows.map(toRunRecord);
  }

  getLastRun(jobName: string): RunRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM runs WHERE job_name = ? ORDER BY started_at DESC LIMIT 1`,
      )
      .get(jobName) as RunRow | undefined;
    return row ? toRunRecord(row) : null;
  }

  getActiveRuns(): RunRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM runs WHERE status = 'running'`)
      .all() as RunRow[];
    return rows.map(toRunRecord);
  }

  // --- イベント ---

  recordEvent(event: EvOrchEvent): void {
    this.db
      .prepare(
        `INSERT INTO events (event_id, source, type, severity, fingerprint, payload, labels, run_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.event_id,
        event.source,
        event.type,
        event.severity,
        event.fingerprint,
        JSON.stringify(event.payload),
        JSON.stringify(event.labels),
        event.run_id,
        event.created_at,
      );
  }

  // --- 重複抑止 ---

  checkFingerprint(fingerprint: string): boolean {
    const now = new Date().toISOString();
    const row = this.db
      .prepare(
        `SELECT * FROM fingerprints WHERE fingerprint = ? AND expires_at > ?`,
      )
      .get(fingerprint, now) as { fingerprint: string } | undefined;
    return row != null;
  }

  recordFingerprint(fingerprint: string, expiresAt: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fingerprints (fingerprint, last_fired_at, expires_at)
         VALUES (?, ?, ?)`,
      )
      .run(fingerprint, now, expiresAt);
  }

  cleanExpiredFingerprints(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`DELETE FROM fingerprints WHERE expires_at <= ?`)
      .run(now);
  }

  // --- エージェント実行結果 ---

  recordAgentResult(result: AgentResult): void {
    this.db
      .prepare(
        `INSERT INTO agent_results (result_id, event_id, policy_name, agent_plugin, status, output, duration_ms, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        result.result_id,
        result.event_id,
        result.policy_name,
        result.agent_plugin,
        result.status,
        result.output,
        result.duration_ms,
        result.started_at,
        result.completed_at,
      );
  }

  getAgentResults(eventId: string): AgentResult[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_results WHERE event_id = ?`)
      .all(eventId) as AgentResultRow[];
    return rows.map(toAgentResult);
  }
}

// --- 行 → 型変換 ---

interface RunRow {
  run_id: string;
  job_name: string;
  status: string;
  scheduled_at: string;
  started_at: string;
  completed_at: string | null;
  judge_fired: number | null;
  judge_payload: string | null;
  error: string | null;
  attempt: number;
}

function toRunRecord(row: RunRow): RunRecord {
  return {
    run_id: row.run_id,
    job_name: row.job_name,
    status: row.status as RunStatus,
    scheduled_at: row.scheduled_at,
    started_at: row.started_at,
    completed_at: row.completed_at ?? undefined,
    judge_fired: row.judge_fired != null ? row.judge_fired === 1 : undefined,
    judge_payload: row.judge_payload
      ? (JSON.parse(row.judge_payload) as Record<string, unknown>)
      : undefined,
    error: row.error ?? undefined,
    attempt: row.attempt,
  };
}

interface AgentResultRow {
  result_id: string;
  event_id: string;
  policy_name: string;
  agent_plugin: string;
  status: string;
  output: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string;
}

function toAgentResult(row: AgentResultRow): AgentResult {
  return {
    result_id: row.result_id,
    event_id: row.event_id,
    policy_name: row.policy_name,
    agent_plugin: row.agent_plugin,
    status: row.status as AgentResult["status"],
    output: row.output ?? "",
    duration_ms: row.duration_ms ?? 0,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}
