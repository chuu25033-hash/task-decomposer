import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig の @/* → プロジェクトルート に合わせる
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // ロジック（*.test.ts）は node、コンポーネント（*.test.tsx）は jsdom で動かす
    include: ["app/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
