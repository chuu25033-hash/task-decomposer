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
}

// AI再提案で作り直す対象（未完了のAI提案）かどうか
export const isReplaceableByAi = (subtask: Subtask) =>
  subtask.source === "ai" && !subtask.completed;

export interface Task {
  id: string;
  title: string;
  subtasks: Subtask[];
  isDecomposing?: boolean;
}
