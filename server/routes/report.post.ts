import { defineEventHandler, readBody, getRequestIP, setResponseStatus } from "h3";
import { useEnv, sha256, normalizeStack, cleanStack, clip, checkReportToken } from "../utils/env";

const MAX_REPORTS_PER_HOUR = 60;
/** Occurrences kept per fingerprint besides the first one. */
const MAX_OCCURRENCES = 20;
const MAX_STACK = 16_000;
const MAX_MESSAGE = 2_000;
const MAX_BREADCRUMBS = 50;

interface ReportBody {
  buildId: string;
  version: string;
  platform: string;
  stack: string;
  message: string;
  breadcrumbs: unknown[];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Light validation. Returns null on soft-fail; the caller still responds 204. */
function parse(raw: unknown): ReportBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const buildId = str(r.buildId);
  const stack = str(r.stack);
  if (!buildId || !stack) return null;
  return {
    buildId: clip(buildId, 128),
    version: clip(str(r.version, "unknown"), 64),
    platform: clip(str(r.platform, "unknown"), 64),
    stack: clip(stack, MAX_STACK),
    message: clip(str(r.message), MAX_MESSAGE),
    breadcrumbs: Array.isArray(r.breadcrumbs) ? r.breadcrumbs.slice(-MAX_BREADCRUMBS) : [],
  };
}

export default defineEventHandler(async (event) => {
  // Fire-and-forget contract: always 204, never surface errors to the client.
  setResponseStatus(event, 204);
  try {
    const body = parse(await readBody(event).catch(() => null));
    if (!body) return null;

    const env = useEnv(event);
    if (!checkReportToken(event, env.REPORT_TOKEN)) return null;
    const now = Date.now();

    // Rate limit per client IP. Replace with the device key once reports are signed.
    const rlKey = await sha256(getRequestIP(event, { xForwardedFor: true }) ?? "unknown");
    const window = Math.floor(now / 3_600_000);
    const rl = await env.DB.prepare(
      `INSERT INTO ratelimit (key, window, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key, window) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(rlKey, window)
      .first<{ count: number }>();
    if ((rl?.count ?? 0) > MAX_REPORTS_PER_HOUR) return null;

    const fingerprint = await sha256(body.buildId + "\n" + normalizeStack(body.stack));
    const sample = JSON.stringify(body);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reports (fingerprint, count, first_seen, last_seen, build_id, message, stack_clean)
         VALUES (?1, 1, ?2, ?2, ?3, ?4, ?5)
         ON CONFLICT(fingerprint) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen`,
      ).bind(fingerprint, now, body.buildId, body.message, cleanStack(body.stack)),
      env.DB.prepare(
        `INSERT INTO occurrences (fingerprint, seen_at, version, platform, sample) VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(fingerprint, now, body.version, body.platform, sample),
      env.DB.prepare(
        `DELETE FROM occurrences WHERE fingerprint = ?1 AND id NOT IN (
           SELECT id FROM occurrences WHERE fingerprint = ?1 ORDER BY seen_at ASC, id ASC LIMIT 1
         ) AND id NOT IN (
           SELECT id FROM occurrences WHERE fingerprint = ?1 ORDER BY seen_at DESC, id DESC LIMIT ?2
         )`,
      ).bind(fingerprint, MAX_OCCURRENCES),
    ]);
  } catch (err) {
    console.error("report failed", err);
  }
  return null;
});
