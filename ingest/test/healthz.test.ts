import { describe, expect, it } from "vitest";
import { GET } from "../api/healthz.js";

describe("Vercel healthz", () => {
  it("reports liveness without requiring or waking the database", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    try {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
      expect(await response.json()).toMatchObject({ ok: true, database: "unchecked" });
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
      else process.env.POSTGRES_URL = previousPostgresUrl;
    }
  });
});
