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

# テスト実行
npm test

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

### レイヤー構成

```
src/
├── cli/           # CLI コマンド実装 (commander 使用)
├── config/        # 設定ローダーと Zod スキーマ定義
├── core/          # コアエンジン
│   ├── scheduler.ts   # croner による cron スケジューリング
│   ├── executor.ts    # ジョブ実行フローの制御
│   ├── event-bus.ts   # イベント配送とポリシーマッチング
│   └── policy.ts      # イベント→エージェントのルーティング
├── store/         # SQLite (better-sqlite3) による状態永続化
└── plugins/       # プラグインシステム
    ├── protocol.ts    # JudgePlugin / AgentPlugin インターフェース
    ├── runtime.ts     # プラグインの解決と実行
    ├── judges/shell.ts
    └── agents/claude-code.ts
```

### 実行フロー

1. **Scheduler** が cron スケジュールでジョブを起動
2. **Executor** が judge プラグインを実行し、条件を判定
3. 条件成立時、dedup チェック後に **EventBus** へイベント送信
4. **EventBus** がポリシーマッチングでエージェントを特定し実行

### プラグインシステム

プラグインは `JudgePlugin` または `AgentPlugin` インターフェースを実装する。ビルトインプラグインは `plugins/runtime.ts` の `BUILTIN_JUDGES` / `BUILTIN_AGENTS` に登録。

新しいプラグイン追加時:
1. `plugins/judges/` または `plugins/agents/` に実装
2. `runtime.ts` のマップに登録

### 設定構造

- `evorch.config.yaml`: メイン設定 (ストア、ログ、ポリシー)
- `jobs/*.yaml`: ジョブ定義 (スケジュール、judge、event)
- 設定は Zod スキーマ (`config/schema.ts`) でバリデーション

## 技術スタック

- TypeScript (ESM, target: ES2022)
- better-sqlite3 (状態管理)
- commander (CLI)
- croner (スケジューリング)
- pino (ロギング)
- yaml (設定ファイル)
- zod (スキーマバリデーション)
- vitest (テスト)
