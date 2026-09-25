import { describe, expect, it } from "vitest";
import { hashIp, truncateIp } from "../src/privacy.js";

describe("hashIp", () => {
  it("is deterministic for the same secret", () => {
    expect(hashIp("203.0.113.7", "secret-a")).toBe(hashIp("203.0.113.7", "secret-a"));
  });
  it("differs across secrets (keyed, not a plain hash)", () => {
    expect(hashIp("203.0.113.7", "secret-a")).not.toBe(hashIp("203.0.113.7", "secret-b"));
  });
  it("does not contain the IP and has fixed length", () => {
    const h = hashIp("203.0.113.7", "secret-a");
    expect(h).toHaveLength(16);
    expect(h).not.toContain("203");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("truncateIp", () => {
  it("truncates IPv4 to /24", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
  });
  it("truncates IPv6 to /48", () => {
    expect(truncateIp("2001:db8:abcd:12::7")).toBe("2001:0db8:abcd::/48");
  });
  it("handles fully expanded IPv6", () => {
    expect(truncateIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe("2001:0db8:0000::/48");
  });
  it("handles IPv4-mapped IPv6", () => {
    expect(truncateIp("::ffff:203.0.113.7")).toBe("0000:0000:0000::/48");
  });
});
