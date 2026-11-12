import { describe, expect, it } from "vitest";
import { checkSubtask, summarizeChecks } from "@/app/lib/promptEval";

describe("checkSubtask", () => {
  it("アプリ名や製品名の疑いがある言葉を見つける", () => {
    expect(checkSubtask("英単語アプリを開く").specific).toContain("アプリ");
    expect(checkSubtask("YouTubeで動画を探す").specific).toContain("YouTube");
    expect(checkSubtask("ジムに行く").specific).toContain("ジム");
    expect(checkSubtask("スマホのアラームをセットする").specific).toContain("スマホ");
    expect(checkSubtask("PCを起動する").specific).toContain("PC");
  });

  it("曖昧な表現を見つける", () => {
    expect(checkSubtask("やり方を検討する").vague).toContain("検討");
  });

  it("どのタスクにも当てはまる準備だけの手順を見つける", () => {
    expect(checkSubtask("メモできるものを手元に用意する").filler.length).toBeGreaterThan(0);
  });

  it("一般的で具体的な手順は引っかからない", () => {
    const clean = { specific: [], vague: [], filler: [], size: [] };
    expect(checkSubtask("覚えたい英単語を3つ選ぶ")).toEqual(clean);
    expect(checkSubtask("床に落ちている物を1つ拾う")).toEqual(clean);
  });
});

describe("大きさの判定", () => {
  it("小さすぎ・まとめすぎの疑いを見つける", () => {
    expect(checkSubtask("足踏みを1回だけする").size).toContain("1回だけ");
    expect(checkSubtask("資料をすべて広げる").size).toContain("すべて");
  });
});

describe("summarizeChecks", () => {
  it("引っかかった手順の数を数える", () => {
    const summary = summarizeChecks(["アプリを開く", "やり方を検討する", "メモを用意する", "最初の1行を書く"]);
    expect(summary.specificCount).toBe(1);
    expect(summary.vagueCount).toBe(1);
    expect(summary.fillerCount).toBe(1);
  });
});
