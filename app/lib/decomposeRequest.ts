// POST /api/decompose のリクエスト本文の検証・整形（Route から切り出し、単体テストで確認できるようにする）
import { MAX_TITLE_LENGTH } from "@/app/types/task";

// AI に渡す既存サブタスクの最大件数
export const MAX_EXISTING_SUBTASKS = 50;
export const DEFAULT_COUNT = 5;
export const MIN_COUNT = 1;
export const MAX_COUNT = 10;

export interface DecomposeRequest {
  taskTitle: string;
  count: number;
  existingSubtasks: { title: string; completed: boolean }[];
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
  const existingSubtasks = Array.isArray(body.existingSubtasks)
    ? body.existingSubtasks
        .filter(
          (s): s is { title: string; completed?: unknown } =>
            isRecord(s) && typeof s.title === "string" && s.title.trim() !== ""
        )
        .slice(0, MAX_EXISTING_SUBTASKS)
        .map((s) => ({
          title: s.title.slice(0, MAX_TITLE_LENGTH),
          completed: s.completed === true,
        }))
    : [];

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
    rejectedSubtasks,
    focusSubtask,
  };
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
