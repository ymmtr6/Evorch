# Evorch

Event-driven orchestration CLI - 「定期実行 → 条件判定 → エージェント起動」を中核にしたオーケストレーター。

## 概要

Evorch は以下のフローを実現する CLI ツールです：

1. **Schedule**: cron スケジュールでジョブを定期実行
2. **Judge**: シェルコマンドで条件を判定
3. **Act**: 条件成立時、Claude Code 等のエージェントを起動

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │ ──▶ │    Judge    │ ──▶ │    Agent    │
│   (cron)    │     │   (shell)   │     │ (Claude)    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Event     │
                    │   (JSON)    │
                    └─────────────┘
```

## 特徴

- **判定と実行の分離**: 条件判定 (judge) とアクション実行 (agent) を完全に分離
- **ファイル分割されたジョブ定義**: ジョブごとに YAML ファイルを分割して管理
- **ポリシーベースのルーティング**: イベントの属性に基づいてエージェントを振り分け
- **重複抑止**: fingerprint による同一イベントの抑制
- **SQLite による状態管理**: 実行履歴、イベント、重複抑止を永続化

## インストール

```bash
git clone https://github.com/ymmtr6/Evorch.git
cd Evorch
npm install
npm run build
```

## クイックスタート

### 1. 設定ファイルを作成

**evorch.config.yaml** (メイン設定):

```yaml
store:
  path: "./evorch.db"

log:
  level: "info"

jobs_dir: "./jobs"

policies:
  - name: "issues-to-claude"
    match:
      type: "new_issues_found"
    agent:
      plugin: "claude-code"
      config:
        prompt_template: |
          以下のissueを分析してください:
          {{payload}}
        timeout: 300
```

**jobs/issue-checker.yaml** (ジョブ定義):

```yaml
schedule: "0 9 * * *"
timezone: "Asia/Tokyo"

judge:
  plugin: "shell"
  config:
    command: "gh issue list --repo owner/repo --state open --json number,title --limit 10"
    timeout: 30

event:
  type: "new_issues_found"
  severity: "medium"
  labels:
    repo: "owner/repo"

dedup:
  fingerprint: "issues:owner/repo"
  suppress_for: "8h"
```

### 2. 設定を検証

```bash
npx evorch validate
```

### 3. 単発実行 (テスト用)

```bash
# dry-run モード (judge まで、agent は実行しない)
npx evorch once issue-checker --dry-run

# 実際に実行
npx evorch once issue-checker
```

### 4. デーモンモードで起動

```bash
npx evorch run
```

## CLI コマンド

| コマンド | 説明 |
|---|---|
| `evorch run` | デーモンモードで全ジョブをスケジュール実行 |
| `evorch once <job>` | 指定ジョブを1回だけ即時実行 |
| `evorch status` | 各ジョブの状態と次回実行時刻を表示 |
| `evorch history [job]` | 実行履歴を表示 |
| `evorch validate` | 設定ファイルの検証 |

### オプション

- `-c, --config <path>`: 設定ファイルパス (デフォルト: `./evorch.config.yaml`)
- `-v, --verbose`: 詳細ログ出力
- `--dry-run`: judge まで実行し、agent は実行しない (`once` コマンド用)
- `--json`: JSON形式で出力 (`status`, `history` コマンド用)

## 設定リファレンス

### メイン設定 (evorch.config.yaml)

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `store.path` | string | `./evorch.db` | SQLite データベースのパス |
| `log.level` | string | `info` | ログレベル (`debug`, `info`, `warn`, `error`) |
| `jobs_dir` | string | `./jobs` | ジョブ定義ファイルのディレクトリ |
| `policies` | array | `[]` | イベント → エージェントのルーティングポリシー |
| `execution.max_concurrent` | number | `3` | 同時実行ジョブ数の上限 |
| `execution.default_timeout` | number | `120` | デフォルトタイムアウト (秒) |

### ジョブ定義 (jobs/*.yaml)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `schedule` | string | ✓ | cron 式 |
| `timezone` | string | | タイムゾーン (例: `Asia/Tokyo`) |
| `judge.plugin` | string | ✓ | judge プラグイン名 (`shell`) |
| `judge.config` | object | ✓ | プラグイン固有の設定 |
| `event.type` | string | ✓ | イベントタイプ |
| `event.severity` | string | | 重要度 (`low`, `medium`, `high`, `critical`) |
| `event.labels` | object | | ラベル (ポリシーマッチング用) |
| `dedup.fingerprint` | string | | 重複抑止用のフィンガープリント |
| `dedup.suppress_for` | string | | 抑止期間 (例: `1h`, `30m`) |

### ポリシー定義

| フィールド | 型 | 説明 |
|---|---|---|
| `name` | string | ポリシー名 |
| `match.type` | string | イベントタイプでフィルタ |
| `match.severity` | string/array | 重要度でフィルタ (OR条件) |
| `match.labels` | object | ラベルでフィルタ (AND条件) |
| `agent.plugin` | string | エージェントプラグイン名 |
| `agent.config` | object | プラグイン固有の設定 |

## ビルトインプラグイン

### judge:shell

シェルコマンドを実行し、結果で条件判定を行います。

```yaml
judge:
  plugin: "shell"
  config:
    command: "gh issue list --state open --json number"
    timeout: 30
```

- 終了コード `0` → 条件成立 (`fired: true`)
- 終了コード `0` 以外 → 条件不成立 (`fired: false`)
- stdout が JSON の場合、`payload` として次のステップに渡す
- JSON配列が空の場合は条件不成立とみなす

### agent:claude-code

Claude Code CLI を使用してタスクを実行します。

```yaml
agent:
  plugin: "claude-code"
  config:
    prompt_template: |
      以下の内容を分析してください:
      {{payload}}
    workdir: "/path/to/workdir"
    timeout: 300
```

- `{{payload}}` はイベントのペイロード (JSON) に置換されます
- `claude --print --output-format text` を実行

## 開発

```bash
# テスト実行
npm test

# 型チェック
npx tsc --noEmit

# ビルド
npm run build
```

## アーキテクチャ

```
evorch/
├── src/
│   ├── cli/           # CLI コマンド
│   ├── config/        # 設定ローダー・スキーマ
│   ├── core/          # コアエンジン
│   │   ├── scheduler.ts   # cron スケジューラ
│   │   ├── executor.ts    # ジョブ実行エンジン
│   │   ├── event-bus.ts   # イベント配送
│   │   └── policy.ts      # ポリシーマッチング
│   ├── store/         # SQLite 状態管理
│   └── plugins/       # プラグイン実装
│       ├── judges/    # judge プラグイン
│       └── agents/    # agent プラグイン
└── test/              # テストファイル
```

## ライセンス

MIT
