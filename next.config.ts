import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Sub-features land here as the surface grows. Keep this object minimal —
  // every option should be justifiable in the comment above its line.
};

export default withNextIntl(nextConfig);
