import { defineEventHandler, setResponseHeader } from "h3";
import { useEnv, checkKey, notModified } from "../utils/env";
import {
  readFilter,
  listReports,
  versionTag,
  occurrencesFor,
  breakdown,
  parseSample,
} from "../utils/reports";

const VIEW_FORMAT = 2;

/** Full row shape. `message`, `firstSample`, `latestSample` are untrusted client input. */
export interface FingerprintRow {
  fingerprint: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  buildId: string;
  message: string;
  stackClean: string;
  /** Counts over retained occurrences (first + newest N), not over `count`. */
  platforms: Record<string, number>;
  versions: Record<string, number>;
  firstSample: unknown;
  latestSample: unknown;
  triagedAt: number | null;
  prUrl: string | null;
  note: string | null;
}

export default defineEventHandler(async (event): Promise<FingerprintRow[] | string | null> => {
  const env = useEnv(event);
  if (!checkKey(event, env.READ_TOKEN)) return "forbidden";

  setResponseHeader(event, "cache-control", "no-cache");
  if (notModified(event, await versionTag(env.DB, VIEW_FORMAT))) return null;

  const rows = await listReports(env.DB, readFilter(event));
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
      message: r.message,
      stackClean: r.stack_clean,
      platforms: b.platforms,
      versions: b.versions,
      firstSample: parseSample(b.first?.sample),
      latestSample: parseSample(b.latest?.sample),
      triagedAt: r.triaged_at,
      prUrl: r.pr_url,
      note: r.note,
    };
  });
});
