import { describe, expect, it } from "vitest";
import {
  addTask,
  normalizeTitle,
  removeSubtask,
  renameSubtask,
  renameTask,
  toggleSubtaskCompleted,
  toggleSubtaskKept,
} from "@/app/lib/taskUpdates";
import { MAX_TITLE_LENGTH, type Task } from "@/app/types/task";

const tasks: Task[] = [
  {
    id: "t1",
    title: "レポート",
    subtasks: [
      { id: "s1", title: "テーマを決める", completed: false, source: "ai" },
      { id: "s2", title: "下書きする", completed: false, source: "user" },
    ],
  },
  { id: "t2", title: "掃除", subtasks: [] },
];

describe("normalizeTitle", () => {
  it("前後の空白を除き、空なら null を返す", () => {
    expect(normalizeTitle("  レポート  ")).toBe("レポート");
    expect(normalizeTitle("   ")).toBeNull();
  });

  it("上限の文字数で切り詰める", () => {
    expect(normalizeTitle("あ".repeat(MAX_TITLE_LENGTH + 5))).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe("タスクの更新", () => {
  it("新しいタスクは先頭に追加する", () => {
    expect(addTask(tasks, { id: "t3", title: "新規", subtasks: [] }).map((t) => t.id)).toEqual([
      "t3",
      "t1",
      "t2",
    ]);
  });

  it("タスク名は空白を除いて保存し、空なら変えない", () => {
    expect(renameTask(tasks, "t2", "  部屋の掃除 ")[1].title).toBe("部屋の掃除");
    expect(renameTask(tasks, "t2", "  ")).toBe(tasks);
  });
});

describe("サブタスクの更新", () => {
  it("AI提案の内容を変えるとユーザーの手順になる", () => {
    const result = renameSubtask(tasks, "t1", "s1", " テーマを2つに絞る ");
    expect(result[0].subtasks[0]).toMatchObject({ title: "テーマを2つに絞る", source: "user" });
  });

  it("内容が変わらなければ AI提案のまま", () => {
    const result = renameSubtask(tasks, "t1", "s1", "テーマを決める ");
    expect(result[0].subtasks[0].source).toBe("ai");
  });

  it("完了・採用の切り替えと削除は対象だけに効く", () => {
    const toggled = toggleSubtaskCompleted(tasks, "t1", "s2");
    expect(toggled[0].subtasks.map((s) => s.completed)).toEqual([false, true]);
    expect(toggleSubtaskKept(tasks, "t1", "s1")[0].subtasks[0].kept).toBe(true);
    expect(removeSubtask(tasks, "t1", "s1")[0].subtasks.map((s) => s.id)).toEqual(["s2"]);
    // 元の配列は変更しない
    expect(tasks[0].subtasks).toHaveLength(2);
  });
});
