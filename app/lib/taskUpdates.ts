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
