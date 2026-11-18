// お手本（「さっきのように出力して」）
// 発表会で「前のような出力、のように出力データを裏で保存できた方がよい」との指摘があった。
// 気に入った分解を1件だけお手本として保存し、次に一から分解するときに AI に渡して、粒度・書き方を揃える
import { MAX_REFERENCE_STEPS, parseReferenceExample, type ReferenceExample } from "@/app/lib/decomposeRequest";
import { readStorage, removeStorage, writeStorage } from "@/app/lib/safeStorage";
import type { Task } from "@/app/types/task";

export const REFERENCE_STORAGE_KEY = "task_decomposer_reference";

// お手本として保存する内容（どのタスクから作ったかを表示・判定するため taskId も持つ）
export interface StoredReference extends ReferenceExample {
  taskId: string;
}

// タスクからお手本を作る（手順が無ければ null）。その時点の内容を写しておくため、元のタスクを消しても使える
export const createReference = (task: Task): StoredReference | null => {
  const example = parseReferenceExample({
    taskTitle: task.title,
    subtasks: task.subtasks.slice(0, MAX_REFERENCE_STEPS).map((s) => s.title),
  });
  return example ? { taskId: task.id, ...example } : null;
};

export const loadReference = (): StoredReference | null => {
  const raw = readStorage(REFERENCE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    const example = parseReferenceExample(data);
    const taskId = (data as { taskId?: unknown }).taskId;
    return example && typeof taskId === "string" ? { taskId, ...example } : null;
  } catch {
    return null;
  }
};

export const saveReference = (reference: StoredReference) =>
  writeStorage(REFERENCE_STORAGE_KEY, JSON.stringify(reference));

export const clearReference = () => removeStorage(REFERENCE_STORAGE_KEY);
