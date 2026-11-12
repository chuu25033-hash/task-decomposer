import { NextResponse } from "next/server";
import {
  API_KEY_HEADER,
  ERROR_CODES,
  GEMINI_API_BASE,
  GEMINI_BLOCK_REASONS,
  GEMINI_MODELS,
  isApiKeyError,
} from "@/app/lib/gemini";
import { buildDecomposePrompt } from "@/app/lib/decomposePrompt";
import { parseDecomposeRequest, parseGeminiOutput } from "@/app/lib/decomposeRequest";
import { clientKey, createRateLimiter, isSameOriginRequest } from "@/app/lib/requestGuard";

// 1つの呼び出し元から1分あたりに受け付ける回数（通常の操作では届かない程度）
const allowRequest = createRateLimiter({ limit: 20, windowMs: 60_000 });

// 倫理に反するタスクの拒否（判定は AI に任せ、理由に応じてエラーコードを返す）
const refusalResponse = (reason: "unethical" | "self_harm") =>
  reason === "self_harm"
    ? NextResponse.json(
        { error: "Task refused (self harm)", code: ERROR_CODES.TASK_REFUSED_SELF_HARM },
        { status: 422 }
      )
    : NextResponse.json(
        { error: "Task refused (unethical)", code: ERROR_CODES.TASK_REFUSED },
        { status: 422 }
      );

// Vercel HobbyプランでのAPI最大実行時間を15秒に拡張
export const maxDuration = 15;

export async function POST(req: Request) {
  // このアプリの画面以外からの呼び出し（他サイトからの中継利用など）は受け付けない
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { error: "Forbidden", code: ERROR_CODES.FORBIDDEN_ORIGIN },
      { status: 403 }
    );
  }
  if (!allowRequest(clientKey(req))) {
    return NextResponse.json(
      { error: "Too many requests", code: ERROR_CODES.TOO_MANY_REQUESTS },
      { status: 429 }
    );
  }

  try {
    // 本文が JSON でない場合も 400 として扱う（500 にしない）
    const body: unknown = await req.json().catch(() => null);
    // 入力の検証・切り詰めは lib/decomposeRequest.ts（単体テストあり）
    const parsedRequest = parseDecomposeRequest(body);
    if (!parsedRequest) {
      return NextResponse.json(
        { error: "taskTitle is required" },
        { status: 400 }
      );
    }
    const { count } = parsedRequest;

    // ユーザー自身が登録した APIキーを使う（サーバー側では保存しない）
    const apiKey = req.headers.get(API_KEY_HEADER)?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini APIキーが登録されていません", code: ERROR_CODES.API_KEY_REQUIRED },
        { status: 401 }
      );
    }

    // プロンプトの組み立ては lib/decomposePrompt.ts（誰にでも当てはまる最低限の行動にする条件・安全性の判断）
    const prompt = buildDecomposePrompt(parsedRequest);

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
                  refusal: { type: "STRING", enum: ["none", "unethical", "self_harm"] },
                  subtasks: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["refusal", "subtasks"],
                propertyOrdering: ["refusal", "subtasks"],
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
          // Gemini の安全フィルタでブロックされた場合は、別モデルでも結果は同じなので即座に拒否する
          const blockReason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason;
          if (GEMINI_BLOCK_REASONS.includes(blockReason)) {
            console.warn(`⚠️ ${model}: 安全フィルタでブロックされました (${blockReason})`);
            return refusalResponse("unethical");
          }

          // 途中で切れた JSON でも例外にせず「空の応答」として次のモデルを試す
          const { refusal, subtasks: generated } = parseGeminiOutput(
            data.candidates?.[0]?.content?.parts?.[0]?.text
          );
          if (refusal !== "none") {
            console.warn(`⚠️ ${model}: タスクの分解を拒否しました (${refusal})`);
            return refusalResponse(refusal);
          }
          // 指定より多く返ってきた場合は切り詰める（タスク総数を勝手に増やさない）
          const subtasks = generated.slice(0, count);

          if (subtasks.length > 0) {
            return NextResponse.json({ subtasks });
          }
          console.warn(`⚠️ ${model}: 空または不正な形式の応答でした。次のモデルを試します`);
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