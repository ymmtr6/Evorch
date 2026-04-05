# Evorch

Event-driven orchestration CLI - 「定期実行 → 条件判定 → エージェント起動」を中核にしたオーケストレーター。

## 概要

Evorch は以下のフローを実現する CLI ツールです：

1. **Schedule**: cron スケジュールでジョブを定期実行
2. **Judge**: シェルコマンドで条件を判定
3. **Act**: 条件成立時、Claude Code 等のエージェントを起動

```
┌─────────────┐     ┌─────────────┐   Event(JSON)   ┌─────────────┐     ┌─────────────┐
│  Scheduler  │ ──▶ │    Judge    │ ──────────────▶ │  EventBus   │ ──▶ │    Agent    │
│   (cron)    │     │   (shell)   │                 │  (policy)   │     │ (Claude)    │
└─────────────┘     └─────────────┘                 └─────────────┘     └─────────────┘
```

## 特徴

- **判定と実行の分離**: 条件判定 (judge) とアクション実行 (agent) を完全に分離
- **ファイル分割されたジョブ定義**: ジョブごとに YAML ファイルを分割して管理
- **ポリシーベースのルーティング**: イベントの属性に基づいてエージェントを振り分け
- **重複抑止**: fingerprint による同一イベントの抑制
- **SQLite による状態管理**: 実行履歴、イベント、重複抑止を永続化
- **再帰ガード**: エージェントが連鎖的にイベントを発行してもループしない (dispatchDepth)
- **詳細な終了理由**: エージェントの終了理由を `complete / error / timeout / killed / skipped / dedup` で記録

## インストール

### Homebrew (推奨)

```bash
brew tap ymmtr6/evorch
brew install evorch
```

### ソースから

```bash
git clone https://github.com/ymmtr6/Evorch.git
cd Evorch
npm install
npm run build
npm link  # evorch コマンドをグローバルに登録
```

## クイックスタート

### 1. 初期化

```bash
# 設定ディレクトリとデフォルト設定を作成
evorch job init
```

設定は `~/.config/evorch/` に作成されます：
- `config.yaml` - メイン設定
- `jobs/` - ジョブ定義ファイル

### 2. ジョブを登録

```bash
# ジョブファイルを作成
cat > /tmp/my-job.yaml << 'EOF'
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
EOF

# ジョブを登録
evorch job add /tmp/my-job.yaml

# 登録済みジョブ一覧
evorch job list

# ジョブを削除
evorch job remove my-job
```

### 3. ポリシーを設定

**~/.config/evorch/config.yaml** にポリシーを追加:

```yaml
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

### 4. 設定を検証

```bash
evorch validate
```

### 5. 単発実行 (テスト用)

```bash
# dry-run モード (judge まで、agent は実行しない)
evorch once my-job --dry-run

