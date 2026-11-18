// タスクをテキスト（Markdown のチェックリスト）にする
// 他のアプリ（メモ・ToDo・チャットなど）へ貼り付けて使えるようにするため。
// 「- [ ] 」形式は多くのメモ・ToDo アプリでチェックボックスとして読み込める
import type { SubtaskPriority, Task } from "@/app/types/task";

export const PRIORITY_LABELS: Record<SubtaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const formatTaskAsText = (task: Task): string => {
  const lines = task.subtasks.map((s) => {
    const priority = s.priority ? `（優先度: ${PRIORITY_LABELS[s.priority]}）` : "";
    return `- [${s.completed ? "x" : " "}] ${s.title}${priority}`;
  });
  return [`## ${task.title}`, ...lines].join("\n");
};
