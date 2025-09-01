# GitHub Scriptsドキュメント

このディレクトリには、プロジェクト文書の自動更新スクリプトが含まれています。

## スクリプト一覧

### 1. claude-update-overwrite.js
要件定義書（`docs/requirements.md`）を議事録から自動更新します。

**実行方法:**
```bash
CLAUDE_API_KEY="your-api-key" node .github/scripts/claude-update-overwrite.js
```

### 2. claude-update-all.js
全プロジェクト文書を議事録から自動更新します（見積もり以外）。

**対象ファイル:**
- 00_商談段階: 機能一覧、機能優先度、NA一覧
- 10_要件定義段階: 機能詳細、ページ一覧、テーブル定義、通知一覧、NA更新
- 20_実装段階: テストケース
- 90_共通: プロジェクト概要、スケジュール、ステークホルダー

**実行方法:**
```bash
CLAUDE_API_KEY="your-api-key" node .github/scripts/claude-update-all.js
```

### 3. generate-estimate.js
機能一覧と見積もりテンプレートから初期見積もりを自動生成します。

**処理フロー:**
1. `00_商談段階/01_機能一覧/機能一覧.md`を読み込み
2. `00_商談段階/02_見積もり/見積もりテンプレート.md`を参照
3. 最新の議事録を参考情報として使用
4. AI入力テンプレートと初期見積もりを生成

**実行方法:**
```bash
CLAUDE_API_KEY="your-api-key" node .github/scripts/generate-estimate.js
```

## GitHub Actions

### 自動実行トリガー
- **要件定義書更新**: 議事録が追加/更新された時
- **全文書更新**: 議事録が追加/更新された時
- **見積もり生成**: 機能一覧または議事録が更新された時

### 手動実行
すべてのワークフローはGitHub ActionsのUIから手動実行も可能です。

## 環境変数

### CLAUDE_API_KEY
Anthropic Claude APIのキーが必要です。
GitHub Secretsに`CLAUDE_API_KEY`として設定してください。

## 見積もりプロセスの詳細

### 自動化された見積もりフロー
1. **機能一覧の作成**: まず`00_商談段階/01_機能一覧/機能一覧.md`に機能を記載
2. **自動見積もり生成**: `generate-estimate.js`が以下を実行:
   - 機能一覧の各機能を見積もりテンプレートの分類に振り分け
   - 複雑度を判定して適切な工数を設定
   - 議事録の内容を考慮して調整
3. **出力ファイル**:
   - `AI入力テンプレート_初期見積もり.md`: Claudeが生成した見積もり
   - `初期見積もり.md`: 同じ内容（お客様提示用）

### 複雑度の判定基準
- **低複雑度** (0.8倍): 基本的な表示・入力のみ
- **標準複雑度** (1.0倍): 一般的な業務ロジックを含む
- **高複雑度** (1.3倍): 複雑な条件分岐や外部連携を含む
- **超高複雑度** (1.6倍): リアルタイム処理や高度な計算を含む

## トラブルシューティング

### エラー: MODULE_NOT_FOUND
```bash
npm install axios
```

### エラー: CLAUDE_API_KEY is required
環境変数にAPIキーを設定してください：
```bash
export CLAUDE_API_KEY="your-api-key"
```

### エラー: 機能一覧が見つかりません
`00_商談段階/01_機能一覧/機能一覧.md`を先に作成してください。