import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config/loader.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

function setup() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(join(TMP_DIR, "jobs"), { recursive: true });
  mkdirSync(join(TMP_DIR, "policies"), { recursive: true });
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

  it("policies_dir からポリシーを読み込める", () => {
    setup();
    try {
      writeFileSync(
        join(TMP_DIR, "evorch.config.yaml"),
        `
jobs_dir: "./jobs"
policies_dir: "./policies"
`,
      );
      writeFileSync(
        join(TMP_DIR, "policies", "on-alert.yaml"),
        `
match:
  type: "alert"
agent:
  plugin: "shell"
  config:
    command: "echo alert"
`,
      );

      const config = loadConfig(join(TMP_DIR, "evorch.config.yaml"));

      expect(config.policies).toHaveLength(1);
      expect(config.policies[0].name).toBe("on-alert");
      expect(config.policies[0].match.type).toBe("alert");
      expect(config.policies[0].agent.plugin).toBe("shell");
    } finally {
      cleanup();
    }
  });

  it("インラインポリシーとpolicies_dirをマージし、同名はディレクトリ優先", () => {
    setup();
    try {
      writeFileSync(
        join(TMP_DIR, "evorch.config.yaml"),
        `
jobs_dir: "./jobs"
policies_dir: "./policies"
policies:
  - name: "inline-only"
    match:
      type: "inline"
    agent:
      plugin: "shell"
      config: {}
  - name: "overridden"
    match:
      type: "inline-type"
    agent:
      plugin: "shell"
      config: {}
`,
      );
      writeFileSync(
        join(TMP_DIR, "policies", "overridden.yaml"),
        `
match:
  type: "dir-type"
agent:
  plugin: "shell"
  config: {}
`,
      );

      const config = loadConfig(join(TMP_DIR, "evorch.config.yaml"));

      expect(config.policies).toHaveLength(2);
      const overridden = config.policies.find((p) => p.name === "overridden");
      expect(overridden?.match.type).toBe("dir-type");
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
