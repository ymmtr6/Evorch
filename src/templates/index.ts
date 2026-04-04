import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TemplateInfo {
  name: string;
  description: string;
  content: string;
}

// テンプレートの説明定義
const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  "github-issues": "GitHub Issue の定期監視と AI 分析",
  "github-pr-review": "PR 作成時の自動レビュー依頼",
  "deploy-health-check": "デプロイ後のヘルスチェックと通知",
  "daily-report": "日次レポートの自動生成",
  "error-monitor": "ログのエラー監視とアラート",
  "slack-digest": "Slack メッセージのダイジェスト生成",
};

/**
 * テンプレート一覧を取得
 */
export function listTemplates(): TemplateInfo[] {
  const templates: TemplateInfo[] = [];
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );

  for (const file of files) {
    const name = file.replace(/\.(yaml|yml)$/, "");
    const content = readFileSync(join(__dirname, file), "utf-8");
    templates.push({
      name,
      description: TEMPLATE_DESCRIPTIONS[name] || name,
      content,
    });
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * テンプレート名の一覧を取得
 */
export function getTemplateNames(): string[] {
  return listTemplates().map((t) => t.name);
}

/**
 * 指定したテンプレートを取得
 */
export function getTemplate(name: string): TemplateInfo | null {
  const templates = listTemplates();
  return templates.find((t) => t.name === name) || null;
}
