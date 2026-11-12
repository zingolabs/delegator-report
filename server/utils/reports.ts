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
  /** Page-only filters. The JSON and feed routes do not read them. */
  triaged?: boolean;
  platform?: string;
  q?: string;
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

export const SORT_KEYS = ["count", "last_seen"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface ListSort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const PAGE_LIMIT = 100;

/** Query params for the HTML list: the shared filter plus `triaged`, `platform`, `q`, `sort`, `dir`. */
export function readPageFilter(event: H3Event): { filter: ListFilter; sort: ListSort } {
  const q = getQuery(event);
  const filter = readFilter(event, PAGE_LIMIT);
  filter.triaged = !filter.untriaged && (q.triaged === "1" || q.triaged === "true");
  filter.platform = String(q.platform ?? "").slice(0, 64);
  filter.q = String(q.q ?? "")
    .trim()
    .slice(0, 200);
  const key = SORT_KEYS.find((k) => k === q.sort) ?? "count";
  return { filter, sort: { key, dir: q.dir === "asc" ? "asc" : "desc" } };
}

/** WHERE clause and binds for a filter. `limit` is not part of it. */
function whereOf(f: ListFilter): { sql: string; binds: (string | number)[] } {
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
  if (f.triaged) where.push("triaged_at IS NOT NULL");
  if (f.platform) {
    where.push(
      "EXISTS (SELECT 1 FROM occurrences o WHERE o.fingerprint = reports.fingerprint AND o.platform = ?)",
    );
    binds.push(f.platform);
  }
  if (f.q) {
    // instr, not LIKE: D1 caps LIKE patterns at 50 bytes and the text has no wildcards to escape.
    const cols = ["message", "stack_clean", "fingerprint", "build_id", "coalesce(note, '')"];
    where.push("(" + cols.map((c) => `instr(lower(${c}), lower(?)) > 0`).join(" OR ") + ")");
    for (const _ of cols) binds.push(f.q);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", binds };
}

/** `sort.key` and `sort.dir` come from closed sets, so they are safe to interpolate. */
function orderOf(sort: "count" | "first_seen" | ListSort): string {
  if (sort === "count") return "count DESC, last_seen DESC";
  if (sort === "first_seen") return "first_seen DESC";
  const dir = sort.dir === "asc" ? "ASC" : "DESC";
  return sort.key === "last_seen"
    ? `last_seen ${dir}, fingerprint`
    : `${sort.key} ${dir}, last_seen DESC, fingerprint`;
}

export async function listReports(
  db: D1Database,
  f: ListFilter,
  order: "count" | "first_seen" | ListSort = "count",
): Promise<ReportRow[]> {
  const w = whereOf(f);
  const sql = `SELECT * FROM reports ${w.sql} ORDER BY ${orderOf(order)} LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...w.binds, f.limit)
    .all<ReportRow>();
  return results;
}

/** `listReports` plus the count of all matches, for the HTML index. */
export async function listPage(
  db: D1Database,
  f: ListFilter,
  sort: ListSort,
): Promise<{ rows: ReportRow[]; matched: number }> {
  const w = whereOf(f);
  const [list, count] = await db.batch<ReportRow | { n: number }>([
    db
      .prepare(`SELECT * FROM reports ${w.sql} ORDER BY ${orderOf(sort)} LIMIT ?`)
      .bind(...w.binds, f.limit),
    db.prepare(`SELECT COUNT(*) AS n FROM reports ${w.sql}`).bind(...w.binds),
  ]);
  return {
    rows: (list?.results ?? []) as ReportRow[],
    matched: (count?.results[0] as { n: number } | undefined)?.n ?? 0,
  };
}

/** Filter choices for the HTML index, independent of the active filter. */
export interface Facets {
  builds: string[];
  platforms: string[];
}

export async function facets(db: D1Database): Promise<Facets> {
  const [builds, platforms] = await db.batch<{ v: string }>([
    db.prepare(
      "SELECT build_id AS v FROM reports GROUP BY build_id ORDER BY MAX(last_seen) DESC LIMIT 12",
    ),
    db.prepare("SELECT DISTINCT platform AS v FROM occurrences ORDER BY platform LIMIT 12"),
  ]);
  return {
    builds: (builds?.results ?? []).map((r) => String(r.v)),
    platforms: (platforms?.results ?? []).map((r) => String(r.v)),
  };
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
