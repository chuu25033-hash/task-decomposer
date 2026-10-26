// Gemini 関連の共通定数（クライアント・サーバー両方から参照）

// 応答速度を最優先し、軽量モデルを使う（実測: 3.5-flash-lite ≒ 1.3秒、3.1-flash-lite ≒ 2.5秒。
// gemini-3.8-flash などの通常モデルは高負荷時に 20 秒以上かかり、タイムアウトの原因になっていた）
// 先頭から順に試し、失敗（高負荷・タイムアウト・上限）したら次のモデルにフォールバックする
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
export const GEMINI_MODEL = GEMINI_MODELS[0];
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// クライアント → API Route へユーザー自身の APIキーを渡すヘッダー名
export const API_KEY_HEADER = "x-gemini-api-key";

// APIキー作成ページ（Google AI Studio）
export const API_KEY_CREATE_URL = "https://aistudio.google.com/apikey";

// API Route が返すエラーコード
export const ERROR_CODES = {
  API_KEY_REQUIRED: "API_KEY_REQUIRED",
  INVALID_API_KEY: "INVALID_API_KEY",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

// Gemini のレスポンスが APIキー起因のエラーかどうか
export const isApiKeyError = (status: number, bodyText: string) =>
  status === 401 || status === 403 || (status === 400 && bodyText.includes("API_KEY"));
