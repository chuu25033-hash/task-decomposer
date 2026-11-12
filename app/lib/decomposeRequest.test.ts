import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MAX_EXISTING_SUBTASKS,
  parseDecomposeRequest,
  parseGeminiOutput,
} from "@/app/lib/decomposeRequest";
import { MAX_TITLE_LENGTH } from "@/app/types/task";

describe("parseDecomposeRequest", () => {
  it("taskTitle が無い・空・文字列でない本文は不正とする", () => {
    expect(parseDecomposeRequest(null)).toBeNull();
    expect(parseDecomposeRequest("text")).toBeNull();
    expect(parseDecomposeRequest({})).toBeNull();
    expect(parseDecomposeRequest({ taskTitle: "   " })).toBeNull();
    expect(parseDecomposeRequest({ taskTitle: 123 })).toBeNull();
  });

  it("最小限の本文では既定値を補う", () => {
    expect(parseDecomposeRequest({ taskTitle: "部屋を片付ける" })).toEqual({
      taskTitle: "部屋を片付ける",
      count: DEFAULT_COUNT,
      existingSubtasks: [],
      rejectedSubtasks: [],
      focusSubtask: undefined,
    });
  });

  it("個数は 1〜10 に収める", () => {
    const countOf = (count: unknown) => parseDecomposeRequest({ taskTitle: "x", count })?.count;
    expect(countOf(3)).toBe(3);
    expect(countOf(100)).toBe(MAX_COUNT);
    expect(countOf(2.7)).toBe(2);
    expect(countOf("abc")).toBe(DEFAULT_COUNT);
    expect(countOf(-1)).toBe(DEFAULT_COUNT);
  });

  it("長すぎる入力は文字数・件数を切り詰める", () => {
    const long = "あ".repeat(MAX_TITLE_LENGTH + 100);
    const result = parseDecomposeRequest({
      taskTitle: long,
      focusSubtask: long,
      existingSubtasks: Array.from({ length: MAX_EXISTING_SUBTASKS + 5 }, () => ({
        title: long,
        completed: true,
      })),
      rejectedSubtasks: Array.from({ length: MAX_EXISTING_SUBTASKS + 5 }, () => long),
    });
    expect(result?.taskTitle).toHaveLength(MAX_TITLE_LENGTH);
    expect(result?.focusSubtask).toHaveLength(MAX_TITLE_LENGTH);
    expect(result?.existingSubtasks).toHaveLength(MAX_EXISTING_SUBTASKS);
    expect(result?.existingSubtasks[0].title).toHaveLength(MAX_TITLE_LENGTH);
    expect(result?.rejectedSubtasks).toHaveLength(MAX_EXISTING_SUBTASKS);
  });

  it("不正な要素は取り除き、completed は true のときだけ完了扱いにする", () => {
    const result = parseDecomposeRequest({
      taskTitle: "x",
      existingSubtasks: [null, { title: "" }, { title: "a", completed: "true" }, { title: "b", completed: true }],
      rejectedSubtasks: ["", 1, "前回の案"],
      focusSubtask: "  ",
    });
    expect(result?.existingSubtasks).toEqual([
      { title: "a", completed: false },
      { title: "b", completed: true },
    ]);
    expect(result?.rejectedSubtasks).toEqual(["前回の案"]);
    expect(result?.focusSubtask).toBeUndefined();
  });
});

describe("parseGeminiOutput", () => {
  it("正しい JSON からサブタスクを取り出す", () => {
    expect(parseGeminiOutput('{"refusal":"none","subtasks":[" 机を拭く ","", 3]}')).toEqual({
      refusal: "none",
      subtasks: ["机を拭く"],
    });
  });

  it("拒否の判定をそのまま返す", () => {
    expect(parseGeminiOutput('{"refusal":"self_harm","subtasks":[]}').refusal).toBe("self_harm");
    expect(parseGeminiOutput('{"refusal":"unethical","subtasks":[]}').refusal).toBe("unethical");
  });

  it("途中で切れた JSON や想定外の値でも例外にしない", () => {
    expect(parseGeminiOutput('{"refusal":"none","subtasks":["机を')).toEqual({ refusal: "none", subtasks: [] });
    expect(parseGeminiOutput(undefined)).toEqual({ refusal: "none", subtasks: [] });
    expect(parseGeminiOutput('{"refusal":"maybe"}')).toEqual({ refusal: "none", subtasks: [] });
  });
});
