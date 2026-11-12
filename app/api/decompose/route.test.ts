import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/decompose/route";
import { ERROR_CODES, GEMINI_MODELS } from "@/app/lib/gemini";

// Gemini への fetch を差し替えて、フォールバック・拒否・タイムアウトを確認する
const mockFetch = vi.fn();
let ip = 0;

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// テストごとに別の IP にして、回数制限の影響を受けないようにする
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://app.test/api/decompose", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://app.test",
      host: "app.test",
      "x-forwarded-for": `10.0.0.${++ip}`,
      "x-gemini-api-key": "test-key",
      ...headers,
    },
    body: JSON.stringify(body),
  });

const geminiOk = (output: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }),
    { status: 200 }
  );

describe("POST /api/decompose", () => {
  it("生成結果を返し、指定より多ければ切り詰める", async () => {
    mockFetch.mockResolvedValue(geminiOk({ refusal: "none", subtasks: ["a", "b", "c"] }));
    const res = await POST(request({ taskTitle: "掃除", count: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subtasks: ["a", "b"] });
    // キーは URL ではなくヘッダーで渡す
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).not.toContain("test-key");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
  });

  it("1つ目のモデルが 503 なら次のモデルで再試行する", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(geminiOk({ refusal: "none", subtasks: ["a"] }));
    const res = await POST(request({ taskTitle: "掃除" }));
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[1][0]).toContain(GEMINI_MODELS[1]);
  });

  it("APIキーが無効ならすぐに 401 を返す", async () => {
    mockFetch.mockResolvedValue(new Response("API_KEY_INVALID", { status: 400 }));
    const res = await POST(request({ taskTitle: "掃除" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe(ERROR_CODES.INVALID_API_KEY);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("倫理に反するタスクは 422 で拒否する（自傷は別のコード）", async () => {
    mockFetch.mockResolvedValue(geminiOk({ refusal: "self_harm", subtasks: [] }));
    const res = await POST(request({ taskTitle: "x" }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe(ERROR_CODES.TASK_REFUSED_SELF_HARM);
  });

  it("すべてのモデルが 429 なら RATE_LIMITED を返す", async () => {
    mockFetch.mockImplementation(async () => new Response("quota", { status: 429 }));
    const res = await POST(request({ taskTitle: "掃除" }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe(ERROR_CODES.RATE_LIMITED);
  });

  it("応答しないモデルはタイムアウトで打ち切り、最後は 504 を返す", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        })
    );
    const pending = POST(request({ taskTitle: "掃除" }));
    await vi.advanceTimersByTimeAsync(14_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(mockFetch).toHaveBeenCalledTimes(GEMINI_MODELS.length);
  });

  it("壊れた JSON の応答は次のモデルへ回す", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{broken" }] } }] }))
      )
      .mockResolvedValueOnce(geminiOk({ refusal: "none", subtasks: ["a"] }));
    const res = await POST(request({ taskTitle: "掃除" }));
    expect(await res.json()).toEqual({ subtasks: ["a"] });
  });

  it("入力が不正なら 400、キーが無ければ 401、別サイトからは 403", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ taskTitle: "x" }, { "x-gemini-api-key": "" }))).status).toBe(401);
    expect((await POST(request({ taskTitle: "x" }, { origin: "https://evil.test" }))).status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("同じ呼び出し元から短時間に呼びすぎると 429（TOO_MANY_REQUESTS）", async () => {
    mockFetch.mockImplementation(async () => geminiOk({ refusal: "none", subtasks: ["a"] }));
    const headers = { "x-forwarded-for": "192.168.0.1" };
    let last: Response | undefined;
    for (let i = 0; i < 21; i++) last = await POST(request({ taskTitle: "x" }, headers));
    expect(last?.status).toBe(429);
    expect((await last!.json()).code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
  });
});
