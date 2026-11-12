// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TASKS_KEY, useStoredTasks } from "@/app/hooks/useStoredTasks";
import type { Task } from "@/app/types/task";

const sample: Task[] = [{ id: "t1", title: "レポート", subtasks: [] }];

beforeEach(() => {
  localStorage.clear();
  // 新しい順への並べ替えは済んでいる扱いにする
  localStorage.setItem("task_decomposer_task_order", "newest-first");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStoredTasks", () => {
  it("保存されたタスクを復元し、変更を保存する（実行中の状態は保存しない）", async () => {
    localStorage.setItem(TASKS_KEY, JSON.stringify(sample));
    const { result } = renderHook(() => useStoredTasks());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.tasks.map((t) => t.id)).toEqual(["t1"]);

    act(() => result.current.setTasks((prev) => [{ ...prev[0], isDecomposing: true, title: "新" }]));
    const saved = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(saved[0].title).toBe("新");
    expect(saved[0]).not.toHaveProperty("isDecomposing");
  });

  it("他のタブでの変更を反映する（このタブで分解中の表示は保つ）", async () => {
    localStorage.setItem(TASKS_KEY, JSON.stringify(sample));
    const { result } = renderHook(() => useStoredTasks());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => result.current.setTasks((prev) => [{ ...prev[0], isDecomposing: true }]));

    const fromOtherTab: Task[] = [{ id: "t1", title: "別タブで変更", subtasks: [] }];
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: TASKS_KEY, newValue: JSON.stringify(fromOtherTab) })
      );
    });
    expect(result.current.tasks[0]).toMatchObject({ title: "別タブで変更", isDecomposing: true });
  });

  it("保存に失敗したら saveFailed を立て、画面は落とさない", async () => {
    const { result } = renderHook(() => useStoredTasks());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    act(() => result.current.setTasks(sample));
    expect(result.current.saveFailed).toBe(true);
  });

  it("壊れた保存データでも空の一覧で起動する", async () => {
    localStorage.setItem(TASKS_KEY, "{broken");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useStoredTasks());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.tasks).toEqual([]);
  });
});
