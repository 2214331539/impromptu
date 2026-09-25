import type { WritingAssignmentStatus, WritingGrammarStatus, WritingSubmissionStatus } from "../types";

export function countWords(text: string): number {
  let cjk = 0;
  let nonCjk = "";
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      cjk += 1;
      nonCjk += " ";
    } else {
      nonCjk += char;
    }
  }
  const latinWords = nonCjk.match(/[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*/g) || [];
  return cjk + latinWords.length;
}

export const writingAssignmentStatusLabel: Record<WritingAssignmentStatus, string> = {
  draft: "草稿",
  published: "进行中",
  closed: "已关闭",
};

export const writingSubmissionStatusLabel: Record<WritingSubmissionStatus, string> = {
  drafting: "写作中",
  revising: "修改中",
  finalized: "已提交",
};

export const writingGrammarStatusLabel: Record<WritingGrammarStatus, string> = {
  not_applicable: "未启用",
  pending: "检测中",
  completed: "已完成",
  failed: "检测失败",
};

export const writingGrammarHintLabel = {
  off: "关闭",
  after_submit: "提交后检测",
} as const;
