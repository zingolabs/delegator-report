import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  preset: "cloudflare-module",
  compatibilityDate: "2025-10-01",
  srcDir: "server",
  // Root-level public/ (compiled CSS); default would be server/public.
  publicAssets: [{ dir: "../public", baseURL: "/", maxAge: 3600 }],
  typescript: { strict: true },
  // Server-only JSX rendered with preact-render-to-string. No client runtime.
  esbuild: { options: { jsx: "automatic", jsxImportSource: "preact" } },
});
