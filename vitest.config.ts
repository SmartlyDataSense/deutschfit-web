import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: false,
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Stub `server-only` so unit tests can import server-only modules.
      // In production builds, Next.js enforces server-only imports at the
      // bundler boundary; vitest doesn't run the Next.js bundler.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
