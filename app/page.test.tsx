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
  it("AIが付けた優先度を手順に表示する", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ subtasks: [{ title: "テーマを決める", priority: "high" }, { title: "見出しを書く", priority: "low" }] })
    );
    const card = await addTask("レポートを書く");
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));
    expect(await within(card).findByLabelText("優先度 高（タップで変更）")).toBeTruthy();
    fireEvent.click(within(card).getByLabelText("優先度 低（タップで変更）"));
    expect(within(card).getAllByLabelText("優先度 高（タップで変更）")).toHaveLength(2);
  });

  it("お手本にしたタスクの分け方を、次に一から分解するときに送る", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ subtasks: ["テーマを決める", "見出しを書く"] }));
    const first = await addTask("レポートを書く");
    fireEvent.click(within(first).getByRole("button", { name: /AI分解/ }));
    await within(first).findByText("テーマを決める");
    fireEvent.click(within(first).getByRole("button", { name: /お手本にする/ }));
    expect(screen.getByText(/の分け方に揃えて分解します/)).toBeTruthy();

    const input = screen.getByLabelText("新しいタスク");
    fireEvent.change(input, { target: { value: "発表資料を作る" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const second = await screen.findByRole("article", { name: "発表資料を作る" });
    fireEvent.click(within(second).getByRole("button", { name: /AI分解/ }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).referenceExample).toEqual({
      taskTitle: "レポートを書く",
      subtasks: ["テーマを決める", "見出しを書く"],
    });
    // 再読み込みしても残る
    expect(JSON.parse(localStorage.getItem("task_decomposer_reference")!).taskTitle).toBe("レポートを書く");
  });

  it("入力欄の例をタップすると入力欄に入り、短い入力には案内を出す", async () => {
    render(<Home />);
    const input = (await screen.findByLabelText("新しいタスク")) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "机の上を片付けて勉強できる状態にする" }));
    expect(input.value).toBe("机の上を片付けて勉強できる状態にする");
    fireEvent.change(input, { target: { value: "勉強" } });
    expect(screen.getByRole("status").textContent).toContain("提案がぶれやすく");
  });

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

  it("続けて削除しても、手順とタスクを新しい順に1つずつ戻せる", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ subtasks: ["A", "B"] }));
    let card = await addTask("片付ける");
    fireEvent.click(within(card).getByRole("button", { name: /AI分解/ }));
    await within(card).findByText("A");

    fireEvent.click(within(card).getByLabelText("「A」を削除"));
    fireEvent.click(within(card).getByLabelText("「B」を削除"));
    // 確認ダイアログは出さずにタスクごと削除できる
    fireEvent.click(within(card).getByLabelText("タスク「片付ける」を削除"));
    expect(screen.queryByRole("article", { name: "片付ける" })).toBeNull();
    expect(screen.getByText(/ほか2件も戻せます/)).toBeTruthy();

    const undo = () => fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    undo();
    card = screen.getByRole("article", { name: "片付ける" });
    undo();
    undo();
    const labels = within(card)
      .getAllByRole("checkbox")
      .map((el) => el.getAttribute("aria-label"));
    expect(labels).toEqual(["「A」を完了にする", "「B」を完了にする"]);
    expect(screen.queryByRole("button", { name: "元に戻す" })).toBeNull();
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
