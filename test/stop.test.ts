import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPidFile, isProcessRunning, removePidFile } from "../src/cli/stop.js";

const TEST_DIR = join(tmpdir(), "evorch-stop-test-" + Date.now());
const TEST_PID_PATH = join(TEST_DIR, "evorch.pid");

describe("stop コマンド ヘルパー関数", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("readPidFile", () => {
    it("PID ファイルが存在しない場合は null を返す", () => {
      expect(readPidFile(TEST_PID_PATH)).toBeNull();
    });

    it("有効な PID ファイルから数値を返す", () => {
      writeFileSync(TEST_PID_PATH, "12345", "utf-8");
      expect(readPidFile(TEST_PID_PATH)).toBe(12345);
    });

    it("前後の空白を無視して数値を返す", () => {
      writeFileSync(TEST_PID_PATH, "  12345\n", "utf-8");
      expect(readPidFile(TEST_PID_PATH)).toBe(12345);
    });

    it("数値以外の内容の場合は null を返す", () => {
      writeFileSync(TEST_PID_PATH, "not-a-number", "utf-8");
      expect(readPidFile(TEST_PID_PATH)).toBeNull();
    });

    it("空ファイルの場合は null を返す", () => {
      writeFileSync(TEST_PID_PATH, "", "utf-8");
      expect(readPidFile(TEST_PID_PATH)).toBeNull();
    });
  });

  describe("isProcessRunning", () => {
    it("自プロセスは生存している", () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it("存在しない PID は false を返す", () => {
      expect(isProcessRunning(999999999)).toBe(false);
    });
  });

  describe("removePidFile", () => {
    it("存在するファイルを削除する", () => {
      writeFileSync(TEST_PID_PATH, "12345", "utf-8");
      expect(existsSync(TEST_PID_PATH)).toBe(true);
      removePidFile(TEST_PID_PATH);
      expect(existsSync(TEST_PID_PATH)).toBe(false);
    });

    it("存在しないファイルを削除しても例外を投げない", () => {
      expect(() => removePidFile(TEST_PID_PATH)).not.toThrow();
    });
  });
});
