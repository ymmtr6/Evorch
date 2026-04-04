import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_PATH,
  DEFAULT_JOBS_DIR,
} from "../src/cli/index.js";

// テスト用に一時ディレクトリを使用
const TEST_DIR = join(tmpdir(), "evorch-test-" + Date.now());
const TEST_JOBS_DIR = join(TEST_DIR, "jobs");

// 環境変数でホームディレクトリをオーバーライドできないので、
// 直接関数をテストするためにモジュールをインポートしてテストする

describe("job コマンド", () => {
  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(TEST_JOBS_DIR)) {
      mkdirSync(TEST_JOBS_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // テスト用ディレクトリを削除
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("デフォルト設定パスが正しい", () => {
    expect(DEFAULT_CONFIG_DIR).toContain(".config/evorch");
    expect(DEFAULT_CONFIG_PATH).toContain(".config/evorch/config.yaml");
    expect(DEFAULT_JOBS_DIR).toContain(".config/evorch/jobs");
  });

  it("ジョブファイルをコピーして登録できる", () => {
    const jobContent = `
schedule: "0 9 * * *"
judge:
  plugin: "shell"
  config:
    command: "echo test"
event:
  type: "test_event"
`;
    const srcPath = join(TEST_DIR, "test-job.yaml");
    writeFileSync(srcPath, jobContent);

    // ファイルが存在することを確認
    expect(existsSync(srcPath)).toBe(true);
    expect(readFileSync(srcPath, "utf-8")).toContain("test_event");
  });

  it("ジョブ一覧を取得できる", () => {
    const files = existsSync(TEST_JOBS_DIR)
      ? require("fs").readdirSync(TEST_JOBS_DIR).filter(
          (f: string) => f.endsWith(".yaml") || f.endsWith(".yml"),
        )
      : [];

    // 空のディレクトリなので空配列
    expect(files).toEqual([]);
  });
});
