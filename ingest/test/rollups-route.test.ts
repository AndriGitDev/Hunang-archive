import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../api/v1/rollups.js";

const previousToken = process.env.ROLLUPS_TOKEN;

afterEach(() => {
  if (previousToken === undefined) delete process.env.ROLLUPS_TOKEN;
  else process.env.ROLLUPS_TOKEN = previousToken;
});

describe("Vercel rollups route wake-up gate", () => {
  it("fails closed without a configured token before opening Postgres", async () => {
    delete process.env.ROLLUPS_TOKEN;
    expect((await GET(new Request("https://example.test/v1/rollups"))).status).toBe(503);
  });

  it("rejects a bad token before opening Postgres", async () => {
    process.env.ROLLUPS_TOKEN = "read-token-0123456789abcdef";
    const response = await GET(
      new Request("https://example.test/v1/rollups", {
        headers: { authorization: "Bearer wrong-token-0123456789abcdef" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
