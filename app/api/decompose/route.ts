import { NextResponse } from "next/server";

// Vercel HobbyプランでのAPI最大実行時間を15秒に拡張
export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    const { taskTitle, count = 5 } = await req.json();

    if (!taskTitle) {
      return NextResponse.json(
        { error: "taskTitle is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY が Vercel 環境変数に設定されていません");
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const prompt = `タスク:「${taskTitle}」
上記を即時着手できる超具体的な最小アクションに正確に【${count}個】分解し、以下のJSON形式のみで出力してください。

{"subtasks":["アクション1","アクション2"]}`;

    const maxRetries = 2;
    let lastErrorText = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // タイムアウト監視用の AbortController (13秒でタイムアウト設定)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 13000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (rawText) {
            const parsedData = JSON.parse(rawText);
            return NextResponse.json({ subtasks: parsedData.subtasks || [] });
          }
        }

        lastErrorText = await response.text();
        console.warn(`⚠️ Attempt ${attempt} failed (${response.status}). Retrying...`);

        if (response.status === 429 && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err: unknown) {
        const errorName = err instanceof Error ? err.name : "";
        if (errorName === "AbortError") {
          console.warn(`⚠️ Fetch attempt ${attempt} timed out after 13s`);
        } else {
          console.warn(`⚠️ Fetch attempt ${attempt} failed:`, err);
        }
      }
    }

    console.error("❌ Gemini API request failed:", lastErrorText);
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