import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/store/migrations.js";
import { Repository } from "../src/store/repository.js";
import type { RunRecord, EvOrchEvent, AgentResult } from "../src/core/types.js";

let db: Database.Database;
let repo: Repository;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  repo = new Repository(db);
});

afterEach(() => {
  db.close();
});

describe("Repository", () => {
  it("実行記録の作成と完了を記録できる", () => {
    const run: RunRecord = {
      run_id: "run-001",
      job_name: "test-job",
      status: "running",
      scheduled_at: "2026-04-04T00:00:00Z",
      started_at: "2026-04-04T00:00:01Z",
      attempt: 1,
    };
    repo.recordRunStart(run);

    repo.recordRunComplete("run-001", "completed", true, { key: "value" });

    const history = repo.getRunHistory("test-job");
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("completed");
    expect(history[0].judge_fired).toBe(true);
    expect(history[0].judge_payload).toEqual({ key: "value" });
  });

  it("getLastRun で最新の実行記録を取得できる", () => {
    repo.recordRunStart({
      run_id: "run-001", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T00:00:00Z", started_at: "2026-04-04T00:00:00Z", attempt: 1,
    });
    repo.recordRunStart({
      run_id: "run-002", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T01:00:00Z", started_at: "2026-04-04T01:00:00Z", attempt: 1,
    });

    const last = repo.getLastRun("j");
    expect(last?.run_id).toBe("run-002");
  });

  it("イベントを記録できる", () => {
    repo.recordRunStart({
      run_id: "run-001", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T00:00:00Z", started_at: "2026-04-04T00:00:00Z", attempt: 1,
    });

    const event: EvOrchEvent = {
      event_id: "evt-001",
      source: "j",
      type: "test_event",
      severity: "medium",
      fingerprint: "fp-001",
      payload: { data: 1 },
      labels: { env: "test" },
      created_at: "2026-04-04T00:00:00Z",
      run_id: "run-001",
    };
    repo.recordEvent(event);
  });

  it("fingerprint による重複抑止が動作する", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    repo.recordFingerprint("fp-test", future);

    expect(repo.checkFingerprint("fp-test")).toBe(true);
    expect(repo.checkFingerprint("fp-other")).toBe(false);
  });

  it("期限切れの fingerprint は抑止しない", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    repo.recordFingerprint("fp-expired", past);

    expect(repo.checkFingerprint("fp-expired")).toBe(false);
  });

  it("agent 結果を記録・取得できる", () => {
    repo.recordRunStart({
      run_id: "run-001", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T00:00:00Z", started_at: "2026-04-04T00:00:00Z", attempt: 1,
    });
    repo.recordEvent({
      event_id: "evt-001", source: "j", type: "t", severity: "low",
      fingerprint: "fp", payload: {}, labels: {},
      created_at: "2026-04-04T00:00:00Z", run_id: "run-001",
    });

    const result: AgentResult = {
      result_id: "res-001",
      event_id: "evt-001",
      policy_name: "p",
      agent_plugin: "claude-code",
      status: "success",
      output: "test output",
      duration_ms: 100,
      started_at: "2026-04-04T00:00:00Z",
      completed_at: "2026-04-04T00:00:01Z",
    };
    repo.recordAgentResult(result);

    const results = repo.getAgentResults("evt-001");
    expect(results).toHaveLength(1);
    expect(results[0].output).toBe("test output");
  });
});
