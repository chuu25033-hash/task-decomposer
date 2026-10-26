import { NextResponse } from "next/server";
import { API_KEY_HEADER, ERROR_CODES, GEMINI_API_BASE, GEMINI_MODEL } from "@/app/lib/gemini";

export const maxDuration = 15;

// 登録前に APIキーが有効かを確認する（モデル情報の取得のみで、生成クォータは消費しない）
export async function POST(req: Request) {
  const apiKey = req.headers.get(API_KEY_HEADER)?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "APIキーを入力してください", code: ERROR_CODES.API_KEY_REQUIRED },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: controller.signal,
    });

    if (response.ok) {
      return NextResponse.json({ valid: true });
    }

    // キーの値はログに出さない
    console.warn(`⚠️ APIキーの検証に失敗しました (${response.status})`);
    return NextResponse.json(
      {
        error: "このAPIキーは使えませんでした。コピー漏れがないか確認してください。",
        code: ERROR_CODES.INVALID_API_KEY,
      },
      { status: 401 }
    );
  } catch (err) {
    console.warn("⚠️ APIキーの検証リクエストに失敗しました:", err instanceof Error ? err.name : err);
    return NextResponse.json(
      { error: "確認に失敗しました。通信環境を確認して再試行してください。" },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
