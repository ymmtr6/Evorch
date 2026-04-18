import type { EvOrchEvent } from "./types.js";
import type { PolicyMatch } from "../config/schema.js";

/** イベントがポリシーの match 条件に合致するか判定 */
export function matchEvent(event: EvOrchEvent, match: PolicyMatch): boolean {
  // type マッチ
  if (match.type && event.type !== match.type) {
    return false;
  }

  // severity マッチ
  if (match.severity) {
    const severities = Array.isArray(match.severity)
      ? match.severity
      : [match.severity];
    if (!severities.includes(event.severity)) {
      return false;
    }
  }

  // labels マッチ (全キーが一致する AND 条件)
  if (match.labels) {
    for (const [key, value] of Object.entries(match.labels)) {
      if (event.labels[key] !== value) {
        return false;
      }
    }
  }

  // condition マッチ (条件式評価)
  if (match.condition) {
    if (!evaluateCondition(match.condition, event)) {
      return false;
    }
  }

  return true;
}

/**
 * 条件式を評価する
 * サポート形式:
 * - payload.field == value
 * - payload.field > 10
 * - payload.field && labels.field == 'value'
 * - payload.field < 5 || payload.field > 10
 */
function evaluateCondition(condition: string, event: EvOrchEvent): boolean {
  try {
    // 安全性チェック: 危険なキーワードが含まれていないか確認
    const dangerousPatterns = [
      /\beval\b/,
      /\bFunction\b/,
      /\brequire\b/,
      /\bimport\b/,
      /\bprocess\b/,
      /\bglobal\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\b__proto__\b/,
      /\bconstructor\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(condition)) {
        console.warn(`安全でない条件式は評価されません: ${condition}`);
        return false;
      }
    }

    // トークン化して値を解決
    const tokens = tokenize(condition);
    const context = {
      payload: event.payload,
      labels: event.labels,
    };

    const resolvedTokens = tokens.map((token) => {
      if (token.startsWith("payload.") || token.startsWith("labels.")) {
        const value = getNestedValue(context, token);
        return JSON.stringify(value);
      }
      return token;
    });

    const resolvedExpr = resolvedTokens.join(" ");

    // JavaScript として評価
    const jsExpr = resolvedExpr
      .replace(/==/g, "===")
      .replace(/!=/g, "!==")
      .replace(/&&/g, " && ")
      .replace(/\|\|/g, " || ");

    return new Function(`return ${jsExpr}`)();
  } catch (error) {
    console.warn(`条件式の評価に失敗: ${condition}`, error);
    return false;
  }
}

/** 式をトークン化 */
function tokenize(expr: string): string[] {
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

/** ネストした値を取得 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
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
