// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskCard, { type TaskCardActions } from "@/app/components/TaskCard";
import type { Task } from "@/app/types/task";

afterEach(cleanup);

const task: Task = {
  id: "t1",
  title: "レポートを提出する",
  subtasks: [
    { id: "s1", title: "テーマを決める", completed: false, source: "ai" },
    { id: "s2", title: "下書きする", completed: false, source: "user" },
  ],
};

const makeActions = (): TaskCardActions => ({
  decompose: vi.fn(),
  breakDown: vi.fn(),
  selectCount: vi.fn(),
  deleteTask: vi.fn(),
  renameTask: vi.fn(),
  addSubtask: vi.fn(),
  toggleSubtask: vi.fn(),
  toggleKeep: vi.fn(),
  moveSubtask: vi.fn(),
  renameSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  undoRegenerate: vi.fn(),
  dismissUndo: vi.fn(),
  dismissError: vi.fn(),
  toggleExpanded: vi.fn(),
  dismissAdoptTip: vi.fn(),
  openHelp: vi.fn(),
  cyclePriority: vi.fn(),
  copyAsText: vi.fn().mockResolvedValue(true),
  toggleReference: vi.fn(),
});

const renderCard = (props: Partial<Parameters<typeof TaskCard>[0]> = {}) => {
  const actions = makeActions();
  render(
    <TaskCard
      task={task}
      selectedCount={5}
      breakingDownIds={[]}
      error={null}
      undo={null}
      showAdoptTip={false}
      isRecentlyAdded={false}
      isExpanded={false}
      isReference={false}
      actions={actions}
      {...props}
    />
  );
  return actions;
};

describe("TaskCard", () => {
  it("未完了のAI提案があるときは AI再提案 になり、個数は残りの数", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /AI再提案/ })).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("⚡ で細分化している間は AI再提案 を押せない", () => {
    const actions = renderCard({ breakingDownIds: ["s2"] });
    const button = screen.getByRole("button", { name: /AI再提案/ });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(actions.decompose).not.toHaveBeenCalled();
  });

  it("AI処理中は ⚡ を押せない", () => {
    renderCard({ task: { ...task, isDecomposing: true } });
    expect(screen.getByLabelText("「下書きする」をAIで細分化")).toHaveProperty("disabled", true);
  });

  it("タスク名はボタンから編集でき、空白を含めたまま呼び出し側に渡す", () => {
    const actions = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "レポートを提出する" }));
    const input = screen.getByLabelText("タスク名");
    fireEvent.change(input, { target: { value: " 期末レポート " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(actions.renameTask).toHaveBeenCalledWith("t1", " 期末レポート ");
  });

  it("手順を追加すると入力欄を空にする（空白だけなら追加しない）", () => {
    const actions = renderCard();
    const input = screen.getByLabelText("「レポートを提出する」に手順を追加") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(actions.addSubtask).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "参考文献を探す" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(actions.addSubtask).toHaveBeenCalledWith("t1", "参考文献を探す");
    expect(input.value).toBe("");
  });

  it("未完了の手順の優先度を件数でまとめて表示する", () => {
    renderCard({
      task: {
        ...task,
        subtasks: [
          { id: "a", title: "A", completed: false, source: "ai", priority: "high" },
          { id: "b", title: "B", completed: false, source: "ai", priority: "high" },
          { id: "c", title: "C", completed: true, source: "ai", priority: "low" },
          { id: "d", title: "D", completed: false, source: "ai", priority: "medium" },
        ],
      },
    });
    const summary = screen.getByText(/番号の順に進めます/);
    expect(summary.textContent).toContain("優先:高 2");
    expect(summary.textContent).toContain("優先:中 1");
    // 完了済みは数えない
    expect(summary.textContent).not.toContain("優先:低");
  });

  it("テキストでコピー・お手本の切り替えを呼び出す", async () => {
    const actions = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /テキストでコピー/ }));
    expect(actions.copyAsText).toHaveBeenCalledWith(task);
    expect(await screen.findByText("コピーしました")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /お手本にする/ }));
    expect(actions.toggleReference).toHaveBeenCalledWith(task);
  });

  it("お手本に設定中のタスクはそれと分かる表示にする", () => {
    renderCard({ isReference: true });
    expect(screen.getByRole("button", { name: /お手本に設定中/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("すべて完了したタスクは折りたたむ", () => {
    renderCard({
      task: { ...task, subtasks: task.subtasks.map((s) => ({ ...s, completed: true })) },
    });
    expect(screen.getByText("すべて完了")).toBeTruthy();
    expect(screen.queryByText("テーマを決める")).toBeNull();
    expect(screen.getByRole("button", { name: /手順を表示/ })).toBeTruthy();
  });
});