# 実際に実行
evorch once my-job
```

### 6. デーモンモードで起動

```bash
evorch run
```

## CLI コマンド

| コマンド | 説明 |
|---|---|
| `evorch run` | デーモンモードで全ジョブをスケジュール実行 |
| `evorch once <job>` | 指定ジョブを1回だけ即時実行 |
| `evorch stop` | バックグラウンドで動作中の `evorch run` を停止 |
| `evorch status` | 各ジョブの状態と次回実行時刻を表示 |
| `evorch history [job]` | 実行履歴を表示 |
| `evorch results [policy-or-id]` | エージェント実行結果を表示 |
| `evorch validate` | 設定ファイルの検証 |
| `evorch job init` | 設定ディレクトリを初期化 |
| `evorch job add <file>` | ジョブファイルを登録 |
| `evorch job remove <name>` | ジョブを削除 |
| `evorch job list` | 登録済みジョブ一覧を表示 |

### オプション

- `-c, --config <path>`: 設定ファイルパス (デフォルト: `~/.config/evorch/config.yaml`)
- `-v, --verbose`: 詳細ログ出力
- `--dry-run`: judge まで実行し、agent は実行しない (`once` コマンド用)
- `--json`: JSON形式で出力 (`status`, `history` コマンド用)

## 設定リファレンス

### メイン設定 (~/.config/evorch/config.yaml)

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `store.path` | string | `./evorch.db` | SQLite データベースのパス |
| `log.level` | string | `info` | ログレベル (`debug`, `info`, `warn`, `error`) |
| `jobs_dir` | string | `./jobs` | ジョブ定義ファイルのディレクトリ |
| `policies` | array | `[]` | イベント → エージェントのルーティングポリシー |
| `execution.max_concurrent` | number | `3` | 同時実行ジョブ数の上限 |
| `execution.default_timeout` | number | `120` | デフォルトタイムアウト (秒) |
| `execution.max_dispatch_depth` | number | `10` | イベント再帰発行の深度上限 (超過時は破棄) |

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

### agent:shell

シェルコマンドを実行します。

```yaml
agent:
  plugin: "shell"
  config:
    command: "echo 'Event: {{event_type}}, Data: {{payload}}'"
    workdir: "/path/to/workdir"
    timeout: 60
```

**テンプレート変数:**

| 変数 | 説明 |
|---|---|
| `{{event_id}}` | イベントID |
| `{{event_type}}` | イベントタイプ |
| `{{source}}` | イベントソース (ジョブ名) |
| `{{payload}}` | ペイロード全体 (JSON) |
| `{{payload.key}}` | ペイロード内の特定キー |

### agent:codex

OpenAI Codex CLI を使用してタスクを実行します。

```yaml
agent:
  plugin: "codex"
  config:
    prompt_template: |
      以下の内容を分析してください:
      {{payload}}
    workdir: "/path/to/workdir"
    timeout: 300
    model: "o4-mini"
    approval_mode: "suggest"
```

**設定パラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `prompt_template` | string | `{{payload}}` | プロンプトテンプレート |
| `workdir` | string | - | 作業ディレクトリ |
| `timeout` | number | `300` | タイムアウト (秒) |
| `model` | string | - | モデル名 (例: `o4-mini`, `gpt-4.1`) |
| `approval_mode` | string | - | `suggest`, `auto-edit`, `full-auto` |

**注意:** Codex CLI は別途インストールが必要です: `npm i -g @openai/codex`

### agent:notify

macOS の通知センターへ通知を送ります。

```yaml
agent:
  plugin: "notify"
  config:
    title: "Evorch アラート"
    message: "{{event_type}} を検知しました"
    subtitle: "source: {{source}}"
    sound: "default"
```

**設定パラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `title` | string | `Evorch` | 通知タイトル |
| `message` | string | `{{event_type}} from {{source}}` | 通知本文 |
| `subtitle` | string | - | サブタイトル |
| `sound` | string | - | 通知音 (例: `default`, `Basso`) |

**注意:** macOS 専用 (`osascript` を使用)。

## エージェント実行結果

エージェントの実行結果は `evorch results` で確認できます。

```bash
# 最近の結果を一覧表示
evorch results

# ポリシー名で絞り込み
evorch results my-policy

# RESULT ID を指定して詳細表示
evorch results 01KNDVP5M65ESVB0AF8951TZ73

# JSON形式で出力
evorch results --json
```

### 終了理由 (reason) と終了状態 (outcome)

各エージェント実行には `reason` (詳細な終了理由) と `outcome` (3分類の終了状態) が記録されます。

| reason | outcome | 説明 |
|---|---|---|
| `complete` | `ok` | 正常終了 |
| `error` | `error` | エラー終了 |
| `timeout` | `error` | タイムアウト |
| `killed` | `skipped` | 強制終了 (キャンセル) |
| `skipped` | `skipped` | judge 不成立によるスキップ |
| `dedup` | `skipped` | 重複抑止によるスキップ |

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
