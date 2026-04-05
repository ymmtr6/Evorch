import { describe, it, expect } from "vitest";
import { CodexAgent } from "../../src/plugins/agents/codex.js";
import type { EvOrchEvent } from "../../src/core/types.js";

const agent = new CodexAgent();

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

describe("CodexAgent", () => {
  it("テンプレート変数 {{event_type}} を展開する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Type: {{event_type}}", event);
    expect(result).toBe("Type: test_event");
  });

  it("テンプレート変数 {{source}} を展開する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Source: {{source}}", event);
    expect(result).toBe("Source: test-job");
  });

  it("テンプレート変数 {{event_id}} を展開する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("ID: {{event_id}}", event);
    expect(result).toBe("ID: test-event-001");
  });

  it("テンプレート変数 {{payload}} を展開する", () => {
    const event = createEvent({ count: 3, name: "test" });
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Data: {{payload}}", event);
    expect(result).toContain('"count": 3');
    expect(result).toContain('"name": "test"');
  });

  it("テンプレート変数 {{payload.key}} を展開する", () => {
    const event = createEvent({ message: "hello world" });
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Msg: {{payload.message}}", event);
    expect(result).toBe("Msg: hello world");
  });

  it("codex コマンドが存在しない場合は failure を返す", async () => {
    const event = createEvent({ message: "hello" });
    const result = await agent.run(
      { prompt_template: "test", timeout: 5 },
      event,
    );

    expect(result.reason).toBe("error");
    expect(result.agent_plugin).toBe("codex");
  });
});
