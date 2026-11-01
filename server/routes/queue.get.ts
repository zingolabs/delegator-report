import { defineEventHandler, setResponseHeader, getQuery } from "h3";
import { useEnv, checkKey, notModified } from "../utils/env";
import { readFilter, listReports, versionTag, occurrencesFor, breakdown } from "../utils/reports";

const QUEUE_FORMAT = 2;

/**
 * Minimal, safe shape for agents. No free-text fields (message, breadcrumbs, samples);
 * only frame-like stack lines. Defaults to untriaged rows.
 */
export interface QueueRow {
  fingerprint: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  buildId: string;
  stackClean: string;
  platforms: Record<string, number>;
  versions: Record<string, number>;
  triagedAt: number | null;
  prUrl: string | null;
}

export default defineEventHandler(async (event): Promise<QueueRow[] | string | null> => {
  const env = useEnv(event);
  if (!checkKey(event, env.READ_TOKEN)) return "forbidden";

  setResponseHeader(event, "cache-control", "no-cache");
  if (notModified(event, await versionTag(env.DB, QUEUE_FORMAT))) return null;

  const f = readFilter(event, 100);
  if (getQuery(event).untriaged === undefined) f.untriaged = true; // default: only untriaged

  const rows = await listReports(env.DB, f);
  const occ = await occurrencesFor(
    env.DB,
    rows.map((r) => r.fingerprint),
  );
  return rows.map((r) => {
    const b = breakdown(occ.get(r.fingerprint) ?? []);
    return {
      fingerprint: r.fingerprint,
      count: r.count,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      buildId: r.build_id,
      stackClean: r.stack_clean,
      platforms: b.platforms,
      versions: b.versions,
      triagedAt: r.triaged_at,
      prUrl: r.pr_url,
    };
  });
});
