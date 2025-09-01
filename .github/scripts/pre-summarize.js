import fs from 'fs';
import path from 'path';

// 2段階処理: まず議事録を要約してからClaude APIを使う
export async function preSummarize(meetingNotes) {
  // 構造化された要約を作成
  const summary = {
    decisions: [],      // 決定事項
    requirements: [],   // 要件変更
    schedule: [],       // スケジュール関連
    tasks: [],         // タスク・TODO
    issues: []         // 課題・問題点
  };
  
  const lines = meetingNotes.split('\n');
  let currentSpeaker = '';
  
  for (const line of lines) {
    // 発言者を特定
    const speakerMatch = line.match(/^\d{2}:\d{2}\s+([^:]+):/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
    }
    
    // 決定事項
    if (/決定|決まり|確定|承認/.test(line)) {
      summary.decisions.push(line.substring(0, 100));
    }
    
    // 要件・機能
    if (/機能|要件|仕様|追加|変更|削除/.test(line)) {
      summary.requirements.push(line.substring(0, 100));
    }
    
    // スケジュール
    if (/月|週|日程|納期|期限|スケジュール/.test(line)) {
      summary.schedule.push(line.substring(0, 100));
    }
    
    // タスク
    if (/TODO|タスク|やること|実施|対応/.test(line)) {
      summary.tasks.push(line.substring(0, 100));
    }
    
    // 課題
    if (/課題|問題|懸念|リスク|困って/.test(line)) {
      summary.issues.push(line.substring(0, 100));
    }
  }
  
  // 構造化されたサマリーを作成
  let structuredSummary = '# 議事録要約\n\n';
  
  if (summary.decisions.length > 0) {
    structuredSummary += '## 決定事項\n';
    summary.decisions.slice(0, 5).forEach(d => {
      structuredSummary += `- ${d}\n`;
    });
    structuredSummary += '\n';
  }
  
  if (summary.requirements.length > 0) {
    structuredSummary += '## 要件・機能変更\n';
    summary.requirements.slice(0, 5).forEach(r => {
      structuredSummary += `- ${r}\n`;
    });
    structuredSummary += '\n';
  }
  
  if (summary.schedule.length > 0) {
    structuredSummary += '## スケジュール関連\n';
    summary.schedule.slice(0, 3).forEach(s => {
      structuredSummary += `- ${s}\n`;
    });
    structuredSummary += '\n';
  }
  
  if (summary.issues.length > 0) {
    structuredSummary += '## 課題・懸念事項\n';
    summary.issues.slice(0, 3).forEach(i => {
      structuredSummary += `- ${i}\n`;
    });
  }
  
  return structuredSummary;
}