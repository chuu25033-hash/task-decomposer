import { describe, expect, it } from "vitest";
import {
  getAiPlan,
  MAX_AI_COUNT,
  moveSubtaskInList,
  replaceAiSubtasks,
  replaceSubtaskWith,
  restoreReplacedSubtasks,
} from "@/app/lib/subtaskLogic";
import type { Subtask, Task } from "@/app/types/task";

const ai = (id: string, extra: Partial<Subtask> = {}): Subtask => ({
  id,
  title: id,
  completed: false,
  source: "ai",
  ...extra,
});
const user = (id: string, extra: Partial<Subtask> = {}): Subtask => ({
  id,
  title: id,
  completed: false,
  source: "user",
  ...extra,
});
const task = (subtasks: Subtask[]): Task => ({ id: "t", title: "タスク", subtasks });
const ids = (subtasks: Subtask[]) => subtasks.map((s) => s.id);

describe("getAiPlan", () => {
  it("サブタスクが無いときは選んだ個数で分解する", () => {
    expect(getAiPlan(task([]), 3)).toEqual({ mode: "decompose", count: 3, targetIds: [] });
  });

  it("未完了のAI提案があるときは、その個数のまま作り直す（総数を増やさない）", () => {
    const plan = getAiPlan(task([ai("a"), ai("b"), user("u"), ai("c", { completed: true })]), 10);
    expect(plan).toEqual({ mode: "regenerate", count: 2, targetIds: ["a", "b"] });
  });

  it("採用したAI提案は作り直しの個数に含めない", () => {
    expect(getAiPlan(task([ai("a", { kept: true }), ai("b")]), 5)).toEqual({
      mode: "regenerate",
      count: 1,
      targetIds: ["b"],
    });
  });

  it("作り直す対象が上限を超えても API の上限で止める", () => {
    const many = Array.from({ length: 15 }, (_, i) => ai(`a${i}`));
    const plan = getAiPlan(task(many), 5);
    expect(plan.count).toBe(MAX_AI_COUNT);
    // 作り直す数と生成する数を揃える（上限を超えた分は残すので総数は変わらない）
    expect(plan.targetIds).toEqual(many.slice(0, MAX_AI_COUNT).map((s) => s.id));
  });

  it("AI提案がすべて完了済み・採用済みなら追加になる", () => {
    const plan = getAiPlan(task([ai("a", { completed: true }), ai("b", { kept: true }), user("u")]), 3);
    expect(plan).toEqual({ mode: "append", count: 3, targetIds: [] });
  });

  it("source が無い旧データはユーザーの手順として扱う", () => {
    const legacy: Subtask = { id: "old", title: "old", completed: false };
    expect(getAiPlan(task([legacy]), 5).mode).toBe("append");
  });
});

describe("replaceAiSubtasks", () => {
  it("未完了・未採用のAI提案だけを、最初の位置に新しい提案として入れる", () => {
    const before = [
      ai("done", { completed: true }),
      ai("a"),
      user("u"),
      ai("b"),
      ai("keep", { kept: true }),
    ];
    const result = replaceAiSubtasks(before, [ai("n1"), ai("n2")], ["a", "b"]);
    expect(ids(result)).toEqual(["done", "n1", "n2", "u", "keep"]);
  });

  it("対象に指定していないAI提案（処理中に ⚡ で増えたものなど）は消さない", () => {
    const before = [ai("a"), ai("b1"), ai("b2")];
    const result = replaceAiSubtasks(before, [ai("n1")], ["a"]);
    expect(ids(result)).toEqual(["n1", "b1", "b2"]);
  });

  it("処理中に完了にした対象は残す", () => {
    const before = [ai("a", { completed: true }), ai("b")];
    const result = replaceAiSubtasks(before, [ai("n1"), ai("n2")], ["a", "b"]);
    expect(ids(result)).toEqual(["a", "n1", "n2"]);
  });

  it("置き換え対象が無ければ末尾に追加する", () => {
    const result = replaceAiSubtasks([user("u"), ai("done", { completed: true })], [ai("n1")], []);
    expect(ids(result)).toEqual(["u", "done", "n1"]);
  });
});

describe("restoreReplacedSubtasks", () => {
  it("再提案の前の並びに戻せる", () => {
    const before = [ai("done", { completed: true }), ai("a"), user("u"), ai("b")];
    const generated = [ai("n1"), ai("n2")];
    const after = replaceAiSubtasks(before, generated, ["a", "b"]);
    const removed = before.filter((s) => s.id === "a" || s.id === "b");
    const restored = restoreReplacedSubtasks(after, { removed, addedIds: ids(generated) });
    expect(ids(restored)).toEqual(["done", "a", "b", "u"]);
  });

  it("新しい提案を後から完了にしていても、残っているものは二重に戻さない", () => {
    const current = [ai("x"), user("u")];
    const restored = restoreReplacedSubtasks(current, { removed: [ai("x"), ai("y")], addedIds: ["n1"] });
    expect(ids(restored)).toEqual(["x", "u", "y"]);
  });

  it("追加した提案のうち、後から完了にしたものは進捗として残す", () => {
    const current = [ai("n1", { completed: true }), ai("n2"), user("u")];
    const restored = restoreReplacedSubtasks(current, {
      removed: [ai("a"), ai("b")],
      addedIds: ["n1", "n2"],
    });
    expect(ids(restored)).toEqual(["a", "b", "n1", "u"]);
  });
});

describe("replaceSubtaskWith（細分化）", () => {
  it("対象の位置に細分化した手順を差し込む", () => {
    const result = replaceSubtaskWith([user("a"), user("b"), user("c")], "b", [ai("b1"), ai("b2")]);
    expect(ids(result)).toEqual(["a", "b1", "b2", "c"]);
  });

  it("処理中に対象が削除されていたら何もしない", () => {
    const list = [user("a")];
    expect(replaceSubtaskWith(list, "gone", [ai("x")])).toBe(list);
  });
});

describe("moveSubtaskInList", () => {
  it("上下に入れ替える", () => {
    expect(ids(moveSubtaskInList([user("a"), user("b"), user("c")], "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveSubtaskInList([user("a"), user("b"), user("c")], "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("端では動かさない", () => {
    const list = [user("a"), user("b")];
    expect(moveSubtaskInList(list, "a", -1)).toBe(list);
    expect(moveSubtaskInList(list, "b", 1)).toBe(list);
  });
});
