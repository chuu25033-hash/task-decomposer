// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubtaskRow from "@/app/components/SubtaskRow";
import type { Subtask } from "@/app/types/task";

afterEach(cleanup);

const subtask: Subtask = { id: "s1", title: "テーマを決める", completed: false, source: "ai" };

const setup = (props: Partial<Parameters<typeof SubtaskRow>[0]> = {}) => {
  const handlers = {
    onToggle: vi.fn(),
    onToggleKeep: vi.fn(),
    onBreakDown: vi.fn(),
    onMove: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <SubtaskRow
      subtask={subtask}
      isFirst
      isLast={false}
      isNext
      isBreakingDown={false}
      willBeReplaced={false}
      isTaskBusy={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe("SubtaskRow", () => {
  it("編集して Enter で保存する", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("「テーマを決める」を編集"));
    const input = screen.getByLabelText("手順の名前");
    fireEvent.change(input, { target: { value: "テーマを2つに絞る" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("テーマを2つに絞る");
    expect(screen.queryByLabelText("手順の名前")).toBeNull();
  });

  it("Esc で取り消すと保存しない（フォーカスが外れても）", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("「テーマを決める」を編集"));
    const input = screen.getByLabelText("手順の名前");
    fireEvent.change(input, { target: { value: "別の名前" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("手順の名前")).toBeNull();
  });

  it("フォーカスが外れたら保存する", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("「テーマを決める」を編集"));
    const input = screen.getByLabelText("手順の名前");
    fireEvent.change(input, { target: { value: "書き出す" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("書き出す");
  });

  it("日本語入力の変換確定の Enter では保存しない", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("「テーマを決める」を編集"));
    const input = screen.getByLabelText("手順の名前");
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("タスクが AI 処理中は ⚡ と採用の切り替えを押せない", () => {
    const { onBreakDown, onToggleKeep } = setup({ isTaskBusy: true });
    const bolt = screen.getByLabelText("「テーマを決める」をAIで細分化");
    expect(bolt).toHaveProperty("disabled", true);
    fireEvent.click(bolt);
    fireEvent.click(screen.getByText("AI"));
    expect(onBreakDown).not.toHaveBeenCalled();
    expect(onToggleKeep).not.toHaveBeenCalled();
  });

  it("チェックボックスに手順名つきのラベルがある", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByLabelText("「テーマを決める」を完了にする"));
    expect(onToggle).toHaveBeenCalled();
  });
});
