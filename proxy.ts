import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce } from "@/app/lib/csp";

// ページのリクエストごとに nonce を作り、CSP ヘッダーに載せる
// Next.js はリクエストの CSP ヘッダーから nonce を読み取り、自身のスクリプトに自動で付ける
// （そのためページは動的レンダリングにしている: app/layout.tsx の connection()）
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // API・静的ファイル・プリフェッチには CSP は不要
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
