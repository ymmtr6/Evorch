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

  return true;
}
