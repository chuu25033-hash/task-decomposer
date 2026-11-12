// タスクのバックアップ（JSON ファイルへの書き出し・読み込み）と、保存データの検証
// LocalStorage はブラウザのデータ削除や端末の変更で消えるため、ファイルで引き継げるようにする
import { MAX_TITLE_LENGTH, type Subtask, type Task } from "@/app/types/task";

export const BACKUP_FORMAT = "task-decomposer-backup";
export const BACKUP_VERSION = 1;

// 1ファイルで読み込める上限（巨大なファイルで画面が固まるのを防ぐ）
export const MAX_IMPORT_TASKS = 500;
export const MAX_IMPORT_SUBTASKS = 200;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

export interface TaskBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tasks: Task[];
}

export class BackupError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanTitle = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.slice(0, MAX_TITLE_LENGTH) : null;

// ID が無い・重複している場合は振り直す（同じ ID があると React の key や削除処理が壊れる）
const takeId = (value: unknown, usedIds: Set<string>, newId: () => string) => {
  const id = typeof value === "string" && value && !usedIds.has(value) ? value : newId();
  usedIds.add(id);
  return id;
};

const sanitizeSubtask = (
  raw: unknown,
  usedIds: Set<string>,
  newId: () => string
): Subtask | null => {
  if (!isRecord(raw)) return null;
  const title = cleanTitle(raw.title);
  if (!title) return null;
  const subtask: Subtask = {
    id: takeId(raw.id, usedIds, newId),
    title,
    completed: raw.completed === true,
    // 不明な値は "user"（AI再提案で消さない側）に倒す
    source: raw.source === "ai" ? "ai" : "user",
  };
  if (raw.kept === true) subtask.kept = true;
  return subtask;
};

// 保存データ・読み込んだファイルを、アプリで安全に扱える形に整える
// 壊れた要素は捨て、文字数・件数は上限で切り詰める。isDecomposing は復元しない
export const sanitizeTasks = (
  raw: unknown,
  newId: () => string = () => crypto.randomUUID()
): Task[] => {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set<string>();
  const tasks: Task[] = [];
  for (const item of raw.slice(0, MAX_IMPORT_TASKS)) {
    if (!isRecord(item)) continue;
    const title = cleanTitle(item.title);
    if (!title) continue;
    const id = takeId(item.id, usedIds, newId);
    const subtasks = Array.isArray(item.subtasks)
      ? item.subtasks
          .slice(0, MAX_IMPORT_SUBTASKS)
          .map((s) => sanitizeSubtask(s, usedIds, newId))
          .filter((s): s is Subtask => s !== null)
      : [];
    tasks.push({ id, title, subtasks });
  }
  return tasks;
};

export const createBackup = (tasks: Task[], now: Date = new Date()): TaskBackup => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  tasks: stripRuntimeState(tasks),
});

// 保存・書き出し用に、実行中の状態（isDecomposing）を取り除く
// （LocalStorage に残すと、複数タブ間の同期で他のタブに伝わってしまうため）
export const stripRuntimeState = (tasks: Task[]): Task[] =>
  tasks.map(({ id, title, subtasks }) => ({ id, title, subtasks }));

// ファイル名用の日付（例: task-decomposer-2026-11-08.json）
export const backupFileName = (now: Date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `task-decomposer-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
};

// 読み込んだファイルの中身からタスクを取り出す（失敗時は BackupError）
// 書き出したバックアップに加え、LocalStorage の中身をそのまま保存した配列も受け付ける
export const parseBackup = (text: string, newId?: () => string): Task[] => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("JSONとして読み込めませんでした。書き出したファイルを選んでください。");
  }

  let rawTasks: unknown;
  if (Array.isArray(data)) {
    rawTasks = data;
  } else if (isRecord(data) && data.format === BACKUP_FORMAT) {
    if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
      throw new BackupError("新しいバージョンで書き出されたファイルのため読み込めません。");
    }
    rawTasks = data.tasks;
  } else {
    throw new BackupError("TaskDecomposer のバックアップファイルではありません。");
  }

  const tasks = sanitizeTasks(rawTasks, newId);
  if (tasks.length === 0) {
    throw new BackupError("読み込めるタスクがありませんでした。");
  }
  return tasks;
};

// 保存される内容（タイトル・サブタスク）が同じかどうか
const hasSameContent = (a: Task, b: Task) =>
  JSON.stringify(stripRuntimeState([a])) === JSON.stringify(stripRuntimeState([b]));

export interface MergeResult {
  tasks: Task[];
  addedCount: number;
  // 同じ ID で内容が違い、読み込んだ内容で置き換えたタスク数
  updatedCount: number;
  // 同じ ID で内容が違うが、置き換えなかったタスク数（追加のみモード）
  changedCount: number;
  // 同じ ID で内容も同じタスク数
  unchangedCount: number;
}

// 読み込んだタスクを今のタスクに合わせる
// - 新しいタスクは先頭に追加する
// - 同じ ID のタスク（同じバックアップを二度読み込んだ・別の端末で進めた等）は、
//   replaceExisting が true のときだけ読み込んだ内容で置き換える（位置はそのまま）。既定は追加のみ
export const mergeImportedTasks = (
  current: Task[],
  imported: Task[],
  { replaceExisting = false }: { replaceExisting?: boolean } = {},
  newId: () => string = () => crypto.randomUUID()
): MergeResult => {
  const currentById = new Map(current.map((t) => [t.id, t]));
  const replacements = new Map<string, Task>();
  const added: Task[] = [];
  let changedCount = 0;
  let unchangedCount = 0;

  for (const task of imported) {
    const existing = currentById.get(task.id);
    if (!existing) {
      added.push(task);
    } else if (hasSameContent(existing, task)) {
      unchangedCount++;
    } else if (replaceExisting) {
      replacements.set(task.id, task);
    } else {
      changedCount++;
    }
  }

  // 別のタスクとサブタスク ID が衝突すると操作が両方に効いてしまうため振り直す
  // （置き換えられて消えるタスクのサブタスクは衝突の対象にしない）
  const usedSubtaskIds = new Set(
    current.filter((t) => !replacements.has(t.id)).flatMap((t) => t.subtasks.map((s) => s.id))
  );
  const withFreshIds = (task: Task): Task => ({
    ...task,
    subtasks: task.subtasks.map((s) => (usedSubtaskIds.has(s.id) ? { ...s, id: newId() } : s)),
  });

  return {
    tasks: [
      ...added.map(withFreshIds),
      ...current.map((t) => {
        const replacement = replacements.get(t.id);
        // 実行中の状態（AI分解中など）は今のタスクのものを引き継ぐ
        return replacement ? { ...withFreshIds(replacement), isDecomposing: t.isDecomposing } : t;
      }),
    ],
    addedCount: added.length,
    updatedCount: replacements.size,
    changedCount,
    unchangedCount,
  };
};
