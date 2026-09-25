import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output is used by the self-hosted Docker image; Vercel ignores
  // it. The tier has no native dependencies — it only fetch()es the rollups
  // API — so it deploys cleanly to Vercel or any Node host.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
