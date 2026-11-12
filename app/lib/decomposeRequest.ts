// POST /api/decompose のリクエスト本文の検証・整形（Route から切り出し、単体テストで確認できるようにする）
import { MAX_TITLE_LENGTH } from "@/app/types/task";

// AI に渡す既存サブタスクの最大件数（多すぎると応答が遅く・不安定になる）
export const MAX_EXISTING_SUBTASKS = 50;
// 受け取る既存サブタスクの最大件数（1タスクに保存できる件数と合わせる。ここから上の件数に絞る）
export const MAX_RECEIVED_SUBTASKS = 200;
export const DEFAULT_COUNT = 5;
export const MIN_COUNT = 1;
export const MAX_COUNT = 10;

export interface DecomposeRequest {
  taskTitle: string;
  count: number;
  existingSubtasks: { title: string; completed: boolean }[];
  // 件数が多くて AI に渡さなかった完了済みの手順の数
  omittedCompletedCount: number;
  rejectedSubtasks: string[];
  focusSubtask?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 不正な本文なら null を返す（taskTitle が無い・空など）
// 長すぎる入力で応答が遅く・不安定になるのを防ぐため、件数と文字数を切り詰める
export const parseDecomposeRequest = (body: unknown): DecomposeRequest | null => {
  if (!isRecord(body)) return null;
  const rawTitle = body.taskTitle;
  if (typeof rawTitle !== "string" || !rawTitle.trim()) return null;

  // 生成個数は 1〜10 に制限（小数は切り捨て）
  const requested = Math.floor(Number(body.count));
  const count = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.max(requested, MIN_COUNT), MAX_COUNT)
    : DEFAULT_COUNT;

  // 既存のサブタスク（補完モード用）
  const allExisting = Array.isArray(body.existingSubtasks)
    ? body.existingSubtasks
        .slice(0, MAX_RECEIVED_SUBTASKS)
        .filter(
          (s): s is { title: string; completed?: unknown } =>
            isRecord(s) && typeof s.title === "string" && s.title.trim() !== ""
        )
        .map((s) => ({
          title: s.title.slice(0, MAX_TITLE_LENGTH),
          completed: s.completed === true,
        }))
    : [];
  const { selected: existingSubtasks, omittedCompletedCount } = selectExistingSubtasks(allExisting);

  // 採用されなかった前回のAI案（AI再提案で、同じ案が返らないようにするため）
  const rejectedSubtasks = Array.isArray(body.rejectedSubtasks)
    ? body.rejectedSubtasks
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .slice(0, MAX_EXISTING_SUBTASKS)
        .map((s) => s.slice(0, MAX_TITLE_LENGTH))
    : [];

  // 細分化したいサブタスク（行き詰まったステップ）
  const focusSubtask =
    typeof body.focusSubtask === "string" && body.focusSubtask.trim()
      ? body.focusSubtask.slice(0, MAX_TITLE_LENGTH)
      : undefined;

  return {
    taskTitle: rawTitle.slice(0, MAX_TITLE_LENGTH),
    count,
    existingSubtasks,
    omittedCompletedCount,
    rejectedSubtasks,
    focusSubtask,
  };
};

// AI に渡す既存のサブタスクを MAX_EXISTING_SUBTASKS 件に絞る
// 未完了の手順（これからの予定）を優先し、残りの枠は「直近」の完了済み（＝リストの後ろの方）で埋める
// 並び順は元のまま保ち、省いた完了済みの件数を返す（プロンプトで「ほかに N 件完了済み」と伝える）
export const selectExistingSubtasks = <T extends { completed: boolean }>(
  subtasks: T[]
): { selected: T[]; omittedCompletedCount: number } => {
  if (subtasks.length <= MAX_EXISTING_SUBTASKS) {
    return { selected: subtasks, omittedCompletedCount: 0 };
  }
  const keep = new Set<number>();
  subtasks.forEach((s, i) => {
    if (!s.completed && keep.size < MAX_EXISTING_SUBTASKS) keep.add(i);
  });
  for (let i = subtasks.length - 1; i >= 0 && keep.size < MAX_EXISTING_SUBTASKS; i--) {
    if (subtasks[i].completed) keep.add(i);
  }
  const selected = subtasks.filter((_, i) => keep.has(i));
  const omittedCompletedCount = subtasks.filter((s, i) => s.completed && !keep.has(i)).length;
  return { selected, omittedCompletedCount };
};

// Gemini の応答テキストを解釈する（JSON が壊れていても例外にせず、空として扱う）
export const parseGeminiOutput = (
  rawText: unknown
): { refusal: "none" | "unethical" | "self_harm"; subtasks: string[] } => {
  if (typeof rawText !== "string") return { refusal: "none", subtasks: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { refusal: "none", subtasks: [] };
  }
  if (!isRecord(parsed)) return { refusal: "none", subtasks: [] };
  const refusal =
    parsed.refusal === "unethical" || parsed.refusal === "self_harm" ? parsed.refusal : "none";
  const subtasks = Array.isArray(parsed.subtasks)
    ? parsed.subtasks
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim().slice(0, MAX_TITLE_LENGTH))
    : [];
  return { refusal, subtasks };
};
