import { describe, it, expect } from "vitest";
import { matchEvent } from "../src/core/policy.js";
import type { EvOrchEvent } from "../src/core/types.js";

const baseEvent: EvOrchEvent = {
  event_id: "test:src:2026-04-04T00:00:00Z",
  source: "src",
  type: "threshold_exceeded",
  severity: "high",
  fingerprint: "fp",
  payload: {},
  labels: { env: "prod", team: "platform" },
  created_at: "2026-04-04T00:00:00Z",
  run_id: "run-001",
};

describe("matchEvent", () => {
  it("type が一致する場合は true", () => {
    expect(matchEvent(baseEvent, { type: "threshold_exceeded" })).toBe(true);
  });

  it("type が不一致の場合は false", () => {
    expect(matchEvent(baseEvent, { type: "other" })).toBe(false);
  });

  it("severity 単一指定でマッチ", () => {
    expect(matchEvent(baseEvent, { severity: "high" })).toBe(true);
    expect(matchEvent(baseEvent, { severity: "low" })).toBe(false);
  });

  it("severity 配列指定でOR条件マッチ", () => {
    expect(matchEvent(baseEvent, { severity: ["high", "critical"] })).toBe(true);
    expect(matchEvent(baseEvent, { severity: ["low", "medium"] })).toBe(false);
  });

  it("labels の AND マッチ", () => {
    expect(matchEvent(baseEvent, { labels: { env: "prod" } })).toBe(true);
    expect(matchEvent(baseEvent, { labels: { env: "prod", team: "platform" } })).toBe(true);
    expect(matchEvent(baseEvent, { labels: { env: "staging" } })).toBe(false);
  });

  it("条件なしは全マッチ", () => {
    expect(matchEvent(baseEvent, {})).toBe(true);
  });

  it("複合条件", () => {
    expect(
      matchEvent(baseEvent, {
        type: "threshold_exceeded",
        severity: ["high", "critical"],
        labels: { env: "prod" },
      }),
    ).toBe(true);

    expect(
      matchEvent(baseEvent, {
        type: "threshold_exceeded",
        severity: ["low"],
        labels: { env: "prod" },
      }),
    ).toBe(false);
  });
});
