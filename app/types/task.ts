// 型定義

// サブタスクの出どころ
// "ai": AIが提案したもの（未完了なら AI再提案 で作り直される）
// "user": ユーザーが追加・編集したもの（AI再提案 でも消さない）
export type SubtaskSource = "ai" | "user";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  // 旧データには無いため、未設定は "user" とみなす（消さない側に倒す）
  source?: SubtaskSource;
  // ユーザーが「採用」したAI提案（AI再提案でも作り直さない）
  kept?: boolean;
}

// タスク名・サブタスク名の最大文字数（長すぎる入力で AI の応答が遅く・不安定になるのを防ぐ）
export const MAX_TITLE_LENGTH = 200;

// AI再提案で作り直す対象（未完了で、採用していないAI提案）かどうか
export const isReplaceableByAi = (subtask: Subtask) =>
  subtask.source === "ai" && !subtask.completed && !subtask.kept;

export interface Task {
  id: string;
  title: string;
  subtasks: Subtask[];
  isDecomposing?: boolean;
}
