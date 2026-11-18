// 型定義

// サブタスクの出どころ
// "ai": AIが提案したもの（未完了なら AI再提案 で作り直される）
// "user": ユーザーが追加・編集したもの（AI再提案 でも消さない）
export type SubtaskSource = "ai" | "user";

// 手順の優先度（AI が付け、ユーザーはバッジのタップで変えられる）
// high: 目標に欠かせない・他の手順の前提になる / medium: 通常 / low: 余裕があれば・後回しでよい
export type SubtaskPriority = "high" | "medium" | "low";
export const SUBTASK_PRIORITIES: readonly SubtaskPriority[] = ["high", "medium", "low"];
export const isSubtaskPriority = (value: unknown): value is SubtaskPriority =>
  typeof value === "string" && (SUBTASK_PRIORITIES as readonly string[]).includes(value);

// AI が生成した手順（API のレスポンス 1 件分）
export interface GeneratedStep {
  title: string;
  priority?: SubtaskPriority;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  // 旧データには無いため、未設定は "user" とみなす（消さない側に倒す）
  source?: SubtaskSource;
  // ユーザーが「採用」したAI提案（AI再提案でも作り直さない）
  kept?: boolean;
  // 優先度（未設定は表示しない。自分で追加した手順や旧データ）
  priority?: SubtaskPriority;
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
