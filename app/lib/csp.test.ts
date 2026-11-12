import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/app/lib/csp";

describe("buildCsp", () => {
  it("スクリプトは nonce 付きのものだけ許可し、unsafe-inline を使わない", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("開発時だけ unsafe-eval を許可する", () => {
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});

describe("createNonce", () => {
  it("毎回違う値を作る", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce().length).toBeGreaterThanOrEqual(20);
  });
});
