// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

// 画面全体を通した操作のテスト（/api/decompose は fetch を差し替える）
const mockFetch = vi.fn();

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("task_decomposer_task_order", "newest-first");
  // ヒントは出さない
  localStorage.setItem("task_decomposer_adopt_tip_dismissed", "1");
  localStorage.setItem(
    "task_decomposer_gemini_api_key",
    JSON.stringify({ key: "test-key", expiresAt: Date.now() + 60_000 })
  );
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// 画面を表示してタスクを1つ追加し、そのカードを返す
const addTask = async (title: string) => {
  render(<Home />);
  const input = await screen.findByLabelText("新しいタスク");
  fireEvent.change(input, { target: { value: title } });
  fireEvent.keyDown(input, { key: "Enter" });
  // 前後の空白は保存時に取り除かれる
  return screen.findByRole("article", { name: title.trim() });
};

describe("Home", () => {
  it("タスクを追加して AI分解すると、手順が表示され保存される", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ subtasks: ["机の上を片付ける", "ノートを開く"] }));
    const card = await addTask("  レポートを書く  ");

    fireEvent.click(within(card).getByRole("button", { name: "1個" }));
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));

    expect(await within(card).findByText("机の上を片付ける")).toBeTruthy();
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ taskTitle: "レポートを書く", count: 1 });
    expect(init.headers["x-gemini-api-key"]).toBe("test-key");

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("task_decomposer_tasks")!);
      expect(saved[0].subtasks).toHaveLength(2);
    });
  });

  it("手順を削除しても「元に戻す」で元の位置に戻せる", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ subtasks: ["A", "B"] }));
    const card = await addTask("掃除する");
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));
    await within(card).findByText("A");

    fireEvent.click(within(card).getByLabelText("「A」を削除"));
    expect(within(card).queryByText("A")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));

    const titles = within(card)
      .getAllByRole("checkbox")
      .map((el) => el.getAttribute("aria-label"));
    expect(titles).toEqual(["「A」を完了にする", "「B」を完了にする"]);
  });

  it("AI の失敗はカード内に表示し、分解中の状態を解除する", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "x", code: "RATE_LIMITED" }, 429));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const card = await addTask("勉強する");
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));

    expect(await within(card).findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("無料枠の利用上限")
    );
    expect(within(card).getByRole("button", { name: /AI分解/ })).toHaveProperty("disabled", false);
  });

  it("応答が返らないときは一定時間で打ち切り、分解中のままにしない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // signal が中断されるまで返らない fetch
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const card = await addTask("旅行の準備");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));
    expect(within(card).getByRole("button", { name: /生成中/ })).toBeTruthy();

    await vi.advanceTimersByTimeAsync(21_000);
    expect(await within(card).findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("時間がかかりすぎた")
    );
    expect(within(card).getByRole("button", { name: /AI分解/ })).toBeTruthy();
  });
});
