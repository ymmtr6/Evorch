import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebhookServer } from "../src/core/webhook-server.js";
import type { Config, JobConfig } from "../src/config/schema.js";
import type { Executor } from "../src/core/executor.js";
import type { Logger } from "../src/logger.js";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

// モックロガー
const mockLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// モック Executor
const mockExecutor = {
  execute: async (_jobName: string) => {},
} as unknown as Executor;

describe("WebhookServer", () => {
  const webhookJob: JobConfig = {
    schedule: undefined,
    trigger: {
      type: "webhook",
      path: "/trigger/test",
      secret: "test-secret",
    },
    judge: {
      plugin: "shell",
      config: { command: "echo test" },
    },
    event: {
      type: "test_event",
      severity: "medium",
      labels: {},
    },
  };

  const config: Config = {
    store: { path: "test.db" },
    log: { level: "info" },
    jobs_dir: "./jobs",
    jobs: {
      "webhook-job": webhookJob,
    },
    policies: [],
    execution: {
      max_concurrent: 3,
      default_timeout: 120,
      retry: {
        max_attempts: 2,
        backoff: "exponential",
        initial_delay: 10,
      },
    },
  };

  it("Webhook トリガーを持つジョブを登録する", () => {
    const server = new WebhookServer(config, mockExecutor, mockLogger);
    expect(server.registeredPaths).toContain("/trigger/test");
  });

  it("スケジュールのみのジョブは登録しない", () => {
    const scheduleConfig: Config = {
      ...config,
      jobs: {
        "schedule-job": {
          schedule: "0 9 * * *",
          judge: { plugin: "shell", config: { command: "echo test" } },
          event: { type: "test", severity: "medium", labels: {} },
        },
      },
    };
    const server = new WebhookServer(scheduleConfig, mockExecutor, mockLogger);
    expect(server.registeredPaths).toHaveLength(0);
  });
});
