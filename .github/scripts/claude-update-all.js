import fs from 'fs';
import path from 'path';
import axios from 'axios';

const NOTES_DIRS = [
  '00_商談段階/04_議事録',
  '10_要件定義段階/07_議事録'
].filter(d => fs.existsSync(d));

// 更新対象ファイルのマッピング
const FILE_MAPPINGS = {
  '00_商談段階': {
    '01_機能一覧/機能一覧.md': ['機能一覧'],
    '01_機能一覧/機能優先度.md': ['機能優先度'],
    '03_NA整理/NA一覧.md': ['NA一覧', 'NA整理']
  },
  '10_要件定義段階': {
    '01_機能詳細/機能詳細.md': ['機能詳細'],
    '02_ページ設計/ページ一覧.md': ['ページ一覧', 'ページ設計'],
    '03_データベース/テーブル定義.md': ['テーブル定義', 'DB設計'],
    '04_通知要件/通知一覧.md': ['通知一覧', '通知要件'],
    '05_NA整理/NA更新解決状況.md': ['NA更新', 'NA解決状況'],
    '06_見積もり/詳細見積もり.md': ['詳細見積もり', '最終見積もり']
  },
  '20_実装段階': {
    '02_テスト/01_単体テストケース.md': ['単体テスト'],
    '02_テスト/02_結合テストケース.md': ['結合テスト']
  },
  '90_共通': {
    '01_プロジェクト/プロジェクト概要.md': ['プロジェクト概要', '背景・目的'],
    '01_プロジェクト/スケジュール.md': ['スケジュール', 'リリース計画'],
    '01_プロジェクト/ステークホルダー.md': ['ステークホルダー']
  }
};

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

// 議事録から要件定義に関連する部分のみを抽出
async function extractRelevantParts(notes) {
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
  
  const utterances = notes.split('\n\n');
  const relevantUtterances = [];
  
  for (const utterance of utterances) {
    if (relevantPatterns.some(pattern => pattern.test(utterance))) {
      relevantUtterances.push(utterance);
    }
  }
  
  let extracted = relevantUtterances.join('\n\n');
  if (extracted.length > 3000) {
    extracted = extracted.substring(0, 3000) + '\n\n[以下、関連部分のみ抽出]';
  }
  
  return extracted || notes.substring(0, 3000);
}

const API_KEY = process.env.CLAUDE_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

async function getClaudeUpdates(existingFiles) {
  const meetingNotesForPrompt = await extractRelevantParts(meetingNotes);
  
  const prompt = `
あなたはプロジェクト文書の更新アシスタントです。
新しい議事録の内容を分析し、関連するプロジェクト文書を更新してください。

以下の文書を更新対象として、議事録から関連する内容を抽出し、各文書の更新内容をJSONで出力してください。

更新対象文書:
${JSON.stringify(existingFiles, null, 2)}

出力形式:
{
  "ファイルパス": "更新する内容（Markdown形式）",
  ...
}

注意事項:
- 議事録に明確に言及されている内容のみを反映
- 既存の内容を考慮し、必要な情報は保持しつつ更新
- 議事録に関連しない文書は更新しない（JSONに含めない）

【新しい議事録】
${meetingNotesForPrompt}
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

    const text = res.data?.content?.[0]?.text ?? '';
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

function ensureSectionMarkers(filePath, sectionNames) {
  if (!fs.existsSync(filePath)) {
    // ファイルが存在しない場合は作成
    const content = sectionNames.map(name => `
## SECTION: ${name}
<!-- SECTION:${name} START -->
${name}の内容を記載します。
<!-- SECTION:${name} END -->
`).join('\n');
    
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `# ${path.basename(filePath, '.md')}\n${content}`);
    return true;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  for (const sectionName of sectionNames) {
    const startMarker = `<!-- SECTION:${sectionName} START -->`;
    const endMarker = `<!-- SECTION:${sectionName} END -->`;
    
    if (!content.includes(startMarker)) {
      // セクションが存在しない場合は追加
      content += `\n\n## SECTION: ${sectionName}\n${startMarker}\n${sectionName}の内容を記載します。\n${endMarker}\n`;
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
  }
  
  return modified;
}

function replaceSection(md, sectionName, newContent) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(`<!--\\s*SECTION:${esc(sectionName)}\\s*START\\s*-->`);
  const end   = new RegExp(`<!--\\s*SECTION:${esc(sectionName)}\\s*END\\s*-->`);

  if (!start.test(md) || !end.test(md)) {
    return md.trim() + `

## SECTION: ${sectionName}
<!-- SECTION:${sectionName} START -->
${newContent.trim()}
<!-- SECTION:${sectionName} END -->
`;
  }

  return md.replace(
    new RegExp(`(<!--\\s*SECTION:${esc(sectionName)}\\s*START\\s*-->)([\\s\\S]*?)(<!--\\s*SECTION:${esc(sectionName)}\\s*END\\s*-->)`),
    (_, a, _mid, c) => `${a}\n${newContent.trim()}\n${c}`
  );
}

async function run() {
  try {
    console.log(`処理開始: ${notePath}`);
    console.log(`議事録: ${meetingNotes.length}文字`);
    
    // 既存ファイルの準備とセクションマーカーの確認
    const existingFiles = {};
    for (const [stage, files] of Object.entries(FILE_MAPPINGS)) {
      for (const [filePath, sections] of Object.entries(files)) {
        const fullPath = path.join(stage, filePath);
        ensureSectionMarkers(fullPath, sections);
        existingFiles[fullPath] = sections;
      }
    }
    
    // Claudeから更新内容を取得
    const updates = await getClaudeUpdates(existingFiles);
    
    let updatedCount = 0;
    
    // 各ファイルを更新
    for (const [filePath, newContent] of Object.entries(updates)) {
      if (!newContent || typeof newContent !== 'string') continue;
      
      const sections = existingFiles[filePath];
      if (!sections) {
        console.log(`警告: ${filePath} は更新対象ではありません`);
        continue;
      }
      
      let fileContent = fs.readFileSync(filePath, 'utf-8');
      let changed = false;
      
      // 各セクションを更新
      for (const section of sections) {
        const updatedContent = replaceSection(fileContent, section, newContent);
        if (updatedContent !== fileContent) {
          fileContent = updatedContent;
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(filePath, fileContent);
        console.log(`更新: ${filePath}`);
        updatedCount++;
      }
    }
    
    console.log(`完了: ${updatedCount}個のファイルを更新しました`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});