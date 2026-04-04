import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate, getTemplateNames } from "../src/templates/index.js";

describe("テンプレート機能", () => {
  it("テンプレート一覧を取得できる", () => {
    const templates = listTemplates();

    expect(templates.length).toBeGreaterThan(0);

    // 必須フィールドの確認
    for (const t of templates) {
      expect(t.name).toBeDefined();
      expect(t.description).toBeDefined();
      expect(t.content).toBeDefined();
    }
  });

  it("期待するテンプレートが全て存在する", () => {
    const names = getTemplateNames();

    expect(names).toContain("github-issues");
    expect(names).toContain("github-pr-review");
    expect(names).toContain("deploy-health-check");
    expect(names).toContain("daily-report");
    expect(names).toContain("error-monitor");
    expect(names).toContain("slack-digest");
  });

  it("指定したテンプレートを取得できる", () => {
    const template = getTemplate("github-issues");

    expect(template).not.toBeNull();
    expect(template?.name).toBe("github-issues");
    expect(template?.description).toBe("GitHub Issue の定期監視と AI 分析");
    expect(template?.content).toContain("schedule:");
    expect(template?.content).toContain("judge:");
  });

  it("存在しないテンプレートはnullを返す", () => {
    const template = getTemplate("non-existent-template");

    expect(template).toBeNull();
  });

  it("テンプレート内容に必要なフィールドが含まれる", () => {
    const templates = listTemplates();

    for (const t of templates) {
      // 全テンプレートに schedule と judge が含まれることを確認
      expect(t.content).toContain("schedule:");
      expect(t.content).toContain("judge:");
    }
  });
});
