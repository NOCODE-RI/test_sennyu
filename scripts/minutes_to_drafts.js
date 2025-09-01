#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function ensureAppendSection(filePath, header, contentLines) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const markerStart = `\n<!-- AI-DRAFT: ${header} START -->\n`;
  const markerEnd = `\n<!-- AI-DRAFT: ${header} END -->\n`;
  // Remove existing same-header block if any
  const cleaned = original.replace(new RegExp(`${markerStart}[\s\S]*?${markerEnd}`,'g'), '');
  const block = `${markerStart}${contentLines.join('\n')}${markerEnd}`;
  const next = cleaned.trimEnd() + block;
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function appendDraftsForNegotiation(minutesPath) {
  const dateHint = path.basename(minutesPath).replace(/\.(md|txt)$/i, '');
  const header = `商談議事録由来: ${dateHint}`;
  const content = [
    `\n## AI下書き（商談議事録: ${dateHint}）`,
    '',
    '> このセクションは自動生成の下書きです。内容を精査して不要なら削除してください。',
    '- 抽出要件: （AI追記予定）',
    '- 想定優先度: （AI追記予定）',
    '- メモ/論点: （AI追記予定）',
  ];
  const targets = [
    '00_商談段階/01_機能一覧/機能一覧.md',
    '00_商談段階/02_見積もり/初期見積もり.md',
    '00_商談段階/03_NA整理/NA一覧.md',
    // 共通（商談で決まった前提や概要を下書き反映）
    '90_共通/01_プロジェクト/プロジェクト概要.md',
  ];
  let touched = [];
  for (const rel of targets) {
    const fp = path.resolve(process.cwd(), rel);
    const ok = ensureAppendSection(fp, header, content);
    if (ok) touched.push(rel);
  }
  return touched;
}

function appendDraftsForRequirements(minutesPath) {
  const dateHint = path.basename(minutesPath).replace(/\.(md|txt)$/i, '');
  const header = `要件定義議事録由来: ${dateHint}`;
  const content = [
    `\n## AI下書き（要件定義議事録: ${dateHint}）`,
    '',
    '> このセクションは自動生成の下書きです。内容を精査して不要なら削除してください。',
    '- 追加/変更点: （AI追記予定）',
    '- 受入条件（案）: （AI追記予定）',
    '- 影響範囲: （AI追記予定）',
  ];
  const targets = [
    '10_要件定義段階/01_機能詳細/機能詳細.md',
    '10_要件定義段階/02_ページ設計/ページ一覧.md',
    '10_要件定義段階/03_データベース/DB概要.md',
    '10_要件定義段階/04_通知要件/通知一覧.md',
    '10_要件定義段階/05_NA整理/NA更新解決状況.md',
    '10_要件定義段階/06_見積もり/詳細見積もり.md',
    // 実装段階（テスト観点の下書き）
    '20_実装段階/02_テスト/01_単体テストケース.md',
    '20_実装段階/02_テスト/02_結合テストケース.md',
    // 共通（要件確定版の概要反映）
    '90_共通/01_プロジェクト/プロジェクト概要.md',
  ];
  let touched = [];
  for (const rel of targets) {
    const fp = path.resolve(process.cwd(), rel);
    const ok = ensureAppendSection(fp, header, content);
    if (ok) touched.push(rel);
  }
  return touched;
}

function main() {
  const changed = (process.env.CHANGED_MINUTES || '').trim();
  if (!changed) {
    console.log('No CHANGED_MINUTES provided. Skip.');
    return;
  }
  const files = changed.split('\n').filter(Boolean);
  let allTouched = [];
  for (const f of files) {
    if (f.startsWith('00_商談段階/04_議事録/')) {
      allTouched.push(...appendDraftsForNegotiation(f));
    } else if (f.startsWith('10_要件定義段階/07_議事録/')) {
      allTouched.push(...appendDraftsForRequirements(f));
    }
  }
  // Stage changes (git is available in runner)
  const { execSync } = require('child_process');
  if (allTouched.length > 0) {
    try {
      execSync(`git add ${allTouched.map(p=>`"${p}"`).join(' ')}` , { stdio: 'inherit' });
      console.log('Staged updated files:', allTouched);
    } catch (e) {
      console.error('Failed to stage files', e);
      process.exit(1);
    }
  } else {
    console.log('No target files found to update.');
  }
}

main();
