import { describe, it, expect } from "vitest";
import { NotifyAgent } from "../../src/plugins/agents/notify.js";
import type { EvOrchEvent } from "../../src/core/types.js";

const agent = new NotifyAgent();

const createEvent = (payload: Record<string, unknown>): EvOrchEvent => ({
  event_id: "test-event-001",
  source: "test-job",
  type: "test_event",
  severity: "high",
  fingerprint: "test:001",
  payload,
  labels: {},
  created_at: new Date().toISOString(),
  run_id: "run-001",
});

describe("NotifyAgent", () => {
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

  it("テンプレート変数 {{severity}} を展開する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Severity: {{severity}}", event);
    expect(result).toBe("Severity: high");
  });

  it("テンプレート変数 {{payload.key}} を展開する", () => {
    const event = createEvent({ message: "hello world" });
    // @ts-expect-error - private method test
    const result = agent.expandTemplate("Msg: {{payload.message}}", event);
    expect(result).toBe("Msg: hello world");
  });

  it("AppleScript のダブルクォートをエスケープする", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const script = agent.buildScript('He said "hi"', "normal message");
    expect(script).toContain('\\"hi\\"');
  });

  it("subtitle を含む AppleScript を生成する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const script = agent.buildScript("Title", "Message", "Sub");
    expect(script).toContain('subtitle "Sub"');
  });

  it("sound を含む AppleScript を生成する", () => {
    const event = createEvent({});
    // @ts-expect-error - private method test
    const script = agent.buildScript("Title", "Message", undefined, "Basso");
    expect(script).toContain('sound name "Basso"');
  });

  it("osascript が存在しない環境では failure を返す", async () => {
    // osascript が存在しない場合 (Linux CI 等) でも failure で返ること
    const event = createEvent({});
    const result = await agent.run(
      { title: "Test", message: "Hello" },
      event,
    );

    // macOS では complete、それ以外では error
    expect(["complete", "error"]).toContain(result.reason);
    expect(result.agent_plugin).toBe("notify");
  });
});
