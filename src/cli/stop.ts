import { existsSync, readFileSync, unlinkSync } from "node:fs";
import type { Command } from "commander";
import { DEFAULT_PID_PATH } from "./index.js";

const FORCE_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 500;

export function readPidFile(pidPath: string): number | null {
  if (!existsSync(pidPath)) return null;
  const content = readFileSync(pidPath, "utf-8").trim();
  const pid = parseInt(content, 10);
  return isNaN(pid) ? null : pid;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

export function removePidFile(pidPath: string): void {
  try {
    unlinkSync(pidPath);
  } catch {
    // 既に削除されている場合は無視
  }
}

export function registerStop(program: Command): void {
  program
    .command("stop")
    .description("バックグラウンドで動作中の evorch run を停止")
    .option("--force", "SIGTERM タイムアウト後に SIGKILL を送信")
    .action((opts) => {
      const pid = readPidFile(DEFAULT_PID_PATH);

      if (pid === null) {
        if (!existsSync(DEFAULT_PID_PATH)) {
          console.log("evorch は起動していません");
          process.exit(0);
        }
        console.error("PID ファイルが破損しています");
        removePidFile(DEFAULT_PID_PATH);
        process.exit(1);
      }

      // プロセス生存確認
      let running: boolean;
      try {
        process.kill(pid, 0);
        running = true;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ESRCH") {
          removePidFile(DEFAULT_PID_PATH);
          console.log(`プロセスが見つかりません。stale な PID ファイルを削除しました (PID: ${pid})`);
          process.exit(0);
        }
        if (code === "EPERM") {
          console.error(`権限がありません。sudo を試してください (PID: ${pid})`);
          process.exit(1);
        }
        running = false;
      }

      if (!running) {
        removePidFile(DEFAULT_PID_PATH);
        console.log("evorch は起動していません");
        process.exit(0);
      }

      // SIGTERM 送信
      process.kill(pid, "SIGTERM");
      console.log(`停止シグナルを送信しました (PID: ${pid})`);

      if (!opts.force) {
        process.exit(0);
      }

      // --force: タイムアウト付きでポーリングして SIGKILL
      const deadline = Date.now() + FORCE_TIMEOUT_MS;
      const timer = setInterval(() => {
        if (!isProcessRunning(pid)) {
          clearInterval(timer);
          console.log("evorch を停止しました");
          process.exit(0);
        }
        if (Date.now() >= deadline) {
          clearInterval(timer);
          process.kill(pid, "SIGKILL");
          removePidFile(DEFAULT_PID_PATH);
          console.log(`タイムアウト: SIGKILL を送信しました (PID: ${pid})`);
          process.exit(0);
        }
      }, POLL_INTERVAL_MS);
    });
}
