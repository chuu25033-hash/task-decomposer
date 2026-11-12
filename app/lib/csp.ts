// Content Security Policy の組み立て（proxy.ts から使う。単体テストで確認できるよう切り出し）
// - スクリプトはリクエストごとの nonce が付いたものだけ実行を許可する（'unsafe-inline' を使わない）
//   'strict-dynamic' により、nonce 付きのスクリプトが読み込む Next.js のチャンクも許可される
// - 通信先は自分のサイトだけ（Gemini への通信はサーバー側の API Route が行う）
// - style-src の 'unsafe-inline' は、要素の style 属性（進捗バーの幅など）に必要なため残す
//   （スタイルの注入はスクリプトに比べて被害が小さい）
export const buildCsp = (nonce: string, isDev: boolean): string =>
  [
    "default-src 'self'",
    // 開発時は React のデバッグ機能が eval を使う
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

// 推測できない nonce（リクエストごとに作る）
export const createNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};
