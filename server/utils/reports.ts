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
  version?: string;
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

export const SORT_KEYS = ["last_seen", "count"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface ListSort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const PAGE_LIMIT = 100;

/** Query params for the HTML list: the shared filter plus `triaged`, `version`, `platform`, `q`, `sort`, `dir`. Newest first unless `sort` says otherwise. */
export function readPageFilter(event: H3Event): { filter: ListFilter; sort: ListSort } {
  const q = getQuery(event);
  const filter = readFilter(event, PAGE_LIMIT);
  filter.triaged = !filter.untriaged && (q.triaged === "1" || q.triaged === "true");
  filter.version = String(q.version ?? "").slice(0, 64);
  filter.platform = String(q.platform ?? "").slice(0, 64);
  filter.q = String(q.q ?? "")
    .trim()
    .slice(0, 200);
  const key = SORT_KEYS.find((k) => k === q.sort) ?? "last_seen";
  return { filter, sort: { key, dir: q.dir === "asc" ? "asc" : "desc" } };
}

export const DAY_MS = 86_400_000;
/** UTC day number, the unit of `daily_counts.day`. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);
/** Days in a row's trend line, and in the chart. Both end today. */
export const TREND_DAYS = 14;
export const CHART_DAYS = 30;

/** ` AND version = ? AND platform = ?` for the parts of the filter that live in daily_counts. */
function dailyCond(f: ListFilter, prefix = ""): { sql: string; binds: string[] } {
  let sql = "";
  const binds: string[] = [];
  if (f.version) {
    sql += ` AND ${prefix}version = ?`;
    binds.push(f.version);
  }
  if (f.platform) {
    sql += ` AND ${prefix}platform = ?`;
    binds.push(f.platform);
  }
  return { sql, binds };
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
  // Version and platform come from the daily counters, which are never pruned. Both in one
  // EXISTS: "0.4.2 on ios" means one counter with both, not one of each.
  const d = dailyCond(f, "d.");
  if (d.sql) {
    where.push(
      `EXISTS (SELECT 1 FROM daily_counts d WHERE d.fingerprint = reports.fingerprint${d.sql})`,
    );
    binds.push(...d.binds);
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

/** One stacked-bar cell: reports on a day for a version. */
export interface DayCount {
  day: number;
  version: string;
  n: number;
}

/**
 * Newest version first. Version strings do not sort reliably ("0.10" vs "0.9", build suffixes),
 * so the order is by the day a version was first reported, then by a numeric-aware compare.
 */
function orderVersions(rows: { v: string; first_day: number }[]): string[] {
  return rows
    .toSorted(
      (a, b) => b.first_day - a.first_day || b.v.localeCompare(a.v, "en", { numeric: true }),
    )
    .map((r) => r.v);
}

const VERSIONS_SQL =
  "SELECT version AS v, MIN(day) AS first_day FROM daily_counts GROUP BY version";

export interface ListPage {
  rows: ReportRow[];
  matched: number;
  /** Per fingerprint: every version and platform it was reported on. */
  versionsOf: Map<string, string[]>;
  platformsOf: Map<string, string[]>;
  /** Per fingerprint: reports per day, TREND_DAYS long, oldest first. Follows the version and platform filter. */
  trends: Map<string, number[]>;
  /** Reports per day and version over CHART_DAYS, for everything that matches the filter. */
  chart: DayCount[];
  /** All versions, newest first, and all platforms. Independent of the filter. */
  versions: string[];
  platforms: string[];
}

type Row = Record<string, string | number | null>;

function addTo(m: Map<string, string[]>, k: string, v: string): void {
  const list = m.get(k) ?? [];
  if (!list.includes(v)) list.push(v);
  m.set(k, list);
}

/** Everything the HTML index shows, in one round trip. */
export async function listPage(
  db: D1Database,
  f: ListFilter,
  sort: ListSort,
  today: number,
): Promise<ListPage> {
  const w = whereOf(f);
  const d = dailyCond(f);
  const pageOf = `SELECT fingerprint FROM reports ${w.sql} ORDER BY ${orderOf(sort)} LIMIT ?`;
  const res = await db.batch<Row>([
    db
      .prepare(`SELECT * FROM reports ${w.sql} ORDER BY ${orderOf(sort)} LIMIT ?`)
      .bind(...w.binds, f.limit),
    db.prepare(`SELECT COUNT(*) AS n FROM reports ${w.sql}`).bind(...w.binds),
    db
      .prepare(
        `SELECT fingerprint, version, platform FROM daily_counts
         WHERE fingerprint IN (${pageOf}) GROUP BY fingerprint, version, platform`,
      )
      .bind(...w.binds, f.limit),
    db
      .prepare(
        `SELECT fingerprint, day, SUM(count) AS n FROM daily_counts
         WHERE day > ?${d.sql} AND fingerprint IN (${pageOf}) GROUP BY fingerprint, day`,
      )
      .bind(today - TREND_DAYS, ...d.binds, ...w.binds, f.limit),
    db
      .prepare(
        `SELECT day, version, SUM(count) AS n FROM daily_counts
         WHERE day > ?${d.sql} AND fingerprint IN (SELECT fingerprint FROM reports ${w.sql})
         GROUP BY day, version`,
      )
      .bind(today - CHART_DAYS, ...d.binds, ...w.binds),
    db.prepare(VERSIONS_SQL),
    db.prepare("SELECT DISTINCT platform AS v FROM daily_counts ORDER BY platform LIMIT 12"),
  ]);
  const at = (i: number): Row[] => res[i]?.results ?? [];

  const versions = orderVersions(at(5) as { v: string; first_day: number }[]);
  const rank = new Map(versions.map((v, i) => [v, i]));
  const versionsOf = new Map<string, string[]>();
  const platformsOf = new Map<string, string[]>();
  for (const r of at(2)) {
    addTo(versionsOf, String(r.fingerprint), String(r.version));
    addTo(platformsOf, String(r.fingerprint), String(r.platform));
  }
  for (const list of versionsOf.values())
    list.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  for (const list of platformsOf.values()) list.sort();

  const trends = new Map<string, number[]>();
  for (const r of at(3)) {
    const fp = String(r.fingerprint);
    const days = trends.get(fp) ?? Array.from({ length: TREND_DAYS }, () => 0);
    const i = Number(r.day) - (today - TREND_DAYS + 1);
    if (i >= 0 && i < TREND_DAYS) days[i] = Number(r.n);
    trends.set(fp, days);
  }

  return {
    rows: at(0) as unknown as ReportRow[],
    matched: Number(at(1)[0]?.n ?? 0),
    versionsOf,
    platformsOf,
    trends,
    chart: at(4).map((r) => ({ day: Number(r.day), version: String(r.version), n: Number(r.n) })),
    versions,
    platforms: at(6).map((r) => String(r.v)),
  };
}

/** One fingerprint's reports per day and version over CHART_DAYS, plus the global version order. */
export async function dailyFor(
  db: D1Database,
  fingerprint: string,
  today: number,
): Promise<{ chart: DayCount[]; versions: string[] }> {
  const res = await db.batch<Row>([
    db
      .prepare(
        `SELECT day, version, SUM(count) AS n FROM daily_counts
         WHERE fingerprint = ? AND day > ? GROUP BY day, version`,
      )
      .bind(fingerprint, today - CHART_DAYS),
    db.prepare(VERSIONS_SQL),
  ]);
  return {
    chart: (res[0]?.results ?? []).map((r) => ({
      day: Number(r.day),
      version: String(r.version),
      n: Number(r.n),
    })),
    versions: orderVersions((res[1]?.results ?? []) as { v: string; first_day: number }[]),
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
