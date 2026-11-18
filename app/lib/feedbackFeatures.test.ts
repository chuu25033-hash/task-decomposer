// 発表会のフィードバックを受けて追加した機能のテスト
// （入力の案内・優先度・テキストでコピー・お手本）
import { describe, expect, it } from "vitest";
import { buildDecomposePrompt, buildGeminiRequestBody, PRIORITY_RULES } from "@/app/lib/decomposePrompt";
import {
  MAX_REFERENCE_STEPS,
  parseDecomposeRequest,
  parseGeminiOutput,
  parseReferenceExample,
} from "@/app/lib/decomposeRequest";
import { getTaskInputHint } from "@/app/lib/inputHint";
import { createReference } from "@/app/lib/referenceExample";
import { sanitizeTasks } from "@/app/lib/taskBackup";
import { formatTaskAsText } from "@/app/lib/taskText";
import { cycleSubtaskPriority, nextPriority } from "@/app/lib/taskUpdates";
import { MAX_TITLE_LENGTH, type Task } from "@/app/types/task";

const task: Task = {
  id: "t1",
  title: "レポートを書く",
  subtasks: [
    { id: "s1", title: "テーマを決める", completed: true, source: "ai", priority: "high" },
    { id: "s2", title: "見出しを3つ書く", completed: false, source: "ai", priority: "medium" },
    { id: "s3", title: "参考文献を1冊選ぶ", completed: false, source: "user" },
  ],
};

describe("入力の案内（getTaskInputHint）", () => {
  it("空なら何も出さず、短すぎる入力には具体的に書くよう促す", () => {
    expect(getTaskInputHint("")).toBeNull();
    expect(getTaskInputHint("   ")).toBeNull();
    expect(getTaskInputHint("勉強")).toContain("「何を」「どこまで」");
  });

  it("複数のタスクをまとめて書いていそうなら、分けるよう促す", () => {
    expect(getTaskInputHint("洗濯、掃除、買い物をする")).toContain("1つずつ");
    expect(getTaskInputHint("レポート／発表資料を作る")).toContain("1つずつ");
  });

  it("具体的な入力や日付の / には何も出さない", () => {
    expect(getTaskInputHint("英語のレポートを2000字書く")).toBeNull();
    expect(getTaskInputHint("11/20までに発表資料を作る")).toBeNull();
  });
});

describe("優先度", () => {
  it("Gemini の応答から優先度を読み取り、不明な値は付けない（旧形式の文字列も受け付ける）", () => {
    const output = parseGeminiOutput(
      JSON.stringify({
        refusal: "none",
        subtasks: [
          { title: " A ", priority: "high" },
          { title: "B", priority: "urgent" },
          "C",
          { title: "" },
          { priority: "low" },
        ],
      })
    );
    expect(output.subtasks).toEqual([{ title: "A", priority: "high" }, { title: "B" }, { title: "C" }]);
  });

  it("プロンプトとスキーマで優先度を求め、並び順は実行順のままにさせる", () => {
    const prompt = buildDecomposePrompt(parseDecomposeRequest({ taskTitle: "x" })!);
    expect(prompt).toContain(PRIORITY_RULES);
    expect(PRIORITY_RULES).toContain("優先度のために並べ替えない");
    const schema = buildGeminiRequestBody(prompt).generationConfig.responseSchema;
    expect(schema.properties.subtasks.items.properties.priority.enum).toEqual(["high", "medium", "low"]);
  });

  it("タップで 高 → 中 → 低 → 高 と切り替え、未設定なら高から", () => {
    expect(nextPriority(undefined)).toBe("high");
    expect(nextPriority("high")).toBe("medium");
    expect(nextPriority("medium")).toBe("low");
    expect(nextPriority("low")).toBe("high");
    const [updated] = cycleSubtaskPriority([task], "t1", "s3");
    expect(updated.subtasks[2].priority).toBe("high");
    expect(updated.subtasks[0].priority).toBe("high");
  });

  it("保存データの優先度は正しい値だけ残す", () => {
    const [restored] = sanitizeTasks([
      {
        id: "t",
        title: "x",
        subtasks: [
          { id: "a", title: "A", priority: "low" },
          { id: "b", title: "B", priority: "top" },
        ],
      },
    ]);
    expect(restored.subtasks[0].priority).toBe("low");
    expect(restored.subtasks[1]).not.toHaveProperty("priority");
  });
});

describe("テキストでコピー（formatTaskAsText）", () => {
  it("チェックリスト形式にし、完了・優先度も書き出す", () => {
    expect(formatTaskAsText(task)).toBe(
      [
        "## レポートを書く",
        "- [x] テーマを決める（優先度: 高）",
        "- [ ] 見出しを3つ書く（優先度: 中）",
        "- [ ] 参考文献を1冊選ぶ",
      ].join("\n")
    );
  });
});

describe("お手本（さっきのように出力）", () => {
  it("タスクの手順を写してお手本を作る（手順が無ければ作らない）", () => {
    expect(createReference(task)).toEqual({
      taskId: "t1",
      taskTitle: "レポートを書く",
      subtasks: ["テーマを決める", "見出しを3つ書く", "参考文献を1冊選ぶ"],
    });
    expect(createReference({ ...task, subtasks: [] })).toBeNull();
  });

  it("受け取ったお手本は検証し、件数・文字数を切り詰める", () => {
    expect(parseReferenceExample(null)).toBeUndefined();
    expect(parseReferenceExample({ taskTitle: "x", subtasks: [] })).toBeUndefined();
    expect(parseReferenceExample({ taskTitle: "", subtasks: ["a"] })).toBeUndefined();
    const long = "あ".repeat(MAX_TITLE_LENGTH + 10);
    const parsed = parseReferenceExample({
      taskTitle: long,
      subtasks: [...Array.from({ length: MAX_REFERENCE_STEPS + 3 }, () => long), 1],
    });
    expect(parsed?.taskTitle).toHaveLength(MAX_TITLE_LENGTH);
    expect(parsed?.subtasks).toHaveLength(MAX_REFERENCE_STEPS);
  });

  it("一から分解するプロンプトにお手本を入れ、文言は流用しないよう伝える", () => {
    const request = parseDecomposeRequest({
      taskTitle: "発表資料を作る",
      referenceExample: { taskTitle: "レポートを書く", subtasks: ["テーマを決める", "見出しを3つ書く"] },
    })!;
    const prompt = buildDecomposePrompt(request);
    expect(prompt).toContain("過去のタスク:「レポートを書く」");
    expect(prompt).toContain("- 見出しを3つ書く");
    expect(prompt).toContain("そのまま使わず");
  });

  it("お手本が無ければプロンプトに入れない", () => {
    const prompt = buildDecomposePrompt(parseDecomposeRequest({ taskTitle: "発表資料を作る" })!);
    expect(prompt).not.toContain("過去の分解例");
  });
});
