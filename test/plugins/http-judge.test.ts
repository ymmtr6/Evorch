import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HttpJudge } from "../../src/plugins/judges/http.js";
import type { JudgeContext } from "../../src/plugins/protocol.js";

const judge = new HttpJudge();
const context: JudgeContext = { jobName: "test", runId: "test-run" };

// テスト用 HTTP サーバー
let server: ReturnType<typeof Bun.serve> | null = null;
const TEST_PORT = 18999;

describe("HttpJudge", () => {
  beforeAll(async () => {
    // 簡易的なモックサーバーを起動
    // Vitest で fetch をモックする代わりに、実際の外部APIを使用
  });

  afterAll(() => {
    if (server) {
      server.stop();
    }
  });

  it("GET リクエストが成功する", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/get",
        method: "GET",
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.payload).toBeDefined();
    expect(result.duration_ms).toBeGreaterThan(0);
  });

  it("POST リクエストが成功する", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/post",
        method: "POST",
        body: { test: "data" },
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(true);
    expect(result.payload).toBeDefined();
  });

  it("カスタムヘッダーを送信できる", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/headers",
        method: "GET",
        headers: {
          "X-Custom-Header": "test-value",
        },
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(true);
    expect(JSON.stringify(result.payload)).toContain("X-Custom-Header");
  });

  it("404 レスポンスは fired=false になる", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/status/404",
        method: "GET",
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(false);
    expect(result.exit_code).toBe(1);
  });

  it("fired_condition で条件判定ができる", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/json",
        method: "GET",
        fired_condition: "payload.slideshow.author == 'Yours Truly'",
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(true);
  });

  it("fired_condition で条件が一致しない場合は fired=false", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/json",
        method: "GET",
        fired_condition: "payload.slideshow.author == 'Unknown'",
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(false);
  });

  it("タイムアウトが機能する", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/delay/5",
        method: "GET",
        timeout: 1, // 1秒でタイムアウト
      },
      context,
    );

    expect(result.fired).toBe(false);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toBeDefined();
  });

  it("JSONPath形式の条件をサポートする", async () => {
    const result = await judge.run(
      {
        url: "https://httpbin.org/json",
        method: "GET",
        fired_condition: "$.slideshow.author == 'Yours Truly'",
        timeout: 10,
      },
      context,
    );

    expect(result.fired).toBe(true);
  });

  it("不正なURLでエラーを返す", async () => {
    const result = await judge.run(
      {
        url: "not-a-valid-url",
        method: "GET",
        timeout: 5,
      },
      context,
    );

    expect(result.fired).toBe(false);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toBeDefined();
  });
});
