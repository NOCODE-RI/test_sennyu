import fs from 'fs';
import path from 'path';
import axios from 'axios';

const NOTES_DIRS = [
  '00_商談段階/04_議事録',
  '10_要件定義段階/07_議事録'
].filter(d => fs.existsSync(d));

function latestNotePath() {
  let all = [];
  for (const d of NOTES_DIRS) {
    const files = fs.readdirSync(d).filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .map(f => path.join(d, f));
    all.push(...files);
  }
  if (all.length === 0) {
    console.log('No meeting notes found. Skip.');
    process.exit(0);
  }
  all.sort(); // YYYY-MM-DD_*.md 前提
  return all[all.length - 1];
}

const notePath = latestNotePath();
const meetingNotes = fs.readFileSync(notePath, 'utf-8');

const REQUIREMENTS_PATH = 'docs/requirements.md';
if (!fs.existsSync(REQUIREMENTS_PATH)) {
  throw new Error('docs/requirements.md not found. Please add the template with SECTION markers.');
}

// 既存の要件定義書を読み込む
const existingRequirements = fs.readFileSync(REQUIREMENTS_PATH, 'utf-8');

// Claudeに「JSONで章ごとの上書き内容」を要求
// 議事録から要件定義に関連する部分のみを抽出
async function extractRelevantParts(notes) {
  // 要件定義に関連するキーワード
  const relevantPatterns = [
    /機能[：:について]/,
    /要件[：:について]/,
    /スケジュール[：:について]/,
    /納期[：:について]/,
    /予算[：:について]/,
    /仕様[：:について]/,
    /追加[：:について]/,
    /変更[：:について]/,
    /削除[：:について]/,
    /課題[：:について]/,
    /決定[：:について]/,
    /確認[：:について]/,
    /承認[：:について]/,
    /システム[：:について]/,
    /開発[：:について]/,
    /実装[：:について]/,
    /ヶ月|月末|月初/,
    /工数|時間|人日/,
    /円|万円|費用/
  ];
  
  // 発言を分割
  const utterances = notes.split('\n\n');
  const relevantUtterances = [];
  
  for (const utterance of utterances) {
    // キーワードが含まれる発言を抽出
    if (relevantPatterns.some(pattern => pattern.test(utterance))) {
      relevantUtterances.push(utterance);
    }
  }
  
  // 重要な部分のみを結合（最大3000文字）
  let extracted = relevantUtterances.join('\n\n');
  if (extracted.length > 3000) {
    extracted = extracted.substring(0, 3000) + '\n\n[以下、関連部分のみ抽出]';
  }
  
  return extracted || notes.substring(0, 3000);
}

// 議事録から重要部分を抽出
const meetingNotesForPrompt = await extractRelevantParts(meetingNotes);

const prompt = `
あなたは要件定義書の編集アシスタントです。
既存の要件定義書と新しい議事録を照らし合わせて、要件定義書の更新すべき章を「JSONで」出力してください。

- 出力は **必ずJSON**。キーは章名、値は**章の全文Markdown**。
- 章名は、要件定義書テンプレのマーカーに合わせる（例: 背景・目的, スコープ, ステークホルダー, ユースケース, 非機能要件, API一覧, DB設計, リリース計画 など）。
- 「追記」ではなく**上書き**。ただし、既存の内容を考慮して、必要な情報は保持しつつ、議事録の内容を反映した章全体を返してください。
- 存在しない章を返す場合は無視されます。既存章のみ更新されます。
- 議事録に言及されていない章は更新しないでください。

【既存の要件定義書】
${existingRequirements}

【新しい議事録】
${meetingNotesForPrompt}
`;

const API_KEY = process.env.CLAUDE_API_KEY;
// モデル選択（精度重視）
const MODEL = 'claude-sonnet-4-20250514';  // バランス型 - 精度とコストの最適解 ($3/$15 per 1M tokens)
// const MODEL = 'claude-opus-4-1-20250805';  // 最高精度 ($15/$75 per 1M tokens)
// const MODEL = 'claude-3-5-haiku-20241022';  // 高速・安価 ($1/$5 per 1M tokens)

async function getClaudeJson() {
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

    const text = res.data?.content?.[0]?.text ?? '';
    // JSON以外が混じることも想定し、最初の { から最後の } までを抽出
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const jsonStr = (start >= 0 && end > start) ? text.slice(start, end + 1) : '{}';
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('API Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers
    });
    throw error;
  }
}

function replaceSection(md, sectionName, newContent) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(`<!--\\s*SECTION:${esc(sectionName)}\\s*START\\s*-->`);
  const end   = new RegExp(`<!--\\s*SECTION:${esc(sectionName)}\\s*END\\s*-->`);

  if (!start.test(md) || !end.test(md)) {
    // マーカーが無ければ末尾にセクションを新設
    return md.trim() + `

## ${sectionName}
<!-- SECTION:${sectionName} START -->
${newContent.trim()}
<!-- SECTION:${sectionName} END -->
`;
  }

  // マーカー間を置換
  return md.replace(
    new RegExp(`(<!--\\s*SECTION:${esc(sectionName)}\\s*START\\s*-->)([\\s\\S]*?)(<!--\\s*SECTION:${esc(sectionName)}\\s*END\\s*-->)`),
    (_, a, _mid, c) => `${a}\n${newContent.trim()}\n${c}`
  );
}

async function run() {
  try {
    console.log(`処理開始: ${notePath}`);
    console.log(`元の議事録: ${meetingNotes.length}文字`);
    const extractedNotes = await extractRelevantParts(meetingNotes);
    console.log(`抽出後: ${extractedNotes.length}文字 (${Math.round((extractedNotes.length / meetingNotes.length) * 100)}%)`);
    
    const updates = await getClaudeJson();
  let req = fs.readFileSync(REQUIREMENTS_PATH, 'utf-8');
  let changed = false;

  for (const [section, content] of Object.entries(updates)) {
    if (typeof content !== 'string' || !content.trim()) continue;
    const next = replaceSection(req, section, content);
    if (next !== req) {
      req = next;
      changed = true;
    }
  }

  if (!changed) {
    console.log('No applicable section updates. Exit.');
    return;
  }

  fs.writeFileSync(REQUIREMENTS_PATH, req);
  console.log('requirements.md updated from notes:', path.basename(notePath));
  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
