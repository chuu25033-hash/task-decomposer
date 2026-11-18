// タスク入力の案内
// 発表会で「入力（プロンプト）によって提案の振れ幅がある」と指摘された。
// AI の出力の質は入力の具体さに左右されるため、書き方のコツと例を示し、短すぎる入力などにはその場で気づけるようにする

// 入力例（タップで入力欄に入る）。「何を」「どこまで」が入った書き方の見本
export const TASK_INPUT_EXAMPLES = [
  "英語のレポート（2000字）を金曜までに書く",
  "机の上を片付けて勉強できる状態にする",
  "基本情報技術者試験の勉強を始める",
];

// これより短い入力は、何をどこまでやるのかが AI に伝わりにくい
export const SHORT_INPUT_LENGTH = 6;

// 入力中に表示する注意（問題なければ null）
export const getTaskInputHint = (raw: string): string | null => {
  const title = raw.trim();
  if (!title) return null;
  if ([...title].length < SHORT_INPUT_LENGTH) {
    return "短い入力だと提案がぶれやすくなります。「何を」「どこまで」を足すと安定します（例: レポート → 英語のレポートを2000字書く）";
  }
  // 「、」が2つ以上・全角の「／」は、複数のタスクをまとめて書いている可能性が高い
  // （半角の / は「11/20」のような日付に使われるため見ない）
  const separators = (title.match(/、/g) ?? []).length;
  if (separators >= 2 || title.includes("／")) {
    return "複数のタスクが含まれているかもしれません。1つずつ追加すると、それぞれに合った手順になります";
  }
  return null;
};
