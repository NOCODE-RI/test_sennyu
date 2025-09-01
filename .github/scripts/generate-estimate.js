import fs from 'fs';
import path from 'path';
import axios from 'axios';

const API_KEY = process.env.CLAUDE_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

// ファイルパス定義
const PATHS = {
  functionList: '00_商談段階/01_機能一覧/機能一覧.md',
  estimateTemplate: '00_商談段階/02_見積もり/見積もりテンプレート.md',
  aiInputTemplate: '00_商談段階/02_見積もり/AI入力テンプレート_初期見積もり.md',
  initialEstimate: '00_商談段階/02_見積もり/初期見積もり.md',
  meetingNotes: [
    '00_商談段階/04_議事録',
    '10_要件定義段階/07_議事録'
  ]
};

// 最新の議事録を取得
function getLatestMeetingNotes() {
  let allNotes = [];
  for (const dir of PATHS.meetingNotes) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .map(f => ({
          path: path.join(dir, f),
          name: f,
          mtime: fs.statSync(path.join(dir, f)).mtime
        }));
      allNotes.push(...files);
    }
  }
  
  // 日付順にソート（新しい順）
  allNotes.sort((a, b) => b.mtime - a.mtime);
  
  // 最新の3件を取得
  const recentNotes = allNotes.slice(0, 3);
  
  return recentNotes.map(note => {
    const content = fs.readFileSync(note.path, 'utf-8');
    return `\n### ${note.name}\n${content}`;
  }).join('\n\n---\n');
}

// Claudeに見積もりを生成させる
async function generateEstimate(functionList, template, meetingNotes) {
  const prompt = `
あなたはプロジェクトの見積もり作成専門家です。
以下の情報を元に、工数見積もりを作成してください。

## 作成手順
1. 機能一覧から各機能を抽出し、見積もりテンプレートの該当する分類に振り分ける
2. 各機能の複雑度を判断し、適切な工数を設定する
3. 議事録の内容を参考に、追加要件や特殊要件を考慮する
4. AI入力テンプレートの形式で出力する

## 複雑度の判断基準
- 低複雑度: 基本的な表示・入力のみ（0.8倍）
- 標準複雑度: 一般的な業務ロジックを含む（1.0倍）
- 高複雑度: 複雑な条件分岐や外部連携を含む（1.3倍）
- 超高複雑度: リアルタイム処理や高度な計算を含む（1.6倍）

## 見積もりテンプレート（参考工数）
${template}

## 機能一覧
${functionList}

## 議事録（参考情報）
${meetingNotes || '議事録なし'}

## 出力形式
以下の形式で出力してください：

# AI入力テンプレート（初期見積もり）

## 2. システム要件・非機能要件

### 2.1 システムの目的
[機能一覧や議事録から抽出したシステムの目的を記載]

### 2.2 システム要件
[機能一覧から抽出したシステム要件を記載]

## #機能一覧

| 権限 | 機能 | 備考 | 実装工数（人日） | テスト工数（実装工数*0.5） | 要件定義工数（実装工数*0.5） |
|------|------|------|------------------|----------------------------|------------------------------|
[機能一覧の内容をテンプレートの工数を参考に記載]

## 合計工数

| 項目 | 工数（人日） |
|------|-------------|
| 実装工数合計 | X.X |
| テスト工数合計 | X.X |
| 要件定義工数合計 | X.X |
| **総工数** | **X.X** |

## 備考
[特記事項や前提条件を記載]
`;

  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    }, {
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    return res.data?.content?.[0]?.text || '';
  } catch (error) {
    console.error('API Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    throw error;
  }
}

// メイン処理
async function run() {
  try {
    console.log('見積もり生成プロセスを開始します...');
    
    // 必要なファイルの確認
    if (!fs.existsSync(PATHS.functionList)) {
      console.error(`エラー: ${PATHS.functionList} が見つかりません。機能一覧を先に作成してください。`);
      process.exit(1);
    }
    
    if (!fs.existsSync(PATHS.estimateTemplate)) {
      console.error(`エラー: ${PATHS.estimateTemplate} が見つかりません。`);
      process.exit(1);
    }
    
    // ファイル読み込み
    console.log('1. 機能一覧を読み込み中...');
    const functionList = fs.readFileSync(PATHS.functionList, 'utf-8');
    
    console.log('2. 見積もりテンプレートを読み込み中...');
    const template = fs.readFileSync(PATHS.estimateTemplate, 'utf-8');
    
    console.log('3. 最新の議事録を読み込み中...');
    const meetingNotes = getLatestMeetingNotes();
    
    console.log('4. Claudeで見積もりを生成中...');
    const estimate = await generateEstimate(functionList, template, meetingNotes);
    
    // AI入力テンプレートの既存内容を読み込む（存在する場合）
    let existingContent = '';
    if (fs.existsSync(PATHS.aiInputTemplate)) {
      existingContent = fs.readFileSync(PATHS.aiInputTemplate, 'utf-8');
    }
    
    // AI入力テンプレートを更新
    console.log('5. AI入力テンプレートを更新中...');
    fs.writeFileSync(PATHS.aiInputTemplate, estimate);
    console.log(`✅ ${PATHS.aiInputTemplate} を更新しました`);
    
    // 初期見積もりも同時に更新
    console.log('6. 初期見積もりを更新中...');
    fs.writeFileSync(PATHS.initialEstimate, estimate);
    console.log(`✅ ${PATHS.initialEstimate} を更新しました`);
    
    console.log('\n見積もり生成が完了しました！');
    console.log('\n次のステップ:');
    console.log('1. 生成されたAI入力テンプレートを確認してください');
    console.log('2. 必要に応じて手動で調整してください');
    console.log('3. 最終的な見積もりを初期見積もり.mdに反映してください');
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// APIキーの確認
if (!API_KEY) {
  console.error('エラー: CLAUDE_API_KEY環境変数が設定されていません');
  console.error('実行例: CLAUDE_API_KEY="your-api-key" node .github/scripts/generate-estimate.js');
  process.exit(1);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});