import type { H3Event } from "h3";
import { setResponseHeader, setResponseStatus, getQuery, getRequestHeader } from "h3";

/**
 * Three shared secrets, three roles:
 * - REPORT_TOKEN: shipped in the app. Create-only; cannot read or modify. Treat as public.
 * - READ_TOKEN:   humans and agents. Feed, page, JSON. Lives in reader apps; rotate if leaked.
 * - WRITE_TOKEN:  admins and the agent loop. Triage only.
 */
export interface Env {
  DB: D1Database;
  REPORT_TOKEN?: string;
  READ_TOKEN?: string;
  WRITE_TOKEN?: string;
}

/** Cloudflare bindings. Present in `nitro dev` (via wrangler proxy) and in the deployed Worker. */
export function useEnv(event: H3Event): Env {
  const env = (event.context as { cloudflare?: { env?: Env } }).cloudflare?.env;
  if (!env || !env.DB) {
    throw new Error("Cloudflare env/DB binding missing. Check wrangler.toml [[d1_databases]].");
  }
  return env;
}

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Trim lines, drop empties, collapse internal whitespace. */
export function normalizeStack(stack: string): string {
  return stack
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

/**
 * Keep only lines that look like stack frames (`at fn (file:1:2)`, `file:line`, `fn@file:line`).
 * Drops the free-text error line and anything else. This is the shape agents should read.
 */
export function cleanStack(stack: string): string {
  return normalizeStack(stack)
    .split("\n")
    .filter((l) => /^at\s|^\S+@\S+:\d+|\(\S+:\d+(:\d+)?\)|\S+:\d+(:\d+)?$/.test(l))
    .map((l) => clip(l, 300))
    .slice(0, 100)
    .join("\n");
}

export function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Query-param token check. Returns false after setting a 403; caller returns immediately. */
export function checkKey(event: H3Event, expected: string | undefined): boolean {
  const key = String(getQuery(event).key ?? "");
  if (!expected || !key || !timingSafeEqual(key, expected)) {
    setResponseStatus(event, 403);
    return false;
  }
  return true;
}

/** Header token check for the report path. Silent: the caller still answers 204. */
export function checkReportToken(event: H3Event, expected: string | undefined): boolean {
  if (!expected) {
    console.warn("REPORT_TOKEN unset; dropping all reports");
    return false;
  }
  const got = getRequestHeader(event, "x-report-token") ?? "";
  return !!got && timingSafeEqual(got, expected);
}

/** Weak ETag; returns true (and sets 304) when the client already has this version. */
export function notModified(event: H3Event, etag: string): boolean {
  setResponseHeader(event, "etag", etag);
  if (getRequestHeader(event, "if-none-match") === etag) {
    setResponseStatus(event, 304);
    return true;
  }
  return false;
}

export function intParam(v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}
