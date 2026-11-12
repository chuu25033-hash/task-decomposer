import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter, isSameOriginRequest } from "@/app/lib/requestGuard";

const request = (headers: Record<string, string>) =>
  new Request("https://example.test/api/decompose", { method: "POST", headers });

describe("isSameOriginRequest", () => {
  it("同じホストからの呼び出しは許可する", () => {
    expect(isSameOriginRequest(request({ origin: "https://app.test", host: "app.test" }))).toBe(true);
  });

  it("プロキシ経由では x-forwarded-host を見る", () => {
    expect(
      isSameOriginRequest(
        request({ origin: "https://app.test", host: "internal", "x-forwarded-host": "app.test" })
      )
    ).toBe(true);
  });

  it("別のサイトからや Origin の無い呼び出しは拒否する", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.test", host: "app.test" }))).toBe(false);
    expect(isSameOriginRequest(request({ host: "app.test" }))).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("上限までは許可し、超えたら拒否、時間が経てば戻る", () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 10)).toBe(true);
    expect(allow("a", 20)).toBe(false);
    // 別の呼び出し元には影響しない
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1000)).toBe(true);
  });
});

describe("clientKey", () => {
  it("x-forwarded-for の先頭の IP を使う", () => {
    expect(clientKey(request({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientKey(request({}))).toBe("unknown");
  });
});
