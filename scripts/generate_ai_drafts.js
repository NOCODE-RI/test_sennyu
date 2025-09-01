#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
if (!CLAUDE_API_KEY) {
  console.log('CLAUDE_API_KEY is not set. Skip generation.');
  process.exit(0);
}

async function callClaude(systemPrompt, userPrompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Claude API error: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  const content = (data.content && data.content[0] && data.content[0].text) || '';
  return content.trim();
}

function readText(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function upsertDraftBlock(filePath, header, bodyMarkdown) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const markerStart = `\n<!-- AI-DRAFT: ${header} START -->\n`;
  const markerEnd = `\n<!-- AI-DRAFT: ${header} END -->\n`;
  const newBlock = `${markerStart}${bodyMarkdown}\n${markerEnd}`;
  let next;
  if (original.includes(markerStart)) {
    next = original.replace(new RegExp(`${markerStart}[\s\S]*?${markerEnd}`,'m'), newBlock);
  } else {
    next = original.trimEnd() + newBlock;
  }
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function updateFunctionList(filePath, newContent) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  
  // 機能要件一覧（表）セクションを特定して置換
  const tableStart = '## 機能要件一覧（表）';
  const tableEnd = '## 優先度（任意）';
  
  if (original.includes(tableStart) && original.includes(tableEnd)) {
    const beforeTable = original.substring(0, original.indexOf(tableStart));
    const afterTable = original.substring(original.indexOf(tableEnd));
    
    const updatedContent = beforeTable + newContent + afterTable;
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    return true;
  }
  
  return false;
}

async function generateForNegotiation(minutesPath) {
  const minutes = readText(minutesPath);
  if (!minutes) return { touched: [] };
  const dateHint = path.basename(minutesPath).replace(/\.(md|txt)$/i, '');
  const header = `商談議事録由来: ${dateHint}`;
  
  // 既存の各ドキュメントを読み込む
  const targets = [
    '00_商談段階/01_機能一覧/機能一覧.md',
    '00_商談段階/02_見積もり/初期見積もり.md',
    '00_商談段階/03_NA整理/NA一覧.md',
    '90_共通/01_プロジェクト/プロジェクト概要.md',
  ];
  
  const existingContents = {};
  for (const rel of targets) {
    const fp = path.resolve(process.cwd(), rel);
    existingContents[rel] = readText(fp);
  }
  
  const systemPrompt = 'あなたは要件整理の専門家です。既存のドキュメントと新しい議事録を照らし合わせて、機能一覧の表を完全に書き換えてください。既存内容を参考にしつつ、議事録の内容に基づいて最新の機能一覧表を作成してください。表はMarkdown形式で、機能名/権限/内容/補足/該当ページの列構成を維持してください。';
  const userPrompt = `既存のドキュメント内容:\n\n機能一覧.md:\n${existingContents['00_商談段階/01_機能一覧/機能一覧.md']}\n\n初期見積もり.md:\n${existingContents['00_商談段階/02_見積もり/初期見積もり.md']}\n\nNA一覧.md:\n${existingContents['00_商談段階/03_NA整理/NA一覧.md']}\n\n新しい議事録:\n\n${minutes}\n\n出力: 議事録の内容に基づいて、機能要件一覧（表）セクションを完全に書き換えてください。既存の例は削除し、議事録で確認された機能のみを含めてください。表は以下の形式で出力してください：\n\n## 機能要件一覧（表）\n\n| 機能名 | 権限 | 内容 | 補足 | 該当ページ |\n|--------|------|------|------|------------|\n| [実際の機能名] | [権限] | [内容] | [補足] | [該当ページ] |`;
  
  const md = await callClaude(systemPrompt, userPrompt);
  
  const touched = [];
  
  // 機能一覧.mdは表部分を直接更新
  const functionListPath = path.resolve(process.cwd(), '00_商談段階/01_機能一覧/機能一覧.md');
  if (updateFunctionList(functionListPath, md)) {
    touched.push('00_商談段階/01_機能一覧/機能一覧.md');
  }
  
  // その他のファイルは従来通り追記
  const otherTargets = [
    '00_商談段階/02_見積もり/初期見積もり.md',
    '00_商談段階/03_NA整理/NA一覧.md',
    '90_共通/01_プロジェクト/プロジェクト概要.md',
  ];
  
  for (const rel of otherTargets) {
    const fp = path.resolve(process.cwd(), rel);
    if (upsertDraftBlock(fp, header, `\n## AI下書き（商談議事録: ${dateHint}）\n\n${md}`)) touched.push(rel);
  }
  
  return { touched };
}

