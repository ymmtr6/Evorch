import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/store/migrations.js";
import { Repository } from "../src/store/repository.js";
import { EventBus } from "../src/core/event-bus.js";
import { reasonToOutcome } from "../src/core/types.js";
import type { AgentEndReason, EvOrchEvent, AgentResult } from "../src/core/types.js";
import type { PluginRuntime } from "../src/plugins/runtime.js";
import type { Logger } from "../src/logger.js";

// --- reasonToOutcome のテスト ---

describe("reasonToOutcome", () => {
  it("complete → ok", () => {
    expect(reasonToOutcome("complete")).toBe("ok");
  });

  it("error → error", () => {
    expect(reasonToOutcome("error")).toBe("error");
  });

  it("timeout → error", () => {
    expect(reasonToOutcome("timeout")).toBe("error");
  });

  it("killed → skipped", () => {
    expect(reasonToOutcome("killed")).toBe("skipped");
  });

  it("skipped → skipped", () => {
    expect(reasonToOutcome("skipped")).toBe("skipped");
  });

  it("dedup → skipped", () => {
    expect(reasonToOutcome("dedup")).toBe("skipped");
  });
});

// --- AgentResult の reason/outcome 保存テスト ---

describe("Repository: AgentResult reason/outcome", () => {
  let db: Database.Database;
  let repo: Repository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);

    repo.recordRunStart({
      run_id: "run-001", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T00:00:00Z", started_at: "2026-04-04T00:00:00Z", attempt: 1,
    });
    repo.recordEvent({
      event_id: "evt-001", source: "j", type: "t", severity: "low",
      fingerprint: "fp", payload: {}, labels: {},
      created_at: "2026-04-04T00:00:00Z", run_id: "run-001",
    });
  });

  afterEach(() => {
    db.close();
  });

  const reasons: AgentEndReason[] = ["complete", "error", "timeout", "killed", "skipped", "dedup"];

  for (const reason of reasons) {
    it(`reason="${reason}" を保存・取得できる`, () => {
      const result: AgentResult = {
        result_id: `res-${reason}`,
        event_id: "evt-001",
        policy_name: "p",
        agent_plugin: "shell",
        reason,
        outcome: reasonToOutcome(reason),
        output: "",
        duration_ms: 10,
        started_at: "2026-04-04T00:00:00Z",
        completed_at: "2026-04-04T00:00:01Z",
      };
      repo.recordAgentResult(result);

      const fetched = repo.getAgentResultById(`res-${reason}`);
      expect(fetched?.reason).toBe(reason);
      expect(fetched?.outcome).toBe(reasonToOutcome(reason));
    });
  }
});

// --- EventBus の dispatchDepth テスト ---

function makeEvent(id: string): EvOrchEvent {
  return {
    event_id: id,
    source: "test",
    type: "test_event",
    severity: "low",
    fingerprint: id,
    payload: {},
    labels: {},
    created_at: new Date().toISOString(),
    run_id: "run-001",
  };
}

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe("EventBus: dispatchDepth", () => {
  let db: Database.Database;
  let repo: Repository;
  let logger: Logger;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);
    logger = makeLogger();

    repo.recordRunStart({
      run_id: "run-001", job_name: "j", status: "running",
      scheduled_at: "2026-04-04T00:00:00Z", started_at: "2026-04-04T00:00:00Z", attempt: 1,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("ポリシーなしでイベントを処理できる", async () => {
    const bus = new EventBus([], {} as PluginRuntime, repo, logger);
    await bus.emit(makeEvent("evt-001"));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("maxDispatchDepth=0 では即座に破棄する", async () => {
    const bus = new EventBus([], {} as PluginRuntime, repo, logger, { maxDispatchDepth: 0 });
    await bus.emit(makeEvent("evt-002"));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 0 }),
      "再帰深度上限によりイベント破棄",
    );
  });

  it("エージェントが再帰的にイベントを発行しても上限で停止する", async () => {
    let emitCount = 0;
    const maxDepth = 3;

    // 再帰的に emit を呼ぶエージェントをシミュレート
    let busRef: EventBus;
    const pluginRuntime = {
      runAgent: vi.fn().mockImplementation(async () => {
        emitCount++;
        // 再帰的にイベントを発行
        await busRef.emit(makeEvent(`evt-recursive-${emitCount}`));
        return { result_id: "", output: "", reason: "complete" };
      }),
    } as unknown as PluginRuntime;

    busRef = new EventBus(
      [{ name: "recursive-policy", match: { type: "test_event" }, agent: { plugin: "test", config: {} } }],
      pluginRuntime,
      repo,
      logger,
      { maxDispatchDepth: maxDepth },
    );

    await busRef.emit(makeEvent("evt-root"));

    // 深度上限に達した後、warn が呼ばれること
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ depth: maxDepth }),
      "再帰深度上限によりイベント破棄",
    );
    // 無限ループにならず emitCount が maxDepth 以下であること
    expect(emitCount).toBeLessThanOrEqual(maxDepth);
  });

  it("maxDispatchDepth をカスタム値で設定できる", async () => {
    const bus = new EventBus([], {} as PluginRuntime, repo, logger, { maxDispatchDepth: 5 });
    // 正常系では warn なし
    await bus.emit(makeEvent("evt-003"));
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
