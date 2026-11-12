import { describe, expect, it } from "vitest";
import { ACTION_RULES, buildDecomposePrompt } from "@/app/lib/decomposePrompt";
import { parseDecomposeRequest } from "@/app/lib/decomposeRequest";

const promptFor = (body: Record<string, unknown>) =>
  buildDecomposePrompt(parseDecomposeRequest({ taskTitle: "英語の勉強をする", ...body })!);

describe("buildDecomposePrompt", () => {
  it("どのモードでも、誰にでも当てはまる最低限の行動にする条件を含める", () => {
    const prompts = [
      promptFor({}),
      promptFor({ existingSubtasks: [{ title: "教材を用意する", completed: true }] }),
      promptFor({ focusSubtask: "単語を覚える" }),
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain(ACTION_RULES);
      expect(prompt).toContain("特定のアプリ・サービス・製品・ブランド・サイト名を出さない");
      expect(prompt).toContain("最低限");
    }
  });

  it("機器の前提・準備だけの手順・作業のまとめすぎを禁じ、具体例（流用されやすい）は入れない", () => {
    expect(ACTION_RULES).toContain("スマートフォン・パソコン・インターネット");
    expect(ACTION_RULES).toContain("準備だけの手順");
    expect(ACTION_RULES).toContain("多くの作業を1つのアクションにまとめない");
    expect(ACTION_RULES).toContain("やっても前に進まないほど小さい行動にはしない");
    expect(ACTION_RULES).toContain("ネットで調べる・検索する");
    expect(ACTION_RULES).not.toContain("英単語アプリ");
  });

  it("ユーザー自身が指定した道具は使ってよいと伝える", () => {
    expect(ACTION_RULES).toContain("ユーザーがタスク名や手順で自分から指定している道具・サービス");
  });

  it("一から分解するときは個数と課題名を伝える", () => {
    const prompt = promptFor({ count: 3 });
    expect(prompt).toContain("タスク:「英語の勉強をする」");
    expect(prompt).toContain("【3個】");
  });

  it("続きの提案では今の状況と、採用されなかった案を伝える", () => {
    const prompt = promptFor({
      existingSubtasks: [
        { title: "教材を用意する", completed: true },
        { title: "例文を1つ読む", completed: false },
      ],
      rejectedSubtasks: ["単語を10個書く"],
    });
    expect(prompt).toContain("- [完了] 教材を用意する");
    expect(prompt).toContain("- 例文を1つ読む");
    expect(prompt).toContain("- 単語を10個書く");
  });

  it("細分化では、手が止まった手順を伝える", () => {
    expect(promptFor({ focusSubtask: "単語を覚える" })).toContain("「単語を覚える」で手が止まっています");
  });
});
