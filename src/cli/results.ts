import type { Command } from "commander";
import { loadConfig } from "../config/loader.js";
import { openDatabase } from "../store/database.js";
import { Repository } from "../store/repository.js";
import type { AgentResult } from "../core/types.js";

const ULID_RE = /^[0-9A-Z]{26}$/;

export function registerResults(program: Command): void {
  program
    .command("results [policy-or-id]")
    .description("エージェント実行結果を表示。RESULT ID を指定すると1件詳細表示")
    .option("-n, --limit <number>", "表示件数（一覧時）", "20")
    .option("--output", "出力テキストも表示（一覧時）")
    .option("--json", "JSON形式で出力")
    .action(async (arg, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const config = loadConfig(globalOpts.config);
      const db = openDatabase(config.store.path);
      const store = new Repository(db);

      if (arg && ULID_RE.test(arg)) {
        // 1件詳細表示
        const result = store.getAgentResultById(arg);
        if (!result) {
          console.error(`結果が見つかりません: ${arg}`);
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printDetail(result);
        }
      } else {
        // 一覧表示
        const limit = parseInt(opts.limit, 10);
        const results = store.getRecentAgentResults(arg, limit);

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          printList(results, opts.output as boolean);
        }
      }

      db.close();
    });
}

function printList(results: AgentResult[], showOutput: boolean): void {
  console.log(
    padEnd("RESULT ID", 28) +
      padEnd("POLICY", 24) +
      padEnd("PLUGIN", 16) +
      padEnd("STATUS", 10) +
      padEnd("DURATION", 10) +
      "STARTED",
  );
  console.log("-".repeat(106));
  for (const r of results) {
    console.log(
      padEnd(r.result_id, 28) +
        padEnd(r.policy_name, 24) +
        padEnd(r.agent_plugin, 16) +
        padEnd(r.status, 10) +
        padEnd(`${r.duration_ms}ms`, 10) +
        formatTime(r.started_at),
    );
    if (showOutput && r.output) {
      console.log();
      console.log(indent(r.output, "  "));
      console.log();
    }
  }
}

function printDetail(r: AgentResult): void {
  console.log(`Result ID  : ${r.result_id}`);
  console.log(`Event ID   : ${r.event_id}`);
  console.log(`Policy     : ${r.policy_name}`);
  console.log(`Plugin     : ${r.agent_plugin}`);
  console.log(`Status     : ${r.status}`);
  console.log(`Duration   : ${r.duration_ms}ms`);
  console.log(`Started    : ${formatTime(r.started_at)}`);
  console.log(`Completed  : ${formatTime(r.completed_at)}`);
  if (r.output) {
    console.log();
    console.log("--- Output ---");
    console.log(r.output);
  }
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
