import type { DatabaseSync } from "node:sqlite";

const MIGRATIONS: string[] = [
  // v1: 初期スキーマ
  `
  CREATE TABLE IF NOT EXISTS runs (
    run_id       TEXT PRIMARY KEY,
    job_name     TEXT NOT NULL,
    status       TEXT NOT NULL CHECK(status IN ('running','completed','failed','skipped','timeout')),
    scheduled_at TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    completed_at TEXT,
    judge_fired  INTEGER,
    judge_payload TEXT,
    error        TEXT,
    attempt      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_runs_job_name ON runs(job_name);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);

  CREATE TABLE IF NOT EXISTS events (
    event_id    TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    payload     TEXT,
    labels      TEXT,
    run_id      TEXT NOT NULL REFERENCES runs(run_id),
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

  CREATE TABLE IF NOT EXISTS agent_results (
    result_id    TEXT PRIMARY KEY,
    event_id     TEXT NOT NULL REFERENCES events(event_id),
    policy_name  TEXT NOT NULL,
    agent_plugin TEXT NOT NULL,
    status       TEXT NOT NULL CHECK(status IN ('success','failure','timeout')),
    output       TEXT,
    duration_ms  INTEGER,
    started_at   TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_results_event_id ON agent_results(event_id);

  CREATE TABLE IF NOT EXISTS fingerprints (
    fingerprint   TEXT PRIMARY KEY,
    last_fired_at TEXT NOT NULL,
    expires_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fingerprints_expires_at ON fingerprints(expires_at);

  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,

  // v2: agent_results に reason / outcome カラムを追加
  `
  ALTER TABLE agent_results ADD COLUMN reason TEXT;
  ALTER TABLE agent_results ADD COLUMN outcome TEXT;
  CREATE INDEX IF NOT EXISTS idx_agent_results_reason ON agent_results(reason);
  CREATE INDEX IF NOT EXISTS idx_agent_results_outcome ON agent_results(outcome);
  `,
];

export function runMigrations(db: DatabaseSync): void {
  // schema_version テーブルがなければ作成
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );

  const currentVersion =
    (db.prepare("SELECT MAX(version) as v FROM schema_version").get() as {
      v: number | null;
    })?.v ?? 0;

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
  }
}
