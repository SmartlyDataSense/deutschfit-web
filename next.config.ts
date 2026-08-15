import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Sub-features land here as the surface grows. Keep this object minimal —
  // every option should be justifiable in the comment above its line.

  // Universal Links / Android App Links require these association files to
  // be served as `application/json`. Apple's AASA file is extension-less so
  // Next.js doesn't infer the type — set it explicitly.
  async headers() {
    return [
      {
        source: "/.well-known/:file*",
        headers: [
          { key: "Content-Type", value: "application/json" },
          // No caching headaches when the team rotates the SHA-256 or Team ID.
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      {
        // S12: the service worker must never be aggressively cached —
        // a stale SW pins old push-handling logic for up to 24h. Next
        // serves public/sw.js at the root path already; Service-Worker-
        // Allowed makes the root scope explicit.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
