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
  experimental: { openAPI: true },
  openAPI: {
    meta: {
      title: "delegator-report",
      description:
        "Crash reporting for the Delegator app. Three tokens: REPORT_TOKEN (header, app), READ_TOKEN (query, humans and agents), WRITE_TOKEN (query, triage).",
      version: "0.1.0",
    },
    production: "runtime",
    ui: { swagger: false },
  },
});
