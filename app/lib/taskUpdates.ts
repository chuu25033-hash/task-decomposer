// タスク一覧を更新する純粋関数（page.tsx からは setTasks((prev) => ...) で呼ぶ）
// 常に最新の状態（prev）に対して適用することで、AI処理の結果などとの上書き合いを防ぐ
import { moveSubtaskInList } from "@/app/lib/subtaskLogic";
import { MAX_TITLE_LENGTH, type Subtask, type Task } from "@/app/types/task";

// 前後の空白を除き、上限で切り詰める（空なら null）
export const normalizeTitle = (value: string): string | null => {
  const title = value.trim().slice(0, MAX_TITLE_LENGTH);
  return title ? title : null;
};

const updateTask = (tasks: Task[], taskId: string, fn: (task: Task) => Task): Task[] =>
  tasks.map((task) => (task.id === taskId ? fn(task) : task));

const updateSubtask = (
  tasks: Task[],
  taskId: string,
  subtaskId: string,
  fn: (subtask: Subtask) => Subtask
): Task[] =>
  updateTask(tasks, taskId, (task) => ({
    ...task,
    subtasks: task.subtasks.map((s) => (s.id === subtaskId ? fn(s) : s)),
  }));

// 新しいタスクは先頭に追加する（新しい順）
export const addTask = (tasks: Task[], task: Task): Task[] => [task, ...tasks];

export const removeTask = (tasks: Task[], taskId: string): Task[] =>
  tasks.filter((t) => t.id !== taskId);

// 削除したタスクを元の位置に戻す（「元に戻す」用。既にあれば何もしない）
// 削除時に AI 処理中だった場合でも、戻したタスクが「生成中」のまま固まらないようにする
export const insertTaskAt = (tasks: Task[], task: Task, index: number): Task[] => {
  if (tasks.some((t) => t.id === task.id)) return tasks;
  const at = Math.min(Math.max(index, 0), tasks.length);
  const restored: Task = { id: task.id, title: task.title, subtasks: task.subtasks };
  return [...tasks.slice(0, at), restored, ...tasks.slice(at)];
};

// 削除の履歴（「元に戻す」用。新しいものが末尾）
export type DeletedItem =
  | { kind: "task"; task: Task; index: number }
  | { kind: "subtask"; taskId: string; subtask: Subtask; index: number };

// 削除の履歴の最後の1件を元に戻す
export const restoreDeleted = (tasks: Task[], item: DeletedItem): Task[] =>
  item.kind === "task"
    ? insertTaskAt(tasks, item.task, item.index)
    : insertSubtaskAt(tasks, item.taskId, item.subtask, item.index);

// 削除の前に、元に戻すための情報を作る（対象が見つからなければ null）
export const captureDeletedTask = (tasks: Task[], taskId: string): DeletedItem | null => {
  const index = tasks.findIndex((t) => t.id === taskId);
  return index === -1 ? null : { kind: "task", task: tasks[index], index };
};

export const captureDeletedSubtask = (
  tasks: Task[],
  taskId: string,
  subtaskId: string
): DeletedItem | null => {
  const task = tasks.find((t) => t.id === taskId);
  const index = task?.subtasks.findIndex((s) => s.id === subtaskId) ?? -1;
  return task && index !== -1 ? { kind: "subtask", taskId, subtask: task.subtasks[index], index } : null;
};

export const renameTask = (tasks: Task[], taskId: string, rawTitle: string): Task[] => {
  const title = normalizeTitle(rawTitle);
  if (!title) return tasks;
  return updateTask(tasks, taskId, (task) => ({ ...task, title }));
};

export const setDecomposing = (tasks: Task[], taskId: string, isDecomposing: boolean): Task[] =>
  updateTask(tasks, taskId, (task) => ({ ...task, isDecomposing }));

export const updateSubtasks = (
  tasks: Task[],
  taskId: string,
  fn: (subtasks: Subtask[]) => Subtask[]
): Task[] => updateTask(tasks, taskId, (task) => ({ ...task, subtasks: fn(task.subtasks) }));

export const addSubtask = (tasks: Task[], taskId: string, subtask: Subtask): Task[] =>
  updateSubtasks(tasks, taskId, (subtasks) => [...subtasks, subtask]);

export const removeSubtask = (tasks: Task[], taskId: string, subtaskId: string): Task[] =>
  updateSubtasks(tasks, taskId, (subtasks) => subtasks.filter((s) => s.id !== subtaskId));

// 削除したサブタスクを元の位置に戻す（「元に戻す」用。位置は今の件数に収め、既にあれば何もしない）
export const insertSubtaskAt = (
  tasks: Task[],
  taskId: string,
  subtask: Subtask,
  index: number
): Task[] =>
  updateSubtasks(tasks, taskId, (subtasks) => {
    if (subtasks.some((s) => s.id === subtask.id)) return subtasks;
    const at = Math.min(Math.max(index, 0), subtasks.length);
    return [...subtasks.slice(0, at), subtask, ...subtasks.slice(at)];
  });

export const toggleSubtaskCompleted = (tasks: Task[], taskId: string, subtaskId: string): Task[] =>
  updateSubtask(tasks, taskId, subtaskId, (s) => ({ ...s, completed: !s.completed }));

// AI提案の「採用」を切り替える（採用したものは AI再提案 で作り直さない）
export const toggleSubtaskKept = (tasks: Task[], taskId: string, subtaskId: string): Task[] =>
  updateSubtask(tasks, taskId, subtaskId, (s) => ({ ...s, kept: !s.kept }));

// 内容を変えた AI 提案はユーザーの手順として扱い、AI再提案で消さない
export const renameSubtask = (
  tasks: Task[],
  taskId: string,
  subtaskId: string,
  rawTitle: string
): Task[] => {
  const title = normalizeTitle(rawTitle);
  if (!title) return tasks;
  return updateSubtask(tasks, taskId, subtaskId, (s) =>
    s.title === title ? s : { ...s, title, source: "user" }
  );
};

export const moveSubtask = (
  tasks: Task[],
  taskId: string,
  subtaskId: string,
  direction: -1 | 1
): Task[] =>
  updateSubtasks(tasks, taskId, (subtasks) => moveSubtaskInList(subtasks, subtaskId, direction));
