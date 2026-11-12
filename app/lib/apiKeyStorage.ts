// ユーザーの Gemini APIキーをこの端末のブラウザ（LocalStorage）にのみ保存する
import { readStorage, removeStorage, writeStorage } from "@/app/lib/safeStorage";

const STORAGE_KEY = "task_decomposer_gemini_api_key";

// 登録から何日間、再登録不要とするか
export const API_KEY_TTL_DAYS = 90;

export interface StoredApiKey {
  key: string;
  expiresAt: number; // UNIX ミリ秒
}

// 期限切れ・破損している場合は null を返す
export const loadApiKey = (): StoredApiKey | null => {
  try {
    const raw = readStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.key !== "string" || typeof parsed?.expiresAt !== "number") {
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      removeStorage(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveApiKey = (key: string): StoredApiKey => {
  const stored: StoredApiKey = {
    key,
    expiresAt: Date.now() + API_KEY_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
  // 保存できなくても（プライベートモード等）、開いている間は使えるようにする
  writeStorage(STORAGE_KEY, JSON.stringify(stored));
  return stored;
};

export const clearApiKey = () => {
  removeStorage(STORAGE_KEY);
};
