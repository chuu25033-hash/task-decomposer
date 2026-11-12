import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy（XSS の被害を抑える。APIキーを LocalStorage に置いているため特に重要）
// - スクリプト・通信先は自分のサイトだけに限定する（Gemini への通信はサーバー側の API Route が行う）
// - Next.js のインラインスクリプトのため 'unsafe-inline' は必要。開発時は HMR 用に 'unsafe-eval' も許可する
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
