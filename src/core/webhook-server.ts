import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Logger } from "../logger.js";
import type { Executor } from "./executor.js";
import type { Config, JobConfig } from "../config/schema.js";
import { createHmac } from "node:crypto";

interface WebhookJob {
  name: string;
  path: string;
  secret?: string;
  jobConfig: JobConfig;
}

export class WebhookServer {
  private server: ReturnType<typeof createServer> | null = null;
  private webhookJobs: Map<string, WebhookJob> = new Map();

  constructor(
    private config: Config,
    private executor: Executor,
    private logger: Logger,
  ) {
    // Webhook トリガーを持つジョブを抽出
    for (const [name, jobConfig] of Object.entries(config.jobs)) {
      if (jobConfig.trigger?.type === "webhook") {
        const webhookPath = jobConfig.trigger.path;
        this.webhookJobs.set(webhookPath, {
          name,
          path: webhookPath,
          secret: jobConfig.trigger.secret,
          jobConfig,
        });
        logger.info({ job: name, path: webhookPath }, "Webhook トリガーを登録");
      }
    }
  }

  start(port: number): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(port, () => {
      this.logger.info({ port }, "Webhook サーバーを起動");
    });

    this.server.on("error", (err) => {
      this.logger.error({ err }, "Webhook サーバーエラー");
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.logger.info("Webhook サーバーを停止");
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || "/";
    const method = req.method || "GET";

    // ヘルスチェックエンドポイント
    if (url === "/health" || url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    // Webhook パスを検索
    const webhookJob = this.webhookJobs.get(url);
    if (!webhookJob) {
      this.logger.warn({ path: url }, "未知の Webhook パス");
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // POST メソッドのみ許可
    if (method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    try {
      // リクエストボディを読み取り
      const body = await this.readBody(req);

      // シークレット検証
      if (webhookJob.secret) {
        const signature = req.headers["x-webhook-signature"] as string;
        const expectedSignature = createHmac("sha256", webhookJob.secret)
          .update(body)
          .digest("hex");

        if (!signature || signature !== expectedSignature) {
          this.logger.warn({ job: webhookJob.name }, "Webhook シークレット検証失敗");
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid signature" }));
          return;
        }
      }

      // ジョブを実行（ペイロードを環境変数または judge に渡す）
      this.logger.info({ job: webhookJob.name, path: url }, "Webhook トリガー受信");

      // Webhook ペイロードを環境変数に設定
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }

      // 元の環境変数を保存
      const originalEnv = process.env.WEBHOOK_PAYLOAD;
      process.env.WEBHOOK_PAYLOAD = body;

      try {
        await this.executor.execute(webhookJob.name);
      } finally {
        // 環境変数を復元
        if (originalEnv !== undefined) {
          process.env.WEBHOOK_PAYLOAD = originalEnv;
        } else {
          delete process.env.WEBHOOK_PAYLOAD;
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "triggered", job: webhookJob.name }));
    } catch (err) {
      this.logger.error({ err, path: url }, "Webhook 処理エラー");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }

  get registeredPaths(): string[] {
    return Array.from(this.webhookJobs.keys());
  }

  /** Webhook ジョブ数 */
  get jobCount(): number {
    return this.webhookJobs.size;
  }
}
