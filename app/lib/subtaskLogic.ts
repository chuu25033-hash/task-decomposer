// サブタスク操作の純粋なロジック（React に依存しないため、単体テストで確認できる）
import { isReplaceableByAi, type Subtask, type Task } from "@/app/types/task";

// AIボタンの動作
// - decompose:  サブタスクが無い → 選択した個数で一から分解
// - regenerate: 未完了のAI提案がある → その個数のまま作り直す（総数を増やさない）
// - append:     AI提案をすべて完了済み → 選択した個数だけ次の手順を追加
export type AiMode = "decompose" | "regenerate" | "append";

// 1回で生成できる最大個数（API 側の上限と合わせる）
export const MAX_AI_COUNT = 10;

export interface AiPlan {
  mode: AiMode;
  count: number;
  // 作り直す（置き換える）AI提案の ID。regenerate のときだけ中身がある
  targetIds: string[];
}

export const getAiPlan = (task: Task, selectedCount: number): AiPlan => {
  if (task.subtasks.length === 0) {
    return { mode: "decompose", count: selectedCount, targetIds: [] };
  }
  const replaceable = task.subtasks.filter(isReplaceableByAi);
  if (replaceable.length > 0) {
    // 上限を超える分は今回は作り直さずに残す（作り直す数と生成する数を揃え、総数を変えない）
    const targets = replaceable.slice(0, MAX_AI_COUNT);
    return { mode: "regenerate", count: targets.length, targetIds: targets.map((s) => s.id) };
  }
  return { mode: "append", count: selectedCount, targetIds: [] };
};

// 指定したAI提案（targetIds）を新しい提案に置き換える
// - 処理中に完了・採用・編集されて置き換え対象でなくなったものは残す
// - 処理中に ⚡ などで増えた、対象外のAI提案も消さない
// 新しい提案は、最初に置き換えたAI提案の位置に入れる（無ければ末尾）
export const replaceAiSubtasks = (
  subtasks: Subtask[],
  generated: Subtask[],
  targetIds: string[]
): Subtask[] => {
  const targets = new Set(targetIds);
  const isTarget = (s: Subtask) => targets.has(s.id) && isReplaceableByAi(s);
  const firstIndex = subtasks.findIndex(isTarget);
  const kept = subtasks.filter((s) => !isTarget(s));
  const insertAt =
    firstIndex === -1
      ? kept.length
      : subtasks.slice(0, firstIndex).filter((s) => !isTarget(s)).length;
  return [...kept.slice(0, insertAt), ...generated, ...kept.slice(insertAt)];
};

// AI再提案を取り消す：追加した提案を取り除き、置き換える前の提案をその位置に戻す
// 追加した提案のうち、その後に完了・採用・編集したもの（置き換え対象でなくなったもの）は進捗として残す
export const restoreReplacedSubtasks = (
  subtasks: Subtask[],
  undo: { removed: Subtask[]; addedIds: string[] }
): Subtask[] => {
  const added = new Set(undo.addedIds);
  const shouldRemove = (s: Subtask) => added.has(s.id) && isReplaceableByAi(s);
  const firstIndex = subtasks.findIndex((s) => added.has(s.id));
  const remaining = subtasks.filter((s) => !shouldRemove(s));
  const remainingIds = new Set(remaining.map((s) => s.id));
  // 処理中に完了にされて残ったものは二重に戻さない
  const restore = undo.removed.filter((s) => !remainingIds.has(s.id));
  const insertAt =
    firstIndex === -1
      ? remaining.length
      : subtasks.slice(0, firstIndex).filter((s) => !shouldRemove(s)).length;
  return [...remaining.slice(0, insertAt), ...restore, ...remaining.slice(insertAt)];
};

// 1つのサブタスクを、細分化した結果に差し替える（対象が消えていたら何もしない）
export const replaceSubtaskWith = (
  subtasks: Subtask[],
  targetId: string,
  generated: Subtask[]
): Subtask[] => {
  const index = subtasks.findIndex((s) => s.id === targetId);
  if (index === -1) return subtasks;
  return [...subtasks.slice(0, index), ...generated, ...subtasks.slice(index + 1)];
};

// サブタスクの並べ替え（direction: -1 で上へ、1 で下へ。端では何もしない）
export const moveSubtaskInList = (
  subtasks: Subtask[],
  subtaskId: string,
  direction: -1 | 1
): Subtask[] => {
  const index = subtasks.findIndex((s) => s.id === subtaskId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= subtasks.length) return subtasks;
  const moved = [...subtasks];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
};
