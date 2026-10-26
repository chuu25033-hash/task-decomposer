import { NextResponse } from "next/server";
import {
  API_KEY_HEADER,
  ERROR_CODES,
  GEMINI_API_BASE,
  GEMINI_MODELS,
  isApiKeyError,
} from "@/app/lib/gemini";
import { MAX_TITLE_LENGTH } from "@/app/types/task";

// AI に渡す既存サブタスクの最大件数
const MAX_EXISTING_SUBTASKS = 50;

// Vercel HobbyプランでのAPI最大実行時間を15秒に拡張
export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawTitle: unknown = body.taskTitle;
    // 生成個数は 1〜10 に制限
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);
    // 既存のサブタスク（補完モード用）
    // 長すぎる入力で応答が遅く・不安定になるのを防ぐため、件数と文字数を切り詰める
    const existingSubtasks: { title: string; completed: boolean }[] = Array.isArray(
      body.existingSubtasks
    )
      ? body.existingSubtasks
          .filter(
            (s: unknown): s is { title: string; completed: boolean } =>
              typeof s === "object" && s !== null && typeof (s as { title?: unknown }).title === "string"
          )
          .slice(0, MAX_EXISTING_SUBTASKS)
          .map((s: { title: string; completed: boolean }) => ({
            title: s.title.slice(0, MAX_TITLE_LENGTH),
            completed: Boolean(s.completed),
          }))
      : [];
    // 細分化したいサブタスク（行き詰まったステップ）
    const focusSubtask: string | undefined =
      typeof body.focusSubtask === "string" && body.focusSubtask.trim()
        ? body.focusSubtask.slice(0, MAX_TITLE_LENGTH)
        : undefined;

    if (typeof rawTitle !== "string" || !rawTitle.trim()) {
      return NextResponse.json(
        { error: "taskTitle is required" },
        { status: 400 }
      );
    }
    const taskTitle = rawTitle.slice(0, MAX_TITLE_LENGTH);

    // ユーザー自身が登録した APIキーを使う（サーバー側では保存しない）
    const apiKey = req.headers.get(API_KEY_HEADER)?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini APIキーが登録されていません", code: ERROR_CODES.API_KEY_REQUIRED },
        { status: 401 }
      );
    }

    // 各アクションに共通する条件
    const rules = `条件:
- 各アクションは「今すぐ10分以内で終わる」大きさにする
- 動詞で終わる具体的な行動にする（例:「〇〇を開いて△△を3行書き出す」）
- 考えるだけ・曖昧な表現（「検討する」「頑張る」など）は避ける
- 実行する順番に並べる`;

    const existingList = existingSubtasks
      .map((s) => `- ${s.completed ? "[完了] " : ""}${s.title}`)
      .join("\n");

    let instruction: string;
    if (focusSubtask) {
      // 行き詰まった1ステップを細分化
      instruction = `最終目標:「${taskTitle}」
この目標に向けた手順のうち「${focusSubtask}」で手が止まっています。
この手順を、すぐ着手できるアクションに正確に【${count}個】分解してください。`;
    } else if (existingList) {
      // 今の進み具合（完了済み＋ユーザー自身の手順）を踏まえて、次に取り組む手順を提案する
      // 個数が少なくても1つあたりを大きくしないよう、「目標までの全部」ではなく「次の N 個」を求める
      instruction = `最終目標:「${taskTitle}」
現在の状況は以下の通りです。[完了] は実行済み、それ以外はユーザー自身が決めた予定の手順です。
${existingList}

実行済みの作業の続きから、次に取り組むべきアクションを、ユーザーの予定の手順と重複しないように正確に【${count}個】提案してください。
目標達成まで${count}個で収まらない場合も、1つのアクションを大きくせず、先に取り組むべきものから順に提案してください。`;
    } else {
      instruction = `タスク:「${taskTitle}」
上記を即時着手できる超具体的な最小アクションに正確に【${count}個】分解してください。`;
    }

    const prompt = `${instruction}

${rules}

以下のJSON形式のみで出力してください。
{"subtasks":["アクション1","アクション2"]}`;

    // モデルごとのタイムアウト（合計が maxDuration = 15 秒に収まるように設定）
    const timeoutsMs = [6000, 7000];
    let lastErrorText = "";
    let lastStatus = 0;

    for (const [index, model] of GEMINI_MODELS.entries()) {
      const timeoutMs = timeoutsMs[index];
      // タイムアウト監視用の AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // URL に含めるとログに残りやすいため、キーはヘッダーで渡す
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              // 出力形式をスキーマで固定し、JSON の崩れを防ぐ
              responseSchema: {
                type: "OBJECT",
                properties: {
                  subtasks: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["subtasks"],
              },
              // 思考を最小限にして応答を速くする
              // （Gemini 3 系は temperature を下げると出力がループしやすいため既定値のままにする）
              thinkingConfig: { thinkingLevel: "low" },
            },
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsedData = rawText ? JSON.parse(rawText) : null;
          const subtasks: string[] = Array.isArray(parsedData?.subtasks)
            ? parsedData.subtasks.filter((s: unknown) => typeof s === "string" && s.trim())
            : [];

          if (subtasks.length > 0) {
            return NextResponse.json({ subtasks });
          }
          console.warn(`⚠️ ${model}: 空の応答が返されました。次のモデルを試します`);
          continue;
        }

        lastErrorText = await response.text();
        lastStatus = response.status;

        // APIキーが無効な場合はリトライしても無駄なので即座に返す
        if (isApiKeyError(response.status, lastErrorText)) {
          console.warn(`⚠️ APIキーが無効です (${response.status})`);
          return NextResponse.json(
            { error: "Gemini APIキーが無効です", code: ERROR_CODES.INVALID_API_KEY },
            { status: 401 }
          );
        }

        // 503（高負荷）・429（上限）などはモデルごとに状況が異なるため、次のモデルを試す
        console.warn(`⚠️ ${model} failed (${response.status}). 次のモデルを試します`);
      } catch (err: unknown) {
        const errorName = err instanceof Error ? err.name : "";
        if (errorName === "AbortError") {
          console.warn(`⚠️ ${model} timed out after ${timeoutMs / 1000}s`);
        } else {
          console.warn(`⚠️ ${model} failed:`, err);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    console.error("❌ Gemini API request failed:", lastErrorText);

    // ユーザーごとの無料枠の上限に達した場合
    if (lastStatus === 429) {
      return NextResponse.json(
        { error: "Gemini API rate limit.", code: ERROR_CODES.RATE_LIMITED },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Gemini API timeout or rate limit." },
      { status: 504 }
    );

  } catch (error) {
    console.error("❌ Route Handler エラー詳細:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}