// API Route の乱用対策（他サイトからの呼び出しの拒否と、簡易的な回数制限）
// ※ サーバーレス環境ではインスタンスごとにメモリが分かれるため、回数制限は「目安」。
//   厳密に制限したい場合は Vercel の Firewall（Rate Limiting）や外部ストアを使う

// 同じサイト（このアプリの画面）からの呼び出しかどうか
// ブラウザは POST の fetch に Origin を必ず付けるため、無い・食い違う場合は拒否する
export const isSameOriginRequest = (req: Request): boolean => {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
};

// 呼び出し元の IP（Vercel では x-forwarded-for の先頭）
export const clientKey = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

// 一定時間あたりの回数で制限する（固定ウィンドウ方式）
export const createRateLimiter = ({ limit, windowMs }: { limit: number; windowMs: number }) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (key: string, now: number = Date.now()): boolean => {
    // 期限切れの記録を掃除して、メモリが増え続けないようにする
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  };
};
