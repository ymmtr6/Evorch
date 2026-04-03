import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config/loader.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

function setup() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(join(TMP_DIR, "jobs"), { recursive: true });
}

function cleanup() {
  rmSync(TMP_DIR, { recursive: true, force: true });
}

describe("config loader", () => {
  it("メイン設定 + jobs_dir から統合設定を読み込める", () => {
    setup();
    try {
      writeFileSync(
        join(TMP_DIR, "evorch.config.yaml"),
        `
jobs_dir: "./jobs"
policies:
  - name: "test-policy"
    match:
      type: "test_event"
    agent:
      plugin: "claude-code"
      config:
        prompt_template: "{{payload}}"
`,
      );
      writeFileSync(
        join(TMP_DIR, "jobs", "my-job.yaml"),
        `
schedule: "*/5 * * * *"
judge:
  plugin: "shell"
  config:
    command: "echo ok"
event:
  type: "test_event"
  severity: "low"
`,
      );

      const config = loadConfig(join(TMP_DIR, "evorch.config.yaml"));

      expect(config.jobs["my-job"]).toBeDefined();
      expect(config.jobs["my-job"].schedule).toBe("*/5 * * * *");
      expect(config.jobs["my-job"].judge.plugin).toBe("shell");
      expect(config.policies).toHaveLength(1);
      expect(config.policies[0].name).toBe("test-policy");
    } finally {
      cleanup();
    }
  });

  it("jobs_dir が存在しない場合はインラインジョブのみ使用", () => {
    setup();
    try {
      writeFileSync(
        join(TMP_DIR, "evorch.config.yaml"),
        `
jobs_dir: "./nonexistent"
jobs:
  inline-job:
    schedule: "0 * * * *"
    judge:
      plugin: "shell"
      config:
        command: "echo 1"
    event:
      type: "test"
`,
      );

      const config = loadConfig(join(TMP_DIR, "evorch.config.yaml"));
      expect(config.jobs["inline-job"]).toBeDefined();
      expect(Object.keys(config.jobs)).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("不正な設定でエラーになる", () => {
    setup();
    try {
      writeFileSync(join(TMP_DIR, "evorch.config.yaml"), `jobs_dir: 123`);
      expect(() => loadConfig(join(TMP_DIR, "evorch.config.yaml"))).toThrow();
    } finally {
      cleanup();
    }
  });
});
