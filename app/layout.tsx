import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskDecomposer",
  description: "大きなタスクを、AIが今すぐ10分でできるアクションに分解するタスク管理アプリ",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP の nonce をリクエストごとに付けるため、静的生成せずリクエスト時に描画する（proxy.ts 参照）
  await connection();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
