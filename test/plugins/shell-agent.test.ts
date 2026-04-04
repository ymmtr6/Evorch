import { describe, it, expect } from "vitest";
import { ShellAgent } from "../../src/plugins/agents/shell.js";
import type { EvOrchEvent } from "../../src/core/types.js";

const agent = new ShellAgent();

const createEvent = (payload: Record<string, unknown>): EvOrchEvent => ({
  event_id: "test-event-001",
  source: "test-job",
  type: "test_event",
  severity: "medium",
  fingerprint: "test:001",
  payload,
  labels: {},
  created_at: new Date().toISOString(),
  run_id: "run-001",
});

describe("ShellAgent", () => {
  it("コマンドを実行して success を返す", async () => {
    const event = createEvent({ message: "hello" });
    const result = await agent.run(
      { command: "echo ok" },
      event,
    );

    expect(result.status).toBe("success");
    expect(result.agent_plugin).toBe("shell");
    expect(result.output.trim()).toBe("ok");
  });

  it("終了コード 0 以外は failure を返す", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "exit 1" },
      event,
    );

    expect(result.status).toBe("failure");
  });

  it("テンプレート変数 {{event_type}} を展開する", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "echo {{event_type}}" },
      event,
    );

    expect(result.status).toBe("success");
    expect(result.output.trim()).toBe("test_event");
  });

  it("テンプレート変数 {{source}} を展開する", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "echo {{source}}" },
      event,
    );

    expect(result.status).toBe("success");
    expect(result.output.trim()).toBe("test-job");
  });

  it("テンプレート変数 {{event_id}} を展開する", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "echo {{event_id}}" },
      event,
    );

    expect(result.status).toBe("success");
    expect(result.output.trim()).toBe("test-event-001");
  });

  it("テンプレート変数 {{payload}} を展開する", async () => {
    const event = createEvent({ count: 3, name: "test" });
    const result = await agent.run(
      { command: "echo '{{payload}}'" },
      event,
    );

    expect(result.status).toBe("success");
    expect(JSON.parse(result.output.trim())).toEqual({ count: 3, name: "test" });
  });

  it("テンプレート変数 {{payload.key}} を展開する", async () => {
    const event = createEvent({ message: "hello world" });
    const result = await agent.run(
      { command: "echo '{{payload.message}}'" },
      event,
    );

    expect(result.status).toBe("success");
    expect(result.output.trim()).toBe("hello world");
  });

  it("timeout 時間を超えると timeout ステータスを返す", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "sleep 2", timeout: 0.1 }, // 100ms timeout
      event,
    );

    expect(result.status).toBe("timeout");
  });

  it("workdir を指定して実行できる", async () => {
    const event = createEvent({});
    const result = await agent.run(
      { command: "pwd", workdir: "/tmp" },
      event,
    );

    expect(result.status).toBe("success");
    // macOS では /tmp は /private/tmp へのシンボリックリンク
    expect(result.output.trim()).toMatch(/\/tmp$/);
  });
});