async function generateForRequirements(minutesPath) {
  const minutes = readText(minutesPath);
  if (!minutes) return { touched: [] };
  const dateHint = path.basename(minutesPath).replace(/\.(md|txt)$/i, '');
  const header = `要件定義議事録由来: ${dateHint}`;
  
  // 既存の各ドキュメントを読み込む
  const targets = [
    '10_要件定義段階/01_機能詳細/機能詳細.md',
    '10_要件定義段階/02_ページ設計/ページ一覧.md',
    '10_要件定義段階/03_データベース/DB概要.md',
    '10_要件定義段階/04_通知要件/通知一覧.md',
    '10_要件定義段階/05_NA整理/NA更新解決状況.md',
    '10_要件定義段階/06_見積もり/詳細見積もり.md',
    '20_実装段階/02_テスト/01_単体テストケース.md',
    '20_実装段階/02_テスト/02_結合テストケース.md',
    '90_共通/01_プロジェクト/プロジェクト概要.md',
  ];
  
  const existingContents = {};
  for (const rel of targets) {
    const fp = path.resolve(process.cwd(), rel);
    existingContents[rel] = readText(fp);
  }
  
  const systemPrompt = 'あなたは要件定義/テスト設計の専門家です。既存のドキュメントと新しい議事録を照らし合わせて、追加・更新すべき内容を提案します。重複を避け、既存内容を補完・更新する形で日本語Markdownで出力します。各出力は見出しを付与。過度な仮定は避ける。';
  const userPrompt = `既存のドキュメント内容:\n\n機能詳細.md:\n${existingContents['10_要件定義段階/01_機能詳細/機能詳細.md']}\n\nページ一覧.md:\n${existingContents['10_要件定義段階/02_ページ設計/ページ一覧.md']}\n\nDB概要.md:\n${existingContents['10_要件定義段階/03_データベース/DB概要.md']}\n\n通知一覧.md:\n${existingContents['10_要件定義段階/04_通知要件/通知一覧.md']}\n\nNA更新解決状況.md:\n${existingContents['10_要件定義段階/05_NA整理/NA更新解決状況.md']}\n\n詳細見積もり.md:\n${existingContents['10_要件定義段階/06_見積もり/詳細見積もり.md']}\n\n新しい議事録:\n\n${minutes}\n\n出力: 既存内容を考慮して、1) 機能詳細への変更・追加点(受入条件案含む)、2) ページ一覧への追加/変更、3) DB概要への変更、4) 通知一覧への追加/変更、5) NA更新(状態/担当/期限/受入条件案)、6) 詳細見積もりへの影響(工数/コスト/スケジュール)を提案してください。既存のものと重複せず、更新が必要な部分は明確に示してください。`;
  
  const md = await callClaude(systemPrompt, userPrompt);
  
  const touched = [];
  for (const rel of targets) {
    const fp = path.resolve(process.cwd(), rel);
    if (upsertDraftBlock(fp, header, `\n## AI下書き（要件定義議事録: ${dateHint}）\n\n${md}`)) touched.push(rel);
  }
  return { touched };
}

async function main() {
  const changed = (process.env.CHANGED_MINUTES || '').trim();
  if (!changed) { console.log('No CHANGED_MINUTES provided.'); return; }
  const files = changed.split('\n').filter(Boolean);
  let touched = [];
  for (const f of files) {
    if (f.startsWith('00_商談段階/04_議事録/')) {
      const r = await generateForNegotiation(f);
      touched.push(...r.touched);
    } else if (f.startsWith('10_要件定義段階/07_議事録/')) {
      const r = await generateForRequirements(f);
      touched.push(...r.touched);
    }
  }
  if (touched.length) {
    const { execSync } = require('child_process');
    execSync(`git add ${touched.map(p=>`"${p}"`).join(' ')}`, { stdio: 'inherit' });
    console.log('Staged AI updates for:', touched);
  } else {
    console.log('No targets updated.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
