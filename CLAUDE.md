# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Evorch はイベント駆動型のオーケストレーション CLI ツール。「定期実行 (Schedule) → 条件判定 (Judge) → エージェント起動 (Act)」のフローを実現する。

## 開発コマンド

```bash
# ビルド
npm run build

# 開発モード (tsx で直接実行)
npm run dev

# テスト実行 (NODE_OPTIONS='--experimental-sqlite' が自動付与される)
npm test

# 特定のテストファイルのみ実行
NODE_OPTIONS='--experimental-sqlite' npx vitest run test/store.test.ts

# テスト (watch モード)
npm run test:watch

# 型チェック
npx tsc --noEmit

# CLI の実行 (ビルド後)
npx evorch run
npx evorch once <job-name> --dry-run
npx evorch validate
```

## アーキテクチャ

### 実行フロー

```
jobs/*.yaml ──▶ Scheduler ──▶ Executor ──▶ Judge ──▶ EventBus ──▶ Agent
                 (cron)                   (shell/http)  (policy)   (claude-code/shell/...)
                                                           ▲
                                                    policies/*.yaml
```

1. **Scheduler** (`core/scheduler.ts`) が cron スケジュールでジョブを起動
2. **Executor** (`core/executor.ts`) が judge プラグインを実行し、条件を判定
3. 条件成立時、dedup チェック後に **EventBus** (`core/event-bus.ts`) へイベント送信
4. **EventBus** が `core/policy.ts` のポリシーマッチングでエージェントを特定し実行

### 設定の読み込み

`config/loader.ts` が以下を統合して `Config` オブジェクトを生成する：

- `evorch.config.yaml`: ストア・ログ・実行設定・インラインポリシー
- `jobs_dir/*.yaml`: ジョブ定義（ファイル名 = ジョブ名、`jobs_dir` のものが優先）
- `policies_dir/*.yaml`: ポリシー定義（ファイル名 = ポリシー名、`policies_dir` のものが優先）

Zod スキーマは `config/schema.ts` で定義。ポリシーファイルは `PolicyFileSchema`（`name` フィールドなし）、インライン定義は `PolicySchema`（`name` フィールドあり）を使用する。

### プラグインシステム

`plugins/protocol.ts` に `JudgePlugin` / `AgentPlugin` インターフェースを定義。`plugins/runtime.ts` の `BUILTIN_JUDGES` / `BUILTIN_AGENTS` マップに登録する。

**ビルトインプラグイン:**
- judge: `shell`, `http`
- agent: `claude-code`, `shell`, `codex`, `notify`

新しいプラグイン追加時:
1. `plugins/judges/` または `plugins/agents/` に実装
2. `runtime.ts` のマップに登録

### SQLite ストア

Node.js 組み込みの `node:sqlite`（`DatabaseSync`）を使用。`better-sqlite3` は使用しない。`store/database.ts` でDBを開き、`store/migrations.ts` でスキーマを管理、`store/repository.ts` で全DB操作を集約する。

## 技術スタック

- TypeScript (ESM, target: ES2022, moduleResolution: Node16)
- `node:sqlite` (Node.js 22.5.0+ 組み込み、状態管理)
- commander (CLI)
- croner (スケジューリング)
- pino (ロギング)
- yaml (設定ファイル)
- zod (スキーマバリデーション)
- vitest (テスト)
