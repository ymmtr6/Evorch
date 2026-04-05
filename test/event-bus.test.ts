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

const eventWithPayload: EvOrchEvent = {
  ...baseEvent,
  payload: {
    error_count: 15,
    message: "Deployment failed",
    details: {
      retry_count: 3,
    },
  },
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

  describe("condition 条件式", () => {
    it("payload フィールドの比較ができる", () => {
      expect(
        matchEvent(eventWithPayload, { condition: "payload.error_count > 10" }),
      ).toBe(true);

      expect(
        matchEvent(eventWithPayload, { condition: "payload.error_count > 20" }),
      ).toBe(false);
    });

    it("payload フィールドの等価比較ができる", () => {
      expect(
        matchEvent(eventWithPayload, { condition: "payload.message == 'Deployment failed'" }),
      ).toBe(true);

      expect(
        matchEvent(eventWithPayload, { condition: "payload.message == 'Success'" }),
      ).toBe(false);
    });

    it("ネストした payload フィールドにアクセスできる", () => {
      expect(
        matchEvent(eventWithPayload, { condition: "payload.details.retry_count == 3" }),
      ).toBe(true);
    });

    it("labels との複合条件ができる", () => {
      expect(
        matchEvent(eventWithPayload, {
          condition: "payload.error_count > 10 && labels.env == 'prod'",
        }),
      ).toBe(true);

      expect(
        matchEvent(eventWithPayload, {
          condition: "payload.error_count > 10 && labels.env == 'staging'",
        }),
      ).toBe(false);
    });

    it("OR 条件ができる", () => {
      expect(
        matchEvent(eventWithPayload, {
          condition: "payload.error_count < 5 || payload.error_count > 10",
        }),
      ).toBe(true);

      expect(
        matchEvent(eventWithPayload, {
          condition: "payload.error_count < 5 || payload.error_count < 10",
        }),
      ).toBe(false);
    });

    it("type と condition の組み合わせ", () => {
      expect(
        matchEvent(eventWithPayload, {
          type: "threshold_exceeded",
          condition: "payload.error_count > 10",
        }),
      ).toBe(true);
    });

    it("安全でない条件式は評価されない", () => {
      // eval や Function などの危険なコードは評価されない
      expect(
        matchEvent(eventWithPayload, { condition: "eval('1+1')" }),
      ).toBe(false);
    });
  });
});
