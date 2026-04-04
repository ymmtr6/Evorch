import type { JudgePlugin, JudgeContext } from "../protocol.js";
import type { JudgeResult } from "../../core/types.js";

interface HttpJudgeConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  timeout?: number;
  fired_condition?: string;
}

/**
 * HTTP Judge プラグイン
 * HTTP リクエストを実行し、レスポンスを条件判定に使用する
 */
export class HttpJudge implements JudgePlugin {
  async run(
    config: Record<string, unknown>,
    _context: JudgeContext,
  ): Promise<JudgeResult> {
    const httpConfig = this.parseConfig(config);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = httpConfig.timeout ?? 30;
      const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

      const fetchOptions: RequestInit = {
        method: httpConfig.method ?? "GET",
        headers: httpConfig.headers,
        signal: controller.signal,
      };

      if (httpConfig.body && httpConfig.method !== "GET") {
        fetchOptions.body =
          typeof httpConfig.body === "string"
            ? httpConfig.body
            : JSON.stringify(httpConfig.body);
      }

      const response = await fetch(httpConfig.url, fetchOptions);
      clearTimeout(timeoutId);

      const duration_ms = Date.now() - startTime;
      const responseText = await response.text();

      let payload: Record<string, unknown>;
      try {
        const parsed = JSON.parse(responseText);
        payload = Array.isArray(parsed)
          ? { items: parsed, count: parsed.length, status: response.status }
          : { ...parsed, status: response.status };
      } catch {
        payload = {
          raw: responseText,
          status: response.status,
        };
      }

      // fired_condition が指定されている場合は条件評価
      let fired = response.ok;
      if (httpConfig.fired_condition) {
        fired = this.evaluateCondition(httpConfig.fired_condition, payload);
      }

      return {
        fired,
        payload,
        exit_code: response.ok ? 0 : 1,
        duration_ms,
        stderr: response.ok ? undefined : `HTTP ${response.status}: ${responseText}`,
      };
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        fired: false,
        payload: { error: errorMessage },
        exit_code: 1,
        duration_ms,
        stderr: errorMessage,
      };
    }
  }

  private parseConfig(config: Record<string, unknown>): HttpJudgeConfig {
    return {
      url: config.url as string,
      method: config.method as HttpJudgeConfig["method"],
      headers: config.headers as Record<string, string>,
      body: config.body as string | Record<string, unknown>,
      timeout: config.timeout as number,
      fired_condition: config.fired_condition as string,
    };
  }

  /**
   * 条件式を評価する
   * サポート形式:
   * - JSONPath形式: $.field.subfield == 'value'
   * - 簡易形式: payload.field > 10
   */
  private evaluateCondition(
    condition: string,
    payload: Record<string, unknown>,
  ): boolean {
    try {
      // $. 形式の JSONPath を payload に変換
      let expr = condition.replace(/\$\.([\w.]+)/g, (_, path) => {
        return `payload.${path}`;
      });

      // 簡易的な条件評価（セキュリティのため安全な式のみ評価）
      // payload.field == value, payload.field != value, payload.field > value など
      const safePattern =
        /^payload(?:\.[\w]+)*(?:\s*(?:==|!=|>=|<=|>|<|&&|\|\|)\s*(?:payload(?:\.[\w]+)*|[\d.]+|'[^']*'|"[^"]*"))*$/;

      if (!safePattern.test(expr)) {
        console.warn(`安全でない条件式は評価されません: ${condition}`);
        return false;
      }

      // 簡易評価器を使用
      return this.safeEvaluate(expr, payload);
    } catch (error) {
      console.warn(`条件式の評価に失敗: ${condition}`, error);
      return false;
    }
  }

  /**
   * 安全な式評価
   * 演算子 ==, !=, >, <, >=, <=, &&, || をサポート
   */
  private safeEvaluate(expr: string, payload: Record<string, unknown>): boolean {
    // トークン化
    const tokens = this.tokenize(expr);

    // 値を解決
    const resolvedTokens = tokens.map((token) => {
      if (token.startsWith("payload.")) {
        const value = this.getNestedValue(payload, token.substring(8));
        return JSON.stringify(value);
      }
      return token;
    });

    const resolvedExpr = resolvedTokens.join(" ");

    // Function コンストラクタで評価（安全なトークンのみ使用）
    try {
      // 文字列比較を正しく処理するため、== を === に、!= を !== に変換
      const jsExpr = resolvedExpr
        .replace(/==/g, "===")
        .replace(/!=/g, "!==")
        .replace(/&&/g, " && ")
        .replace(/\|\|/g, " || ");

      return new Function(`return ${jsExpr}`)();
    } catch {
      return false;
    }
  }

  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (inString) {
        current += char;
        if (char === stringChar) {
          tokens.push(current);
          current = "";
          inString = false;
        }
      } else if (char === '"' || char === "'") {
        if (current) {
          tokens.push(current);
          current = "";
        }
        current = char;
        inString = true;
        stringChar = char;
      } else if (["=", "!", ">", "<", "&", "|"].includes(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        // 2文字演算子の処理
        if (i + 1 < expr.length && ["=", "&", "|"].includes(expr[i + 1])) {
          tokens.push(char + expr[i + 1]);
          i++;
        } else {
          tokens.push(char);
        }
      } else if (char === " ") {
        if (current) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }
}
