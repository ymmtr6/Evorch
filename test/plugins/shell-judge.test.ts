import { describe, it, expect } from "vitest";
import { ShellJudge } from "../../src/plugins/judges/shell.js";

const judge = new ShellJudge();
const ctx = { jobName: "test", runId: "run-001" };

describe("ShellJudge", () => {
  it("終了コード 0 で fired: true", async () => {
    const result = await judge.run({ command: "echo ok", timeout: 5 }, ctx);
    expect(result.fired).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.payload).toEqual({ raw: "ok" });
  });

  it("終了コード 1 で fired: false", async () => {
    const result = await judge.run({ command: "exit 1", timeout: 5 }, ctx);
    expect(result.fired).toBe(false);
    expect(result.exit_code).toBe(1);
  });

  it("stdout が JSON の場合はパースされる", async () => {
    const result = await judge.run(
      { command: 'echo \'{"count": 3, "items": ["a","b","c"]}\'', timeout: 5 },
      ctx,
    );
    expect(result.fired).toBe(true);
    expect(result.payload).toEqual({ count: 3, items: ["a", "b", "c"] });
  });

  it("stdout が JSON配列の場合は items/count に変換", async () => {
    const result = await judge.run(
      { command: 'echo \'[{"id":1},{"id":2}]\'', timeout: 5 },
      ctx,
    );
    expect(result.fired).toBe(true);
    expect(result.payload).toEqual({ items: [{ id: 1 }, { id: 2 }], count: 2 });
  });

  it("空のJSON配列は fired: false", async () => {
    const result = await judge.run(
      { command: "echo '[]'", timeout: 5 },
      ctx,
    );
    expect(result.fired).toBe(false);
    expect(result.payload).toEqual({ items: [], count: 0 });
  });
});
