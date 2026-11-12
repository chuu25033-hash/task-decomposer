// プロンプトの比較用スクリプト（ひとつ前のルール / 現在のルール で、生成される手順がどう変わるかを並べて見る）
//
// 使い方（PowerShell）:
//   $env:GEMINI_API_KEY = "自分のキー"; npm run eval:prompt
// 使い方（bash）:
//   GEMINI_API_KEY=自分のキー npm run eval:prompt
//
// - 確認用タスク（app/lib/promptEval.ts の EVAL_TASKS）× 2 パターンを、本番と同じ設定で Gemini に送る
// - 結果は eval-results/ に Markdown で保存する（.gitignore 済み）。キーはどこにも出力しない
// - 引数を付けると、その文字を含むタスクだけを試す（例: npm run eval:prompt -- 絵）
// - 無料枠の回数制限にかからないよう、呼び出しの間に少し待つ（全部で 1〜2 分ほど）
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_RULES, buildDecomposePrompt, buildGeminiRequestBody } from "@/app/lib/decomposePrompt";
import { parseDecomposeRequest, parseGeminiOutput } from "@/app/lib/decomposeRequest";
import { GEMINI_API_BASE, GEMINI_MODELS } from "@/app/lib/gemini";
import { EVAL_TASKS, PREVIOUS_ACTION_RULES, summarizeChecks } from "@/app/lib/promptEval";

const COUNT = 5;
const WAIT_MS = 4500;

const VARIANTS = [
  { name: "前のルール", rules: PREVIOUS_ACTION_RULES },
  { name: "現在のルール", rules: ACTION_RULES },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 本番と同じく、1つ目のモデルが失敗したら次のモデルを試す
const generate = async (prompt: string, apiKey: string): Promise<string[]> => {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    const startedAt = Date.now();
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildGeminiRequestBody(prompt)),
      signal: AbortSignal.timeout(20_000),
    }).catch((e: unknown) => {
      lastError = `${model}: ${e instanceof Error ? e.name : String(e)}（${Math.round((Date.now() - startedAt) / 1000)}秒）`;
      return null;
    });
    if (!res) continue;
    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 401 || res.status === 403) break;
      continue;
    }
    const data = await res.json();
    const { refusal, subtasks } = parseGeminiOutput(data.candidates?.[0]?.content?.parts?.[0]?.text);
    if (refusal !== "none") return [`（拒否: ${refusal}）`];
    if (subtasks.length > 0) return subtasks.slice(0, COUNT);
    lastError = "空の応答";
  }
  throw new Error(lastError || "失敗しました");
};

const main = async () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error("環境変数 GEMINI_API_KEY に Gemini APIキーを設定してから実行してください。");
    process.exit(1);
  }

  const lines: string[] = [`# プロンプト比較（${new Date().toLocaleString("ja-JP")}）`, ""];
  const totals = VARIANTS.map(() => ({ specific: 0, vague: 0, filler: 0, size: 0, all: 0 }));

  const filter = process.argv[2];
  const tasks = filter ? EVAL_TASKS.filter((t) => t.includes(filter)) : EVAL_TASKS;
  for (const taskTitle of tasks) {
    lines.push(`## ${taskTitle}`, "");
    const request = parseDecomposeRequest({ taskTitle, count: COUNT })!;
    for (const [i, variant] of VARIANTS.entries()) {
      process.stdout.write(`${taskTitle} / ${variant.name} ... `);
      try {
        const subtasks = await generate(buildDecomposePrompt(request, variant.rules), apiKey);
        const summary = summarizeChecks(subtasks);
        totals[i].specific += summary.specificCount;
        totals[i].vague += summary.vagueCount;
        totals[i].filler += summary.fillerCount;
        totals[i].size += summary.sizeCount;
        totals[i].all += subtasks.length;
        lines.push(`**${variant.name}**`, "");
        subtasks.forEach((s, j) => {
          const { specific, vague, filler, size } = summary.checks[j];
          const marks = [
            ...(specific.length ? [`⚠️具体的すぎ?: ${specific.join(", ")}`] : []),
            ...(vague.length ? [`⚠️曖昧?: ${vague.join(", ")}`] : []),
            ...(filler.length ? [`⚠️準備だけ?: ${filler.join(", ")}`] : []),
            ...(size.length ? [`⚠️大きさ?: ${size.join(", ")}`] : []),
          ];
          lines.push(`${j + 1}. ${s}${marks.length ? `　${marks.join(" / ")}` : ""}`);
        });
        lines.push("");
        console.log("ok");
      } catch (e) {
        lines.push(`**${variant.name}**: 失敗（${e instanceof Error ? e.message : e}）`, "");
        console.log("失敗");
      }
      await sleep(WAIT_MS);
    }
  }

  lines.push("## まとめ（機械的な推定。最終的には読んで判断する）", "");
  lines.push("| パターン | 手順の数 | 具体的すぎ? | 曖昧? | 準備だけ? | 大きさ? |", "|---|---|---|---|---|---|");
  VARIANTS.forEach((v, i) =>
    lines.push(
      `| ${v.name} | ${totals[i].all} | ${totals[i].specific} | ${totals[i].vague} | ${totals[i].filler} | ${totals[i].size} |`
    )
  );

  const dir = join(process.cwd(), "eval-results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `prompt-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`\n結果を保存しました: ${file}`);
  console.log(lines.slice(-VARIANTS.length - 2).join("\n"));
};

void main();
