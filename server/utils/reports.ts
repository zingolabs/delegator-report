import type { H3Event } from "h3";
import { getQuery } from "h3";
import { intParam } from "./env";

/** Aggregate row: one per fingerprint. */
export interface ReportRow {
  fingerprint: string;
  count: number;
  first_seen: number;
  last_seen: number;
  build_id: string;
  message: string;
  stack_clean: string;
  triaged_at: number | null;
  pr_url: string | null;
  note: string | null;
}

/** One received report. The first per fingerprint is kept forever, then the newest N. */
export interface Occurrence {
  id: number;
  fingerprint: string;
  seen_at: number;
  version: string;
  platform: string;
  sample: string;
}

export interface TriageEvent {
  id: number;
  fingerprint: string;
  at: number;
  action: "triage" | "reset";
  actor: string;
  pr_url: string | null;
  note: string | null;
}

export interface ListFilter {
  since: number;
  limit: number;
  buildId: string;
  untriaged: boolean;
}

export const MAX_LIMIT = 500;

/** Shared query params for /view, /queue, /feed.xml. */
export function readFilter(event: H3Event, defaultLimit = MAX_LIMIT): ListFilter {
  const q = getQuery(event);
  return {
    since: intParam(q.since, 0),
    limit: intParam(q.limit, defaultLimit, MAX_LIMIT) || defaultLimit,
    buildId: String(q.buildId ?? "").slice(0, 128),
    untriaged: q.untriaged === "1" || q.untriaged === "true",
  };
}

export async function listReports(
  db: D1Database,
  f: ListFilter,
  order: "count" | "first_seen" = "count",
): Promise<ReportRow[]> {
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (f.since > 0) {
    where.push("last_seen > ?");
    binds.push(f.since);
  }
  if (f.buildId) {
    where.push("build_id = ?");
    binds.push(f.buildId);
  }
  if (f.untriaged) where.push("triaged_at IS NULL");
  const orderBy = order === "count" ? "count DESC, last_seen DESC" : "first_seen DESC";
  binds.push(f.limit);
  const sql = `SELECT * FROM reports ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${orderBy} LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<ReportRow>();
  return results;
}

function groupBy<T extends { fingerprint: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.fingerprint) ?? [];
    list.push(r);
    m.set(r.fingerprint, list);
  }
  return m;
}

export async function occurrencesFor(
  db: D1Database,
  fingerprints: string[],
): Promise<Map<string, Occurrence[]>> {
  if (fingerprints.length === 0) return new Map();
  const marks = fingerprints.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT * FROM occurrences WHERE fingerprint IN (${marks}) ORDER BY seen_at ASC, id ASC`,
    )
    .bind(...fingerprints)
    .all<Occurrence>();
  return groupBy(results);
}

export async function eventsFor(
  db: D1Database,
  fingerprints: string[],
): Promise<Map<string, TriageEvent[]>> {
  if (fingerprints.length === 0) return new Map();
  const marks = fingerprints.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT * FROM triage_events WHERE fingerprint IN (${marks}) ORDER BY at DESC, id DESC`,
    )
    .bind(...fingerprints)
    .all<TriageEvent>();
  return groupBy(results);
}

export interface Breakdown {
  platforms: Record<string, number>;
  versions: Record<string, number>;
  first: Occurrence | undefined;
  latest: Occurrence | undefined;
}

export function breakdown(occ: Occurrence[]): Breakdown {
  const platforms: Record<string, number> = {};
  const versions: Record<string, number> = {};
  for (const o of occ) {
    platforms[o.platform] = (platforms[o.platform] ?? 0) + 1;
    versions[o.version] = (versions[o.version] ?? 0) + 1;
  }
  return { platforms, versions, first: occ[0], latest: occ[occ.length - 1] };
}

export function parseSample(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Cheap change marker for ETags: row count, newest last_seen, occurrence and event counts,
 * plus a per-route format version. Bump `format` whenever the response shape or markup
 * changes, or readers keep serving their cached copy.
 */
export async function versionTag(db: D1Database, format = 1): Promise<string> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(last_seen) AS ls,
              (SELECT COUNT(*) FROM occurrences) AS oc,
              (SELECT COUNT(*) FROM triage_events) AS ev FROM reports`,
    )
    .first<{ n: number; ls: number | null; oc: number; ev: number }>();
  return `W/"f${format}-${r?.n ?? 0}-${r?.ls ?? 0}-${r?.oc ?? 0}-${r?.ev ?? 0}"`;
}
